import { describe, expect, it } from 'vitest';
import type { EconomyConfig, RaceTierConfig } from '@at-sevdalisi/game-config';
import economyConfigJson from '../../../../../config/economy.config.json';
import {
  applyPracticeRaceStakes,
  computeRacePayoutTotal,
  computeRacePool,
  computeRaceRakeAmount,
  getDefaultRaceTier,
  getRacePrize,
  getRaceTierById,
  validateRaceTiers,
} from '../../../src/domain/race/prize';
import { PRIZE_DISTRIBUTION_SHARE_TOLERANCE, resolvePrizeDistribution } from '../../../src/domain/race/prize-distribution';
import { InsufficientFundsError } from '../../../src/domain/economy/errors';

/**
 * FAZ 1 wiring, dokuzuncu dilim — `player.spec.ts`/`market.spec.ts` ile
 * AYNI desen: gerçek `config/economy.config.json` içe aktarılır (elle
 * kurulmuş kısmi bir fixture DEĞİL) — böylece bu testler config dosyası
 * değiştiğinde de anlamlı kalır.
 *
 * ## Neden bu dosya yeniden yazıldı (27.09.2026)
 *
 * Denetimde (docs/ECONOMY_AUDIT.md) **CRITICAL E7** olarak işaretlenen
 * sınırsız para musluğu, ödülün SABİT bir tablodan gelmesinden ve
 * botların hiçbir şey ödememesinden kaynaklanıyordu: giriş 50, beklenen
 * ödül 80 → oyuncu başına +30 Çip/yarış, sonsuz tekrarlanabilir. Denetimin
 * E30 bulgusu da tam olarak şunu söylüyordu: "ödül tablosu için beklenen
 * değer (EV) testi YOK". Bu dosya artık:
 *
 *  1. Config'in DEĞİŞMEZLERİNİ test eder (`validateRaceTiers`) — en
 *     önemlisi "dağıtılan ödül havuzdan KÜÇÜK olmalı" (E7'nin yapısal
 *     çözümü). Config elle düzenlenebilir bir JSON olduğundan, bu
 *     değişmez ancak bir testle korunabilir.
 *  2. EV'yi test eder (E30): eşit güçte N katılımcı varsayımıyla beklenen
 *     NET sonuç NEGATİF olmalı, yani yarış bir Çip KAYNAĞI değil
 *     Çip HAVUZU (sink) olmalıdır.
 *
 * ## §42 PHASE 5 — oranlar artık kademede DEĞİL
 *
 * `RaceTierConfig.payoutShares` kaldırıldı; kademe bir `distributionId`
 * taşır ve oranlar `economy.config.json` → `prizeDistributions` altında
 * TEK KEZ yazılır (lobi yarışı da aynı tabloyu kullanır). Bu yüzden
 * aşağıdaki "yapay bozuk config" testleri artık dağıtımı da kurar, ve
 * pay dizisinin KENDİ değişmezleri (toplam/azalan/pozitif)
 * `prize-distribution.spec.ts`te ayrıca test edilir — burada yalnızca
 * `validateRaceTiers`'ın onları GERÇEKTEN raporladığı doğrulanır.
 */
const economyConfig = economyConfigJson as unknown as EconomyConfig;

/**
 * Kademenin ödül oranları — `distributionId`'nin çözülmüş hâli. Testler
 * de üretim kodunun AYNI yolundan okur (`resolvePrizeDistribution`);
 * sabit bir dizi yazılsaydı config değişince test yalan söylerdi.
 */
function sharesOf(tier: RaceTierConfig): readonly number[] {
  return resolvePrizeDistribution(economyConfig, tier.distributionId)?.shares ?? [];
}

