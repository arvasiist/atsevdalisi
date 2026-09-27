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
  RACE_TIER_SHARE_TOLERANCE,
  validateRaceTiers,
} from '../../../src/domain/race/prize';
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
 */
const economyConfig = economyConfigJson as unknown as EconomyConfig;

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

  /**
   * Boş bir `raceTiers` ile `validateRaceTiers`'ın SESSİZCE geçmediğini
   * kanıtlar — `economy-currency.spec.ts`'teki "boş küme sessizce
   * geçmesin" ilkesiyle AYNI gerekçe: aksi hâlde config'ten tüm kademeleri
   * silmek testleri YEŞİL bırakırdı.
   */
  it('kademe listesi boşsa bunu bir SORUN olarak bildirir', () => {
    expect(validateRaceTiers({ ...economyConfig, raceTiers: [] }).length).toBeGreaterThan(0);
  });
});

describe('kademe değişmezleri (yapay bozuk config ile)', () => {
  const baseTier: RaceTierConfig = {
    id: 'test',
    label: 'Test Koşusu',
    fieldSize: 8,
    entryFee: 100,
    payoutShares: [0.5, 0.4],
  };
  const configWith = (tier: RaceTierConfig): EconomyConfig => ({
    ...economyConfig,
    raceRake: 0.1,
    raceTiers: [tier],
  });

  it('pay toplamı 1 − raceRake değilse hata bildirir', () => {
    const problems = validateRaceTiers(configWith({ ...baseTier, payoutShares: [0.5, 0.5] }));
    expect(problems.some((problem) => problem.includes('toplamı'))).toBe(true);
  });

  /**
   * CRITICAL E7'nin ÖZÜ: pay toplamı 1.0 (yani kesinti YOK) ve havuzu
   * AŞAN bir dağıtım → "yarış para basıyor" demektir. İki kontrol de
   * (pay toplamı + havuz karşılaştırması) bunu yakalamalıdır.
   */
  it('paylar havuzu aşarsa (para basan config) hata bildirir', () => {
    const problems = validateRaceTiers(configWith({ ...baseTier, payoutShares: [0.8, 0.5] }));
    expect(problems.some((problem) => problem.includes('havuzdan'))).toBe(true);
  });

  it('alan büyüklüğünden fazla ödül sırası tanımlanırsa hata bildirir', () => {
    const problems = validateRaceTiers(
      configWith({ ...baseTier, fieldSize: 2, payoutShares: [0.5, 0.2, 0.1, 0.1] }),
    );
    expect(problems.some((problem) => problem.includes('fieldSize'))).toBe(true);
  });

  it('azalan olmayan pay dizisini hata olarak bildirir (1. sıra en çok kazanmalı)', () => {
    const problems = validateRaceTiers(configWith({ ...baseTier, payoutShares: [0.4, 0.5] }));
    expect(problems.some((problem) => problem.includes('azalan'))).toBe(true);
  });

  it('pozitif olmayan bir payı hata olarak bildirir', () => {
    const problems = validateRaceTiers(configWith({ ...baseTier, payoutShares: [0.9, 0] }));
    expect(problems.some((problem) => problem.includes('pozitif'))).toBe(true);
  });

  it('geçersiz fieldSize (1 veya kesirli) ve entryFee (0) hata olarak bildirilir', () => {
    expect(validateRaceTiers(configWith({ ...baseTier, fieldSize: 1 })).length).toBeGreaterThan(0);
    expect(validateRaceTiers(configWith({ ...baseTier, fieldSize: 8.5 })).length).toBeGreaterThan(0);
    expect(validateRaceTiers(configWith({ ...baseTier, entryFee: 0 })).length).toBeGreaterThan(0);
  });

  it('tekrarlanan kimlik ve boş label hata olarak bildirilir', () => {
    const duplicated: EconomyConfig = {
      ...economyConfig,
      raceRake: 0.1,
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
      const prizes = tier.payoutShares.map((_, index) => getRacePrize(tier, index + 1));
      for (let index = 1; index < prizes.length; index += 1) {
        expect(prizes[index] as number).toBeLessThan(prizes[index - 1] as number);
      }
    }
  });

  it('her ödül bir TAM SAYIdır (money birimi — kayan nokta `wallet.ts`te patlar)', () => {
    for (const tier of economyConfig.raceTiers) {
      for (let position = 1; position <= tier.fieldSize; position += 1) {
        expect(Number.isInteger(getRacePrize(tier, position))).toBe(true);
      }
    }
  });

  it('ödül = havuz × pay (yuvarlanmış)', () => {
    const tier = economyConfig.raceTiers[0] as RaceTierConfig;
    const share = tier.payoutShares[0] as number;
    expect(getRacePrize(tier, 1)).toBe(Math.round(computeRacePool(tier) * share));
  });

  it('ödül alan sıra sayısının dışındaki bir sıralama için 0 döner (çökme yok)', () => {
    const tier = economyConfig.raceTiers[0] as RaceTierConfig;
    const outOfRange = tier.payoutShares.length + 1;
    expect(getRacePrize(tier, outOfRange)).toBe(0);
    expect(getRacePrize(tier, tier.fieldSize)).toBe(0);
  });

  it('geçersiz (0 veya negatif) bir sıralama için de 0 döner', () => {
    const tier = economyConfig.raceTiers[0] as RaceTierConfig;
    expect(getRacePrize(tier, 0)).toBe(0);
    expect(getRacePrize(tier, -1)).toBe(0);
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
      expect(computeRacePayoutTotal(tier)).toBeLessThan(computeRacePool(tier));
      expect(computeRaceRakeAmount(tier)).toBeGreaterThan(0);
    }
  });

  it('gerçekleşen kesinti, ilan edilen raceRake oranına yakındır (±%1)', () => {
    // Yuvarlama pay başına en fazla 0.5 Çip saptırabildiğinden kesin
    // eşitlik beklenmez; %1'lik bant hem yuvarlamayı hem de config'de
    // yanlış bir pay yazılmasını ayırt etmeye yeter.
    for (const tier of economyConfig.raceTiers) {
      const actualRakeRatio = computeRaceRakeAmount(tier) / computeRacePool(tier);
      expect(Math.abs(actualRakeRatio - economyConfig.raceRake)).toBeLessThan(0.01);
    }
  });

  it('eşit güçte bir alanda oyuncunun beklenen NET sonucu NEGATİFTİR (EV ≤ 0)', () => {
    // P(sıra i) ≈ 1/fieldSize varsayımıyla EV(ödül) = Σ ödül / fieldSize.
    // Net = EV(ödül) − entryFee. Kesinti oranı kadar, yani negatif olmalı.
    for (const tier of economyConfig.raceTiers) {
      const expectedPrize = computeRacePayoutTotal(tier) / tier.fieldSize;
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
    for (const tier of economyConfig.raceTiers) {
      const total = tier.payoutShares.reduce((sum, share) => sum + share, 0);
      expect(Math.abs(total - (1 - economyConfig.raceRake))).toBeLessThan(RACE_TIER_SHARE_TOLERANCE);
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
      const afterRace = applyPracticeRaceStakes({ money: tier.entryFee, gems: 0 }, tier.entryFee, getRacePrize(tier, 1));
      expect(afterRace.money).toBeLessThan(computeRacePool(tier));
    }
  });
});
