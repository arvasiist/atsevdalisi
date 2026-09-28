import { describe, expect, it } from 'vitest';
import { loadEconomyConfig, loadRaceConfig, type RaceTierConfig } from '@at-sevdalisi/game-config';
import {
  DEFAULT_RACE_TIER_ID,
  findRaceTier,
  formatMultiplier,
  formatRakePercent,
  getPayoutMultiplier,
  getRaceEntryBlocker,
  getTopPayoutMultipliers,
  RACE_ENTRY_BLOCKER_LABELS,
  RACE_RAKE,
  RACE_TIERS,
} from '../../../src/features/race/race-entry';

/**
 * Proje sahibinin açık talebi (27.09.2026) — "yarışlar ücretli olsun, verilen
 * ücret kadarıyla giriş yapan kişiler çarpan olsun ve bir yarışta 8 / 10 / 12
 * / 14 / 16 at koşabilsin, hazır olan kişiler yarışabilsinler".
 *
 * `career-tier.spec.ts` ile AYNI desen: config GERÇEKTEN okunur (elle
 * kurulmuş bir fixture DEĞİL) ve testler config ile ekranın AYNI şeyi
 * söylediğini doğrular. Buradaki testlerin asıl değeri şu: istemci kendi
 * fiyat/çarpan tablosunu UYDURURSA (ki `race-entry.ts` bilinçli olarak
 * config'i okur) ya da sunucunun hazır olma eşiklerinden kayarsa burada
 * kırılır.
 */
const economyConfig = loadEconomyConfig();
const raceConfig = loadRaceConfig();

/**
 * Kademenin ödül oranları — §42 PHASE 5'ten beri kademede DEĞİL,
 * `prizeDistributions` tablosunda ve `distributionId` ile bağlanır.
 * Testler de ekranla AYNI yoldan (config'ten) okur; sabit bir dizi
 * yazılsaydı config değişince test yalan söylerdi.
 */
function sharesOf(tier: RaceTierConfig): readonly number[] {
  return economyConfig.prizeDistributions.find((distribution) => distribution.id === tier.distributionId)?.shares ?? [];
}

describe('RACE_TIERS — config ile birebir aynı liste', () => {
  it('kademe listesi doğrudan economy.config.json`dan gelir (kopya DEĞİL)', () => {
    expect(RACE_TIERS).toBe(economyConfig.raceTiers);
  });

  it('proje sahibinin istediği alan büyüklükleri (8/10/12/14/16) sırayla tanımlıdır', () => {
    expect(RACE_TIERS.map((tier) => tier.fieldSize)).toEqual([8, 10, 12, 14, 16]);
  });

  it('varsayılan kademe listenin İLKİdir ve sunucudaki varsayılanla aynı kuraldır', () => {
    expect(DEFAULT_RACE_TIER_ID).toBe(RACE_TIERS[0]?.id);
    expect(findRaceTier(DEFAULT_RACE_TIER_ID)).toBe(RACE_TIERS[0]);
  });

  it('her kademenin giriş ücreti pozitiftir (yarışlar ÜCRETLİdir)', () => {
    for (const tier of RACE_TIERS) {
      expect(tier.entryFee).toBeGreaterThan(0);
    }
  });

  it('alan büyüklüğü arttıkça giriş ücreti de artar (kademeler anlamlı sıralıdır)', () => {
    for (let index = 1; index < RACE_TIERS.length; index += 1) {
      expect(RACE_TIERS[index]!.entryFee).toBeGreaterThan(RACE_TIERS[index - 1]!.entryFee);
    }
  });
});

describe('findRaceTier', () => {
  it('var olan kimliği bulur, olmayan ve null için null döner (çökme yok)', () => {
    const first = RACE_TIERS[0] as RaceTierConfig;
    expect(findRaceTier(first.id)).toBe(first);
    expect(findRaceTier('boyle-bir-kademe-yok')).toBeNull();
    expect(findRaceTier(null)).toBeNull();
  });
});

