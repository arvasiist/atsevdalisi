import { describe, expect, it } from 'vitest';
import type { EconomyConfig, PrizeDistributionConfig } from '@at-sevdalisi/game-config';
import economyConfigJson from '../../../../../config/economy.config.json';
import lobbyConfigJson from '../../../../../config/race-lobby.config.json';
import {
  computePrizeMultiplier,
  computePrizePayoutTotal,
  computePrizePayouts,
  computePrizePool,
  describeRacePrizeEconomics,
  resolvePrizeDistribution,
  validatePrizeDistributions,
} from '../../../src/domain/race/prize-distribution';

/**
 * §42 PHASE 5 — ÖDÜL HAVUZU + ÇARPAN (brief §3 "PRIZE POOL", §4 "ÇARPAN /
 * MULTIPLIER SİSTEMİ").
 *
 * `prize.spec.ts` KADEMELİ yolu (pratik yarış) test eder; bu dosya
 * KADEMESİZ matematiği test eder — lobi yarışı ile pratik yarışın
 * PAYLAŞTIĞI kısım. Brief §4'ün açık şartı budur: "çarpan hesaplama Race
 * Engine'den ayrı bir domain/service olmalı" — bu dosya o servisin
 * sözleşmesidir.
 *
 * Config dosyaları GERÇEKTEN okunur (elle kurulmuş fixture DEĞİL),
 * `prize.spec.ts` ile aynı gerekçeyle: config bozulursa test kırılsın.
 */
const economyConfig = economyConfigJson as unknown as EconomyConfig;
const lobbyConfig = lobbyConfigJson as { paidEntryFeeOptions: number[]; fieldSizes: number[]; prizeDistributionId: string };

describe('computePrizePayouts / computePrizePayoutTotal', () => {
  it('her sıraya havuz × pay düşer, YUVARLANMIŞ (money birimi tam sayıdır)', () => {
    expect(computePrizePayouts(1000, [0.375, 0.225, 0.15, 0.1, 0.05])).toEqual([375, 225, 150, 100, 50]);
  });

  it('dönen dizi oranlar dizisiyle AYNI uzunluktadır (sıra sayısını havuz belirlemez)', () => {
    expect(computePrizePayouts(400, [0.5, 0.4])).toHaveLength(2);
    expect(computePrizePayouts(400, [0.375, 0.225, 0.15, 0.1, 0.05])).toHaveLength(5);
    expect(computePrizePayouts(400, [])).toEqual([]);
  });

  it('kesirli sonuçlar en yakın tam sayıya yuvarlanır (kayan nokta `wallet.ts`te patlar)', () => {
    // 333 × 0.375 = 124.875 → 125. Yuvarlama olmasaydı `credit()` içindeki
    // `Number.isInteger` kontrolü `InvalidAmountError` fırlatır ve istemciye
    // 500 dönerdi.
    const payouts = computePrizePayouts(333, [0.375, 0.225, 0.15, 0.1, 0.05]);
    for (const amount of payouts) {
      expect(Number.isInteger(amount)).toBe(true);
    }
    expect(payouts[0]).toBe(125);
  });

  it('toplam, tek tek toplamların aynısıdır (iki yol ayrışmaz)', () => {
    const pool = 1000;
    const shares = [0.375, 0.225, 0.15, 0.1, 0.05];
    const payouts = computePrizePayouts(pool, shares);
    expect(computePrizePayoutTotal(pool, shares)).toBe(payouts.reduce((sum, amount) => sum + amount, 0));
  });

  /**
   * PARA BÜTÜNLÜĞÜ (denetim bulgusu E7) — YUVARLAMADAN SONRA da geçerli
   * olmalı. Pay toplamı `1 − raceRake` olduğu için bu matematiksel olarak
   * beklenir; test, yuvarlamanın (pay başına en fazla 0.5 Çip) bu
   * garantiyi boyamadığını ULAŞILABİLİR havuzlarda kanıtlar.
   */
  it('en küçük ulaşılabilir lobi havuzunda bile dağıtılan toplam havuzdan KÜÇÜKTÜR', () => {
    // Lobi yarışının en küçük ayarı: 50 Çip giriş × 8 at (config/race-lobby.config.json).
    const smallestFee = Math.min(...lobbyConfig.paidEntryFeeOptions);
    const smallestField = Math.min(...lobbyConfig.fieldSizes);
    const shares = resolvePrizeDistribution(economyConfig, lobbyConfig.prizeDistributionId)?.shares ?? [];

    const pool = computePrizePool(smallestFee, smallestField);
    expect(pool).toBe(400);
    expect(computePrizePayoutTotal(pool, shares)).toBeLessThan(pool);
  });

  it('her lobi giriş ücreti × her lobi alan büyüklüğünde yarış para BASMAZ', () => {
    const shares = resolvePrizeDistribution(economyConfig, lobbyConfig.prizeDistributionId)?.shares ?? [];
    for (const entryFee of lobbyConfig.paidEntryFeeOptions) {
      for (const fieldSize of lobbyConfig.fieldSizes) {
        const pool = computePrizePool(entryFee, fieldSize);
        expect(computePrizePayoutTotal(pool, shares)).toBeLessThan(pool);
      }
    }
  });
});