describe('raceTiers yapılandırması (değişmezler)', () => {
  it('validateRaceTiers gerçek config için HİÇBİR sorun bildirmez', () => {
    // Bu testin kendisi bir "config lint"tir: config dosyası bozulursa
    // (ör. bir pay dizisine fazladan bir basamak eklenirse) burada kırılır.
    expect(validateRaceTiers(economyConfig)).toEqual([]);
  });

  it('en az bir kademe vardır ve varsayılan kademe listenin ilkidir', () => {
    expect(economyConfig.raceTiers.length).toBeGreaterThan(0);
    expect(getDefaultRaceTier(economyConfig)).toBe(economyConfig.raceTiers[0]);
  });

  it('proje sahibinin istediği alan büyüklükleri (8/10/12/14/16) tanımlıdır', () => {
    expect(economyConfig.raceTiers.map((tier) => tier.fieldSize)).toEqual([8, 10, 12, 14, 16]);
  });

  it('kademe kimlikleri tekildir', () => {
    const ids = economyConfig.raceTiers.map((tier) => tier.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getRaceTierById var olan kimliği bulur, olmayan için null döner', () => {
    const first = economyConfig.raceTiers[0] as RaceTierConfig;
    expect(getRaceTierById(economyConfig, first.id)).toBe(first);
    expect(getRaceTierById(economyConfig, 'boyle-bir-kademe-yok')).toBeNull();
  });

  it('her kademenin dağıtım referansı ÇÖZÜLÜR (yazım hatası sessizce ödülsüz bırakmasın)', () => {
    for (const tier of economyConfig.raceTiers) {
      expect(resolvePrizeDistribution(economyConfig, tier.distributionId)).not.toBeNull();
      expect(sharesOf(tier).length).toBeGreaterThan(0);
    }
  });

  /**
   * Boş bir `raceTiers` ile `validateRaceTiers`'ın SESSİZCE geçmediğini
   * kanıtlar — `economy-currency.spec.ts`'teki "boş küme sessizce
   * geçmesin" ilkesiyle AYNI gerekçe: aksi hâlde config'ten tüm kademeleri
   * silmek testleri YEŞİL bırakırdı.
   */
  it('kademe listesi boşsa bunu bir SORUN olarak bildirir', () => {
    expect(validateRaceTiers({ ...economyConfig, raceTiers: [] }).length).toBeGreaterThan(0);
  });

  it('dağıtım tablosu boşsa bunu bir SORUN olarak bildirir', () => {
    expect(validateRaceTiers({ ...economyConfig, prizeDistributions: [] }).length).toBeGreaterThan(0);
  });
});

describe('kademe değişmezleri (yapay bozuk config ile)', () => {
  /** Geçerli bir dağıtım: toplam tam `1 − raceRake` (0.9), azalan, pozitif. */
  const validShares = [0.5, 0.4];
  const baseTier: RaceTierConfig = {
    id: 'test',
    label: 'Test Koşusu',
    fieldSize: 8,
    entryFee: 100,
    distributionId: 'test-dist',
  };

  /**
   * Tek kademeli + tek dağıtımlı yapay bir config. `shares` verilmezse
   * geçerli olan kullanılır; böylece her test yalnızca BOZMAK istediği
   * alanı yazar ve diğer değişmezler yanlışlıkla ihlal edilmez.
   *
   * ⚠️ Dağıtımın kimliği `tier.distributionId`DEN TÜRETİLMEZ, sabit
   * `baseTier.distributionId`dir. Türetilseydi "çözülemeyen distributionId"
   * testi KENDİNİ bozardı: bozuk kimlik yazıldığında ona uyan bir dağıtım
   * da yaratılır, referans yine çözülür ve hata hiç üretilmezdi (yaşandı,
   * 28.09.2026 — test yeşil sanılıp aslında hiçbir şey denetlemiyordu).
   */
  const configWith = (tier: RaceTierConfig, shares: number[] = validShares): EconomyConfig => ({
    ...economyConfig,
    raceRake: 0.1,
    raceTiers: [tier],
    prizeDistributions: [{ id: baseTier.distributionId, label: 'Test Dağıtımı', shares }],
  });

  it('pay toplamı 1 − raceRake değilse hata bildirir', () => {
    const problems = validateRaceTiers(configWith(baseTier, [0.5, 0.5]));
    expect(problems.some((problem) => problem.includes('toplamı'))).toBe(true);
  });

  /**
   * CRITICAL E7'nin ÖZÜ: pay toplamı 1.0'ı aşan bir dağıtım → "yarış para
   * basıyor" demektir. İki kontrol de (pay toplamı + havuz karşılaştırması)
   * bunu yakalamalıdır.
   */
  it('paylar havuzu aşarsa (para basan config) hata bildirir', () => {
    const problems = validateRaceTiers(configWith(baseTier, [0.8, 0.5]));
    expect(problems.some((problem) => problem.includes('havuzdan'))).toBe(true);
  });

  it('alan büyüklüğünden fazla ödül sırası tanımlanırsa hata bildirir', () => {
    // 4 sıraya ödül var ama alanda yalnızca 2 at koşuyor: 3. ve 4. sıraya
    // ödül tanımlamak "yarışa katılmayan bir sıraya para vermek" olurdu.
    const problems = validateRaceTiers(configWith({ ...baseTier, fieldSize: 2 }, [0.4, 0.25, 0.15, 0.1]));
    expect(problems.some((problem) => problem.includes('fieldSize'))).toBe(true);
  });

  it('azalan olmayan pay dizisini hata olarak bildirir (1. sıra en çok kazanmalı)', () => {
    const problems = validateRaceTiers(configWith(baseTier, [0.4, 0.5]));
    expect(problems.some((problem) => problem.includes('azalan'))).toBe(true);
  });

  it('pozitif olmayan bir payı hata olarak bildirir', () => {
    const problems = validateRaceTiers(configWith(baseTier, [0.9, 0]));
    expect(problems.some((problem) => problem.includes('pozitif'))).toBe(true);
  });

  /**
   * §42 PHASE 5'in EN SESSİZ HATASI: `distributionId` yazımı yanlış
   * (`top5` yerine `top55`) olduğunda `getRaceTierShares` boş dizi döner ve
   * kademe HİÇ ödül ödemez. Hiçbir istisna fırlamaz, hiçbir ekran uyarı
   * vermez — yalnızca herkes kaybeder. Bu yüzden test zamanında
   * yakalanması ŞARTTIR.
   */
  it('çözülemeyen bir distributionId hata olarak bildirilir (sessiz ödülsüzlük olmasın)', () => {
    const problems = validateRaceTiers(configWith({ ...baseTier, distributionId: 'boyle-bir-dagitim-yok' }));
    expect(problems.some((problem) => problem.includes('distributionId'))).toBe(true);
  });

  it('geçersiz fieldSize (1 veya kesirli) ve entryFee (0) hata olarak bildirilir', () => {
    expect(validateRaceTiers(configWith({ ...baseTier, fieldSize: 1 })).length).toBeGreaterThan(0);
    expect(validateRaceTiers(configWith({ ...baseTier, fieldSize: 8.5 })).length).toBeGreaterThan(0);
    expect(validateRaceTiers(configWith({ ...baseTier, entryFee: 0 })).length).toBeGreaterThan(0);
  });

  it('tekrarlanan kimlik ve boş label hata olarak bildirilir', () => {
    const duplicated: EconomyConfig = {
      ...configWith(baseTier),
      raceTiers: [baseTier, { ...baseTier }],
    };
    expect(validateRaceTiers(duplicated).some((problem) => problem.includes('tekrar'))).toBe(true);
    expect(
      validateRaceTiers(configWith({ ...baseTier, label: '  ' })).some((problem) => problem.includes('label')),
    ).toBe(true);
  });
});

describe('computeRacePool', () => {
  it('havuz = giriş ücreti × alan büyüklüğü (botlar da ödemiş sayılır)', () => {
    const tier = economyConfig.raceTiers[0] as RaceTierConfig;
    expect(computeRacePool(tier)).toBe(tier.entryFee * tier.fieldSize);
  });

  it('her kademede havuz, tek bir giriş ücretinden büyüktür', () => {
    for (const tier of economyConfig.raceTiers) {
      expect(computeRacePool(tier)).toBeGreaterThan(tier.entryFee);
    }
  });
});

describe('getRacePrize', () => {
  it('1. sıra en yüksek ödülü alır, sıra düştükçe ödül azalır', () => {
    for (const tier of economyConfig.raceTiers) {
      const prizes = sharesOf(tier).map((_, index) => getRacePrize(economyConfig, tier, index + 1));
      for (let index = 1; index < prizes.length; index += 1) {
        expect(prizes[index] as number).toBeLessThan(prizes[index - 1] as number);
      }
    }
  });

  it('her ödül bir TAM SAYIdır (money birimi — kayan nokta `wallet.ts`te patlar)', () => {
    for (const tier of economyConfig.raceTiers) {
      for (let position = 1; position <= tier.fieldSize; position += 1) {
        expect(Number.isInteger(getRacePrize(economyConfig, tier, position))).toBe(true);
      }
    }
  });

  it('ödül = havuz × pay (yuvarlanmış)', () => {
    const tier = economyConfig.raceTiers[0] as RaceTierConfig;
    const share = sharesOf(tier)[0] as number;
    expect(getRacePrize(economyConfig, tier, 1)).toBe(Math.round(computeRacePool(tier) * share));
  });

  it('ödül alan sıra sayısının dışındaki bir sıralama için 0 döner (çökme yok)', () => {
    const tier = economyConfig.raceTiers[0] as RaceTierConfig;
    const outOfRange = sharesOf(tier).length + 1;
    expect(getRacePrize(economyConfig, tier, outOfRange)).toBe(0);
    expect(getRacePrize(economyConfig, tier, tier.fieldSize)).toBe(0);
  });

  it('geçersiz (0 veya negatif) bir sıralama için de 0 döner', () => {
    const tier = economyConfig.raceTiers[0] as RaceTierConfig;
    expect(getRacePrize(economyConfig, tier, 0)).toBe(0);
    expect(getRacePrize(economyConfig, tier, -1)).toBe(0);
  });

  /**
   * §42 PHASE 5: `distributionId` çözülemezse ödül 0'dır — çökme YOK.
   * İstek yolunda bozuk bir config'in 500'e dönüşmemesi bilinçlidir; asıl
   * yakalama yeri `validateRaceTiers`tır (yukarıdaki test).
   */
  it('çözülemeyen bir dağıtımda ödül 0 döner (istek yolunda 500 yok)', () => {
    const broken: RaceTierConfig = { ...(economyConfig.raceTiers[0] as RaceTierConfig), distributionId: 'yok' };
    expect(getRacePrize(economyConfig, broken, 1)).toBe(0);
  });
});

/**
 * CRITICAL E7'nin ve E30'un doğrudan testi. `economy-currency.spec.ts`teki
 * "boş küme sessizce geçmesin" ilkesiyle AYNI gerekçe: döngülerin
 * GERÇEKTEN koştuğu ayrıca doğrulanır, aksi hâlde `raceTiers` boşalırsa
 * bu describe bloğu hiçbir şey test etmeden YEŞİL kalırdı.
 */
describe('para bütünlüğü — yarış asla Çip BASMAZ (denetim bulgusu E7/E30)', () => {
  it('test edilecek kademe vardır (boş küme sessizce geçmesin)', () => {
    expect(economyConfig.raceTiers.length).toBeGreaterThan(0);
  });

  it('her kademede dağıtılan toplam ödül havuzdan KÜÇÜKTÜR (kesinti pozitif)', () => {
    for (const tier of economyConfig.raceTiers) {
      expect(computeRacePayoutTotal(economyConfig, tier)).toBeLessThan(computeRacePool(tier));
      expect(computeRaceRakeAmount(economyConfig, tier)).toBeGreaterThan(0);
    }
  });

  it('gerçekleşen kesinti, ilan edilen raceRake oranına yakındır (±%1)', () => {
    // Yuvarlama pay başına en fazla 0.5 Çip saptırabildiğinden kesin
    // eşitlik beklenmez; %1'lik bant hem yuvarlamayı hem de config'de
    // yanlış bir pay yazılmasını ayırt etmeye yeter.
    for (const tier of economyConfig.raceTiers) {
      const actualRakeRatio = computeRaceRakeAmount(economyConfig, tier) / computeRacePool(tier);
      expect(Math.abs(actualRakeRatio - economyConfig.raceRake)).toBeLessThan(0.01);
    }
  });

  it('eşit güçte bir alanda oyuncunun beklenen NET sonucu NEGATİFTİR (EV ≤ 0)', () => {
    // P(sıra i) ≈ 1/fieldSize varsayımıyla EV(ödül) = Σ ödül / fieldSize.
    // Net = EV(ödül) − entryFee. Kesinti oranı kadar, yani negatif olmalı.
    for (const tier of economyConfig.raceTiers) {
      const expectedPrize = computeRacePayoutTotal(economyConfig, tier) / tier.fieldSize;
      const expectedNet = expectedPrize - tier.entryFee;
      expect(expectedNet).toBeLessThan(0);
      // Kayıp TAM OLARAK kesinti kadardır: EV(net) = −rake × entryFee.
      expect(Math.abs(expectedNet - -economyConfig.raceRake * tier.entryFee)).toBeLessThan(
        economyConfig.raceRake * tier.entryFee * 0.1,
      );
    }
  });

  it('kesinti oranı config’te makul bir aralıktadır (0 < rake < 0.5)', () => {
    // Proje sahibinin kararı ~%10'du; bu test onun sessizce 0'a (para
    // musluğu) ya da %50'ye (oyuncuyu boğan) kaymasını engeller.
    expect(economyConfig.raceRake).toBeGreaterThan(0);
    expect(economyConfig.raceRake).toBeLessThan(0.5);
  });

  it('pay toplamı ile raceRake arasındaki tolerans gerçek hataları gizlemeyecek kadar dardır', () => {
    for (const distribution of economyConfig.prizeDistributions) {
      const total = distribution.shares.reduce((sum, share) => sum + share, 0);
      expect(Math.abs(total - (1 - economyConfig.raceRake))).toBeLessThan(PRIZE_DISTRIBUTION_SHARE_TOLERANCE);
    }
  });
});

/**
 * BULUNAN HATA (CI, geçmiş oturum): `applyPracticeRaceStakes` yazılmadan
 * önce bu mantık doğrudan use-case içinde `credit(afterEntryFee, prizeWon,
 * 'money')` olarak yazılmıştı. Eski ödül tablosunun son sırası BİLEREK 0
 * olduğundan, son sırayı bitiren her oyuncu için `wallet.ts`'in "sıfır
 * olmayan pozitif miktar" kuralına takılıp `InvalidAmountError`
 * fırlatıyordu — bu, eşlenmediği için istemciye `500 Internal Server
 * Error` olarak dönüyordu. Yeni modelde ödülsüz bitirmek İSTİSNA DEĞİL
 * OLAĞAN yoldur (her kademede ödül alan sıra sayısı alan büyüklüğünden
 * azdır), yani bu koruma artık çok daha sık devreye girer.
 */
describe('applyPracticeRaceStakes', () => {
  it('giriş ücretini düşer, ödülü ekler (normal durum)', () => {
    const result = applyPracticeRaceStakes({ money: 1000, gems: 0 }, 50, 200);
    expect(result.money).toBe(1000 - 50 + 200);
  });

  it('ödül SIFIR iken (ödül almayan sıra) çökmeden, sadece giriş ücretini düşer', () => {
    const result = applyPracticeRaceStakes({ money: 1000, gems: 0 }, 50, 0);
    expect(result.money).toBe(1000 - 50);
  });

  it('giriş ücreti SIFIR iken (varsayımsal ücretsiz yarış) çökmeden, sadece ödülü ekler', () => {
    const result = applyPracticeRaceStakes({ money: 1000, gems: 0 }, 0, 200);
    expect(result.money).toBe(1000 + 200);
  });

  it('hem giriş ücreti hem ödül SIFIR iken bakiyeyi hiç değiştirmez', () => {
    const result = applyPracticeRaceStakes({ money: 1000, gems: 0 }, 0, 0);
    expect(result.money).toBe(1000);
  });

  it('bakiye giriş ücretine yetmiyorsa InsufficientFundsError fırlatır (ödül eklenmiş olsa bile)', () => {
    expect(() => applyPracticeRaceStakes({ money: 10, gems: 0 }, 50, 200)).toThrow(InsufficientFundsError);
  });

  it('gems alanını değiştirmeden korur', () => {
    const result = applyPracticeRaceStakes({ money: 1000, gems: 42 }, 50, 0);
    expect(result.gems).toBe(42);
  });

  /**
   * Uçtan uca "asla para basmaz" kontrolü — saf bakiye fonksiyonu
   * üzerinden: en İYİ ihtimalde (1. sıra) bile net sonuç, havuzun
   * dağıtılmayan kısmından KÜÇÜK ya da eşit bir KAZANÇTIR, asla havuzun
   * tamamı değildir.
   */
  it('1. sıradaki kazanç bile havuzun tamamından azdır (kesinti gerçekten alınır)', () => {
    for (const tier of economyConfig.raceTiers) {
      const afterRace = applyPracticeRaceStakes(
        { money: tier.entryFee, gems: 0 },
        tier.entryFee,
        getRacePrize(economyConfig, tier, 1),
      );
      expect(afterRace.money).toBeLessThan(computeRacePool(tier));
    }
  });
});