describe('getPayoutMultiplier — "verilen ücret kadarıyla çarpan"', () => {
  it('1. sıra çarpanı alan büyüklüğüyle BİRLİKTE büyür (sabit bir tablo DEĞİL)', () => {
    const firsts = RACE_TIERS.map((tier) => getPayoutMultiplier(tier, 1));
    for (let index = 1; index < firsts.length; index += 1) {
      expect(firsts[index]!).toBeGreaterThan(firsts[index - 1]!);
    }
  });

  it('çarpan TAM OLARAK pay × alan büyüklüğüdür (ödül = giriş × çarpan)', () => {
    for (const tier of RACE_TIERS) {
      const shares = sharesOf(tier);
      for (let position = 1; position <= shares.length; position += 1) {
        const share = shares[position - 1] as number;
        expect(getPayoutMultiplier(tier, position)).toBeCloseTo(share * tier.fieldSize, 10);
      }
    }
  });

  it('ödül almayan sıra için 0 döner (ödülsüz bitirmek OLAĞAN yoldur)', () => {
    for (const tier of RACE_TIERS) {
      expect(getPayoutMultiplier(tier, sharesOf(tier).length + 1)).toBe(0);
      expect(getPayoutMultiplier(tier, tier.fieldSize)).toBe(0);
      expect(getPayoutMultiplier(tier, 0)).toBe(0);
    }
  });

  /**
   * KADEME BAŞINA BİR KONTROL: çarpan, havuzun kesintiden sonra kalan kısmını
   * AŞAMAZ. Aksi hâlde ekranda "3.5× kazanırsın" yazarken sunucu daha azını
   * öderdi — yani ekran yalan söylerdi. (Sunucu tarafındaki asıl "para
   * basmaz" değişmezi `apps/api/test/domain/race/prize.spec.ts`te.)
   */
  it('tüm sıraların çarpan toplamı, kesintiden sonra kalan oranı aşmaz', () => {
    for (const tier of RACE_TIERS) {
      const totalMultiplier = sharesOf(tier).reduce((sum, share) => sum + share * tier.fieldSize, 0);
      expect(totalMultiplier).toBeLessThanOrEqual(tier.fieldSize * (1 - RACE_RAKE) + 1e-9);
    }
  });
});

describe('getTopPayoutMultipliers', () => {
  it('istenen sayıda çarpanı 1. sıradan başlayarak azalan sırayla döner', () => {
    const tier = RACE_TIERS[0] as RaceTierConfig;
    const top = getTopPayoutMultipliers(tier, 3);
    expect(top).toHaveLength(3);
    expect(top[0]).toBe(getPayoutMultiplier(tier, 1));
    expect(top[1]).toBeLessThan(top[0] as number);
    expect(top[2]).toBeLessThan(top[1] as number);
  });

  it('istenenden fazla sıra istenirse mevcut sıra sayısıyla sınırlanır (taşma yok)', () => {
    const tier = RACE_TIERS[0] as RaceTierConfig;
    expect(getTopPayoutMultipliers(tier, 99)).toHaveLength(sharesOf(tier).length);
    expect(getTopPayoutMultipliers(tier, 0)).toEqual([]);
    expect(getTopPayoutMultipliers(tier, -1)).toEqual([]);
  });
});

describe('biçimlendirme', () => {
  it('çarpan iki ondalıkla ve × işaretiyle yazılır', () => {
    expect(formatMultiplier(3)).toBe('3.00×');
    expect(formatMultiplier(4.8)).toBe('4.80×');
  });

  it('kesinti yüzde olarak yuvarlanır', () => {
    expect(formatRakePercent(0.1)).toBe('%10');
    expect(formatRakePercent(0)).toBe('%0');
  });

  it('config`teki kesinti oranı proje sahibinin kararına yakındır (~%10)', () => {
    // Bu test, kesintinin sessizce 0'a (para musluğu) kaymasını engeller —
    // `apps/api/test/domain/race/prize.spec.ts`teki AYNI aralık kontrolü.
    expect(RACE_RAKE).toBeGreaterThan(0);
    expect(RACE_RAKE).toBeLessThan(0.5);
  });
});