describe('computePrizePool', () => {
  it('havuz = giriş ücreti × katılımcı sayısı (brief §3: "10 oyuncu × 100 coin = 1000 coin")', () => {
    expect(computePrizePool(100, 10)).toBe(1000);
  });

  it('katılımcı yoksa havuz sıfırdır (vaat edilecek bir şey yok)', () => {
    expect(computePrizePool(100, 0)).toBe(0);
  });
});

describe('computePrizeMultiplier — brief §4 "gerçek zamanlı katılıma göre değişir"', () => {
  it('çarpan = havuz × en yüksek pay ÷ giriş ücreti', () => {
    // 10 × 100 = 1000 havuz, top5 dağıtımı (ilk pay 0.375) → 375 / 100 = 3.75
    expect(computePrizeMultiplier(1000, 100, [0.375, 0.225])).toBeCloseTo(3.75, 10);
  });

  /**
   * Brief §4'ün istediği "merdiven" DAVRANIŞI: katılım arttıkça çarpan
   * artar. Ayrı bir çarpan tablosu tutulmadığı için bu, havuzun
   * katılımla büyümesinden KENDİLİĞİNDEN gelir — test bunu kilitler.
   */
  it('katılımcı sayısı arttıkça çarpan ARTAR (sabit bir tablo değil)', () => {
    const shares = [0.375, 0.225];
    const entryFee = 100;
    const multipliers = [8, 10, 12, 14, 16].map((players) =>
      computePrizeMultiplier(computePrizePool(entryFee, players), entryFee, shares),
    );
    for (let index = 1; index < multipliers.length; index += 1) {
      expect(multipliers[index] as number).toBeGreaterThan(multipliers[index - 1] as number);
    }
  });

  it('çarpan TAM OLARAK katılımcı sayısı × ilk paydır (gösterilen = ödenen)', () => {
    const shares = [0.375, 0.225];
    for (const players of [8, 10, 12, 14, 16]) {
      const pool = computePrizePool(100, players);
      expect(computePrizeMultiplier(pool, 100, shares)).toBeCloseTo(players * (shares[0] as number), 10);
    }
  });

  /**
   * `null` ile `0` AYRI ŞEYLERDİR. `0` "çarpan var ve sıfır" diye okunurdu;
   * doğru ifade "bu yarışta çarpan kavramı yok"tur ve istemci bu durumda
   * çarpanı hiç göstermez.
   */
  it('ücretsiz yarışta, boş havuzda ve boş dağıtımda `null` döner (0 DEĞİL)', () => {
    expect(computePrizeMultiplier(800, 0, [0.375])).toBeNull();
    expect(computePrizeMultiplier(800, -100, [0.375])).toBeNull();
    expect(computePrizeMultiplier(0, 100, [0.375])).toBeNull();
    expect(computePrizeMultiplier(1000, 100, [])).toBeNull();
  });

  it('geçerli bir yarışta asla `null` dönmez (çarpan gizlenmez)', () => {
    expect(computePrizeMultiplier(800, 100, [0.375, 0.225])).not.toBeNull();
  });
});

describe('describeRacePrizeEconomics — brief §4’ün dört büyüklüğü tek çağrıda', () => {
  it('brief §4 örneğini birebir üretir: 10 oyuncu × 100 coin = 1000 havuz', () => {
    const economics = describeRacePrizeEconomics({
      entryFee: 100,
      participantCount: 10,
      pool: 1000,
      shares: [0.375, 0.225, 0.15, 0.1, 0.05],
    });

    expect(economics.entryFee).toBe(100);
    expect(economics.participantCount).toBe(10);
    expect(economics.prizePool).toBe(1000);
    expect(economics.multiplier).toBeCloseTo(3.75, 10);
    expect(economics.topPrize).toBe(375);
    expect(economics.payouts).toEqual([375, 225, 150, 100, 50]);
  });

  it('topPrize her zaman payouts[0]’dır (iki alan ayrışmaz)', () => {
    const economics = describeRacePrizeEconomics({ entryFee: 250, participantCount: 12, pool: 3000, shares: [0.34, 0.21] });
    expect(economics.topPrize).toBe(economics.payouts[0]);
  });

  it('ödül sırası tanımsızsa topPrize 0’dır ve çarpan `null`dır (çökme yok)', () => {
    const economics = describeRacePrizeEconomics({ entryFee: 100, participantCount: 8, pool: 800, shares: [] });
    expect(economics.topPrize).toBe(0);
    expect(economics.multiplier).toBeNull();
    expect(economics.payouts).toEqual([]);
  });

  it('havuz DIŞARIDAN verilir (kademe için entryFee×fieldSize, lobi için `races.prize_pool`)', () => {
    // Aynı girdilerle iki farklı havuz → iki farklı çarpan. Havuzun
    // nereden geldiğine bu dosya karar VERMEZ; kararı çağıran verir.
    const shares = [0.375];
    const small = describeRacePrizeEconomics({ entryFee: 100, participantCount: 4, pool: 400, shares });
    const big = describeRacePrizeEconomics({ entryFee: 100, participantCount: 10, pool: 1000, shares });
    expect(small.multiplier).toBeCloseTo(1.5, 10);
    expect(big.multiplier).toBeCloseTo(3.75, 10);
  });
});