describe('getRaceEntryBlocker — "hazır olan kişiler yarışabilsinler"', () => {
  /** Yeni bir başlangıç atının değerleri (`createStarterHorse`). */
  const healthy = { status: 'active' as const, health: 100, fatigue: 0, energy: 100 };

  it('eşikler GERÇEK config/race.config.json`dan okunur (kopya DEĞİL)', () => {
    expect(raceConfig.readiness.minEnergy).toBeGreaterThan(0);
    expect(raceConfig.readiness.maxFatigue).toBeLessThan(100);
    expect(raceConfig.readiness.minHealth).toBeGreaterThan(0);
  });

  it('hazır bir at için null döner (düğme kilitlenmez)', () => {
    expect(getRaceEntryBlocker(healthy)).toBeNull();
  });

  it('eşik değerlerinde SINIRDA olmak engel DEĞİLDİR (sunucuyla aynı kural)', () => {
    const borderline = {
      ...healthy,
      health: raceConfig.readiness.minHealth,
      fatigue: raceConfig.readiness.maxFatigue,
      energy: raceConfig.readiness.minEnergy,
    };
    expect(getRaceEntryBlocker(borderline)).toBeNull();
  });

  it('her engel için doğru gerekçe döner', () => {
    expect(getRaceEntryBlocker({ ...healthy, status: 'injured' })).toBe('HORSE_NOT_ACTIVE');
    expect(getRaceEntryBlocker({ ...healthy, status: 'resting' })).toBe('HORSE_NOT_ACTIVE');
    expect(getRaceEntryBlocker({ ...healthy, health: raceConfig.readiness.minHealth - 1 })).toBe(
      'INSUFFICIENT_HEALTH',
    );
    expect(getRaceEntryBlocker({ ...healthy, fatigue: raceConfig.readiness.maxFatigue + 1 })).toBe('HORSE_TOO_TIRED');
    expect(getRaceEntryBlocker({ ...healthy, energy: raceConfig.readiness.minEnergy - 1 })).toBe(
      'INSUFFICIENT_ENERGY',
    );
  });

  /**
   * Sunucudaki `checkRaceReadiness` ile AYNI SIRA: birden fazla koşul ihlal
   * edilse bile TEK ve ÖNGÖRÜLEBİLİR bir neden döner. Sıra kayarsa ekrandaki
   * mesaj ile sunucunun döndürdüğü `error.code` farklı olurdu.
   */
  it('birden fazla koşul ihlal edilse bile sunucuyla AYNI tek nedeni döner', () => {
    const allBad = { status: 'retired' as const, health: 0, fatigue: 100, energy: 0 };
    expect(getRaceEntryBlocker(allBad)).toBe('HORSE_NOT_ACTIVE');
    expect(getRaceEntryBlocker({ ...allBad, status: 'active' })).toBe('INSUFFICIENT_HEALTH');
    expect(getRaceEntryBlocker({ ...allBad, status: 'active', health: 100 })).toBe('HORSE_TOO_TIRED');
    expect(getRaceEntryBlocker({ ...allBad, status: 'active', health: 100, fatigue: 0 })).toBe('INSUFFICIENT_ENERGY');
  });

  it('her engelin Türkçe bir etiketi vardır (ekranda boş mesaj çıkmaz)', () => {
    for (const blocker of ['HORSE_NOT_ACTIVE', 'INSUFFICIENT_HEALTH', 'HORSE_TOO_TIRED', 'INSUFFICIENT_ENERGY'] as const) {
      expect(RACE_ENTRY_BLOCKER_LABELS[blocker].length).toBeGreaterThan(0);
    }
  });

  it('yarış eşikleri antrenman eşiklerinden DAHA SIKIdır (yorgun at antrenmana girebilir, yarışa giremez)', () => {
    expect(raceConfig.readiness.minEnergy).toBeGreaterThan(15);
    expect(raceConfig.readiness.maxFatigue).toBeLessThan(90);
  });
});