describe('resolvePrizeDistribution', () => {
  it('gerçek config’teki dağıtımları bulur', () => {
    for (const distribution of economyConfig.prizeDistributions) {
      expect(resolvePrizeDistribution(economyConfig, distribution.id)).toBe(distribution);
    }
  });

  it('olmayan kimlik için `null` döner — varsayılana DÜŞÜLMEZ (config hatası gizlenmesin)', () => {
    expect(resolvePrizeDistribution(economyConfig, 'boyle-bir-dagitim-yok')).toBeNull();
  });

  it('lobi yarışının varsayılan dağıtımı gerçekten vardır (sessiz ödülsüzlük olmasın)', () => {
    const resolved = resolvePrizeDistribution(economyConfig, lobbyConfig.prizeDistributionId);
    expect(resolved).not.toBeNull();
    expect((resolved as PrizeDistributionConfig).shares.length).toBeGreaterThan(0);
  });
});

describe('validatePrizeDistributions (değişmezler)', () => {
  const withDistributions = (distributions: PrizeDistributionConfig[], raceRake = 0.1): EconomyConfig => ({
    ...economyConfig,
    raceRake,
    prizeDistributions: distributions,
  });
  const valid: PrizeDistributionConfig = { id: 'ok', label: 'Geçerli', shares: [0.5, 0.4] };

  it('gerçek config için HİÇBİR sorun bildirmez', () => {
    expect(validatePrizeDistributions(economyConfig)).toEqual([]);
  });

  it('boş tabloyu hata olarak bildirir (boş küme sessizce geçmesin)', () => {
    expect(validatePrizeDistributions(withDistributions([])).length).toBeGreaterThan(0);
  });

  it('pay toplamı 1 − raceRake değilse hata bildirir', () => {
    const problems = validatePrizeDistributions(withDistributions([{ ...valid, shares: [0.5, 0.5] }]));
    expect(problems.some((problem) => problem.includes('toplamı'))).toBe(true);
  });

  it('azalan olmayan pay dizisini hata olarak bildirir (1. sıra en çok kazanmalı)', () => {
    const problems = validatePrizeDistributions(withDistributions([{ ...valid, shares: [0.4, 0.5] }]));
    expect(problems.some((problem) => problem.includes('azalan'))).toBe(true);
  });

  it('eşit payları da hata olarak bildirir (azalan DEĞİL)', () => {
    const problems = validatePrizeDistributions(withDistributions([{ ...valid, shares: [0.45, 0.45] }]));
    expect(problems.some((problem) => problem.includes('azalan'))).toBe(true);
  });

  it('pozitif olmayan bir payı hata olarak bildirir', () => {
    const problems = validatePrizeDistributions(withDistributions([{ ...valid, shares: [0.9, 0] }]));
    expect(problems.some((problem) => problem.includes('pozitif'))).toBe(true);
  });

  it('boş pay dizisini hata olarak bildirir (ödül alacak sıra tanımsız)', () => {
    const problems = validatePrizeDistributions(withDistributions([{ ...valid, shares: [] }]));
    expect(problems.some((problem) => problem.includes('shares boş'))).toBe(true);
  });

  it('boş id ve boş label hata olarak bildirilir', () => {
    expect(
      validatePrizeDistributions(withDistributions([{ ...valid, id: '  ' }])).some((problem) => problem.includes('id')),
    ).toBe(true);
    expect(
      validatePrizeDistributions(withDistributions([{ ...valid, label: ' ' }])).some((problem) =>
        problem.includes('label'),
      ),
    ).toBe(true);
  });

  it('tekrarlanan dağıtım kimliği hata olarak bildirilir', () => {
    const problems = validatePrizeDistributions(withDistributions([valid, { ...valid }]));
    expect(problems.some((problem) => problem.includes('tekrar'))).toBe(true);
  });

  /**
   * Kesinti oranı değişirse TÜM dağıtımların toplamı da değişmek zorundadır;
   * bu test, "raceRake'i oynatıp payları unutma" hatasının yakalandığını
   * kanıtlar.
   */
  it('raceRake değişince pay toplamı uyuşmazlığı yakalanır', () => {
    expect(validatePrizeDistributions(withDistributions([valid], 0.2)).length).toBeGreaterThan(0);
  });

  it('fırlatmaz — sorunları DÖNER (tek çağrıyla tümünü görmek için)', () => {
    expect(() => validatePrizeDistributions(withDistributions([]))).not.toThrow();
  });
});
