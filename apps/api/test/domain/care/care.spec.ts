import { describe, expect, it } from 'vitest';
import {
  applyCareAction,
  applyFeed,
  assertDailyGiftItemsAreStocked,
  assertFeedAllowance,
  assertFeedStockAvailable,
  buildFeedItemView,
  canPerformCareAction,
  canRecoverFromInjury,
  evaluateFeedAllowance,
  getCareActionCost,
  getDailyGiftItems,
  getFeedDailyLimit,
  getFeedPrice,
  isFeedStocked,
} from '../../../src/domain/care/care';
import {
  CareActionOnCooldownError,
  DailyFeedLimitReachedError,
  InsufficientFeedStockError,
  InvalidCareInputError,
  InvalidFeedTypeError,
} from '../../../src/domain/care/errors';
import { FEED_TYPES, parseFeedType } from '../../../src/domain/care/validation';
import careConfig from '../../../../../config/care.config.json';
import type { CareConfig } from '@at-sevdalisi/game-config';

const config = careConfig as unknown as CareConfig;
const vitals = { health: 80, fitness: 70, fatigue: 30, energy: 60, morale: 60 };
const health = { injuryRisk: 20, recoveryRate: 40, jointCondition: 70, weightCondition: 50 };

/** brief §11 Bakım Sistemi testleri. */
describe('applyCareAction — groom (tımar)', () => {
  it('moral ve health artırır', () => {
    const result = applyCareAction(config, 'groom', vitals, health, null, new Date());
    expect(result.vitals.morale).toBeGreaterThan(vitals.morale);
    expect(result.vitals.health).toBeGreaterThan(vitals.health);
  });
});

describe('cooldown kontrolü', () => {
  it('cooldown dolmadan tekrar eylem CareActionOnCooldownError fırlatır', () => {
    const now = new Date('2026-09-12T12:00:00Z');
    expect(() => applyCareAction(config, 'groom', vitals, health, now, now)).toThrow(CareActionOnCooldownError);
  });

  it('cooldown dolunca tekrar izin verir', () => {
    const now = new Date('2026-09-12T12:00:00Z');
    const later = new Date(now.getTime() + config.actions.groom.cooldownMinutes * 60 * 1000 + 1000);
    expect(canPerformCareAction(now, later, config.actions.groom.cooldownMinutes).allowed).toBe(true);
    expect(() => applyCareAction(config, 'groom', vitals, health, now, later)).not.toThrow();
  });
});

describe('applyCareAction — vet (veteriner) & farrier (nalbant)', () => {
  it('veteriner injuryRisk azaltır, recoveryRate artırır', () => {
    const result = applyCareAction(config, 'vet', vitals, health, null, new Date());
    expect(result.health.injuryRisk).toBeLessThan(health.injuryRisk);
    expect(result.health.recoveryRate).toBeGreaterThan(health.recoveryRate);
  });

  it('nalbant jointCondition artırır, injuryRisk azaltır', () => {
    const result = applyCareAction(config, 'farrier', vitals, health, null, new Date());
    expect(result.health.jointCondition).toBeGreaterThan(health.jointCondition);
    expect(result.health.injuryRisk).toBeLessThan(health.injuryRisk);
  });

  it('değerler [0, 100] aralığını aşmaz', () => {
    const nearMax = { injuryRisk: 2, recoveryRate: 99, jointCondition: 99, weightCondition: 50 };
    const result = applyCareAction(config, 'vet', vitals, nearMax, null, new Date());
    expect(result.health.recoveryRate).toBeLessThanOrEqual(100);
    expect(result.health.injuryRisk).toBeGreaterThanOrEqual(0);
  });
});

describe('applyCareAction — rest (dinlendir)', () => {
  it('fatigue azaltır, energy artırır', () => {
    const result = applyCareAction(config, 'rest', vitals, health, null, new Date());
    expect(result.vitals.fatigue).toBeLessThan(vitals.fatigue);
    expect(result.vitals.energy).toBeGreaterThan(vitals.energy);
  });
});

describe('applyFeed (brief §12)', () => {
  it('arpa enerjiyi en çok artıran kalemdir', () => {
    const result = applyFeed(config, 'arpa', vitals, health);
    expect(result.vitals.energy).toBeGreaterThan(vitals.energy);
    expect(result.vitals.energy - vitals.energy).toBeGreaterThan(
      applyFeed(config, 'mama', vitals, health).vitals.energy - vitals.energy,
    );
  });

  /**
   * "Pahalı = her zaman iyi" DEĞİLDİR (brief §12): `mama` elmas olarak
   * `arpa`'dan pahalıdır (3 > 2) ama enerji katkısı daha azdır — karşılığında
   * fitness verir. Bu, kalem seçiminin duruma göre anlamlı olmasını sağlar.
   */
  it('mama, arpa\'dan pahalı olduğu hâlde enerji katkısı daha azdır (fitness verir)', () => {
    expect(config.feedTypes.mama.price?.amount).toBeGreaterThan(config.feedTypes.arpa.price?.amount ?? 0);
    const arpa = applyFeed(config, 'arpa', vitals, health);
    const mama = applyFeed(config, 'mama', vitals, health);
    expect(mama.vitals.energy - vitals.energy).toBeLessThan(arpa.vitals.energy - vitals.energy);
    expect(mama.vitals.fitness - vitals.fitness).toBeGreaterThan(arpa.vitals.fitness - vitals.fitness);
  });

  it('havuç enerji VERMEZ ama moral ve toparlanma verir', () => {
    const result = applyFeed(config, 'havuc', vitals, health);
    expect(result.vitals.energy).toBe(vitals.energy);
    expect(result.vitals.morale).toBeGreaterThan(vitals.morale);
    expect(result.health.recoveryRate).toBeGreaterThan(health.recoveryRate);
  });

  it('saman energy artırır ve weightCondition\'a dokunmaz', () => {
    const result = applyFeed(config, 'saman', vitals, health);
    expect(result.vitals.energy).toBeGreaterThan(vitals.energy);
    expect(result.health.weightCondition).toBe(health.weightCondition);
  });

  it('arpa weightCondition artırır', () => {
    const result = applyFeed(config, 'arpa', vitals, health);
    expect(result.health.weightCondition).toBeGreaterThan(health.weightCondition);
  });
});

/**
 * AUDIT_REPORT.md H1 düzeltmesi (bu oturum): `injured` bir atın `vet`
 * bakımıyla `active`'e dönebilmesi için eşik kontrolü.
 */
describe('canRecoverFromInjury (AUDIT_REPORT.md H1)', () => {
  it('yalnızca config.injuryRecovery.action ile eşleşen eylem türü için true dönebilir', () => {
    // config.injuryRecovery.action === 'vet' (care.config.json).
    expect(canRecoverFromInjury(config, 'groom', 100, 0)).toBe(false);
    expect(canRecoverFromInjury(config, 'farrier', 100, 0)).toBe(false);
  });

  it('vet sonrası health ve injuryRisk eşikleri karşılanırsa true döner', () => {
    // care.config.json: injuryRecovery = { minHealth: 50, maxInjuryRisk: 40 }.
    expect(canRecoverFromInjury(config, 'vet', 50, 40)).toBe(true);
    expect(canRecoverFromInjury(config, 'vet', 100, 0)).toBe(true);
  });

  it('health eşiğin altındaysa false döner', () => {
    expect(canRecoverFromInjury(config, 'vet', 49, 0)).toBe(false);
  });

  it('injuryRisk eşiğin üstündeyse false döner', () => {
    expect(canRecoverFromInjury(config, 'vet', 100, 41)).toBe(false);
  });
});

describe('maliyet/fiyat okuma', () => {
  it('getCareActionCost ve getFeedPrice doğru değerleri döner', () => {
    expect(getCareActionCost(config, 'vet')).toEqual({ currency: 'money', amount: 250 });
    expect(getFeedPrice(config, 'arpa')).toEqual({ currency: 'gems', amount: 2 });
  });

  /**
   * `saman` BEDAVADIR: fiyatı YOKTUR (`undefined`). Bu, "fiyat 0"dan
   * FARKLIDIR — 0, "bedava satın alınabilir" diye okunurdu ve `saman`'ın
   * günlük sınırını (at başına 3) anlamsız kılardı.
   */
  it('saman\'ın fiyatı yoktur ve stoklanmaz', () => {
    expect(getFeedPrice(config, 'saman')).toBeUndefined();
    expect(isFeedStocked(config, 'saman')).toBe(false);
    expect(isFeedStocked(config, 'arpa')).toBe(true);
  });

  it('getFeedDailyLimit yalnızca saman için 3 döner, diğerleri null (sınırsız)', () => {
    expect(getFeedDailyLimit(config, 'saman')).toBe(3);
    expect(getFeedDailyLimit(config, 'arpa')).toBeNull();
  });
});

/** Bu turda EKLENDİ — günlük yem sınırı (kayan pencere). */
describe('evaluateFeedAllowance / assertFeedAllowance', () => {
  const now = new Date('2026-09-27T12:00:00Z');

  it('sınır tanımsızsa her zaman izin verir ve remainingToday null döner', () => {
    expect(evaluateFeedAllowance(undefined, 99, null, now, 24)).toEqual({
      allowed: true,
      remainingToday: null,
      remainingMinutes: 0,
    });
  });

  it('sınır dolmamışsa kalan hakkı döner', () => {
    expect(evaluateFeedAllowance(3, 1, new Date('2026-09-27T10:00:00Z'), now, 24)).toEqual({
      allowed: true,
      remainingToday: 2,
      remainingMinutes: 0,
    });
  });

  /**
   * Sınır dolduğunda yeni hakkı EN ESKİ kayıt açar — en yenisi değil:
   * 3 saman 10:00/11:00/12:00'de verildiyse ilk hak ertesi gün 10:00'da
   * açılır (12:00'de DEĞİL). Bu, `evaluateFeedAllowance` doc yorumunda
   * belgelenen davranıştır.
   */
  it('sınır dolduğunda kalan dakikayı EN ESKİ kayda göre hesaplar', () => {
    const result = evaluateFeedAllowance(3, 3, new Date('2026-09-27T10:00:00Z'), now, 24);
    expect(result.allowed).toBe(false);
    expect(result.remainingToday).toBe(0);
    // 10:00 + 24sa = ertesi gün 10:00 → şu andan 22 saat = 1320 dakika.
    expect(result.remainingMinutes).toBe(1320);
  });

  it('sınır doluyken ve en eski kayıt yoksa tam pencereyi bekletir (güvenli taraf)', () => {
    const result = evaluateFeedAllowance(3, 3, null, now, 24);
    expect(result.allowed).toBe(false);
    expect(result.remainingMinutes).toBe(1440);
  });

  it('assertFeedAllowance sınır dolduğunda DailyFeedLimitReachedError fırlatır', () => {
    expect(() => assertFeedAllowance('saman', 3, 3, new Date('2026-09-27T10:00:00Z'), now, 24)).toThrow(
      DailyFeedLimitReachedError,
    );
    expect(() => assertFeedAllowance('saman', 3, 2, new Date('2026-09-27T10:00:00Z'), now, 24)).not.toThrow();
  });
});

/** Bu turda EKLENDİ — stok kontrolü. */
describe('assertFeedStockAvailable', () => {
  it('stoklanmayan kalemde (saman) stok sorulmadan geçer', () => {
    expect(() => assertFeedStockAvailable(config, 'saman', 0)).not.toThrow();
  });

  it('stoklanan kalemde stok 0 ise InsufficientFeedStockError fırlatır', () => {
    expect(() => assertFeedStockAvailable(config, 'arpa', 0)).toThrow(InsufficientFeedStockError);
    expect(() => assertFeedStockAvailable(config, 'arpa', 1)).not.toThrow();
  });
});

/** Bu turda EKLENDİ — günlük hediye. */
describe('günlük hediye (feedDailyGift)', () => {
  it('config\'teki hediye kalemleri stoklanan kalemlerdir', () => {
    expect(() => assertDailyGiftItemsAreStocked(config)).not.toThrow();
    const items = getDailyGiftItems(config);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(isFeedStocked(config, item.type)).toBe(true);
      expect(item.count).toBeGreaterThan(0);
    }
  });

  it('stoklanmayan bir kalem hediye edilirse (saman) InvalidCareInputError fırlatır', () => {
    const broken: CareConfig = { ...config, feedDailyGift: { saman: 1 } };
    expect(() => assertDailyGiftItemsAreStocked(broken)).toThrow(InvalidCareInputError);
  });

  it('adedi pozitif olmayan bir hediye InvalidCareInputError fırlatır', () => {
    const broken: CareConfig = { ...config, feedDailyGift: { arpa: 0 } };
    expect(() => assertDailyGiftItemsAreStocked(broken)).toThrow(InvalidCareInputError);
  });
});

/** Bu turda EKLENDİ — kalem kataloğu satırı (iki uç nokta PAYLAŞIR). */
describe('buildFeedItemView', () => {
  it('stoklanan kalemde adedi olduğu gibi döner, stoklanmayanda null', () => {
    expect(buildFeedItemView(config, 'arpa', 5, null)).toEqual({
      type: 'arpa',
      price: { currency: 'gems', amount: 2 },
      stocked: true,
      dailyLimit: null,
      quantity: 5,
      fedInWindow: null,
    });
    // `saman` stoklanmaz → `quantity` 0 DEĞİL, null döner ("stok bitti"
    // diye okunmasın).
    expect(buildFeedItemView(config, 'saman', 0, null)).toEqual({
      type: 'saman',
      price: null,
      stocked: false,
      dailyLimit: 3,
      quantity: null,
      fedInWindow: null,
    });
  });

  it('fedInWindow yalnızca çağıran verdiyse dolar', () => {
    expect(buildFeedItemView(config, 'saman', 0, 2).fedInWindow).toBe(2);
  });
});

/** Bu turda EKLENDİ — `parseFeedType` (DTO doğrulamasına güvenilmez). */
describe('parseFeedType', () => {
  it('geçerli kalemleri olduğu gibi döner', () => {
    for (const type of FEED_TYPES) {
      expect(parseFeedType(type)).toBe(type);
    }
  });

  it('geçersiz değerler için InvalidFeedTypeError fırlatır', () => {
    expect(() => parseFeedType('performance')).toThrow(InvalidFeedTypeError);
    expect(() => parseFeedType(42)).toThrow(InvalidFeedTypeError);
    expect(() => parseFeedType(undefined)).toThrow(InvalidFeedTypeError);
  });
});

/**
 * FAZ 1 wiring, beşinci dilim — Antrenman dilimindeki CI Hata 7'nin
 * dersi (bkz. `domain/care/errors.ts` `InvalidCareInputError` üstündeki
 * not): DTO doğrulaması esbuild altında atlanabildiği için domain
 * katmanı BAĞIMSIZ olarak da doğrulamalı.
 */
describe('geçersiz bakım girdisi', () => {
  it('tanımsız bir eylem türü için InvalidCareInputError fırlatır', () => {
    expect(() =>
      applyCareAction(
        config,
        // @ts-expect-error — kasıtlı olarak geçersiz bir değer test ediliyor.
        'not-a-real-action',
        vitals,
        health,
        null,
        new Date(),
      ),
    ).toThrow(InvalidCareInputError);
  });

  it('tanımsız bir yem türü için InvalidCareInputError fırlatır', () => {
    expect(() =>
      applyFeed(
        config,
        // @ts-expect-error — kasıtlı olarak geçersiz bir değer test ediliyor.
        'not-a-real-feed',
        vitals,
        health,
      ),
    ).toThrow(InvalidCareInputError);
  });

  it('getCareActionCost/getFeedPrice tanımsız değerler için de aynı hatayı fırlatır', () => {
    // @ts-expect-error — kasıtlı olarak geçersiz bir değer test ediliyor.
    expect(() => getCareActionCost(config, 'not-a-real-action')).toThrow(InvalidCareInputError);
    // @ts-expect-error — kasıtlı olarak geçersiz bir değer test ediliyor.
    expect(() => getFeedPrice(config, 'not-a-real-feed')).toThrow(InvalidCareInputError);
  });
});

describe('applyCareAction — personel çarpanı (01.10.2026)', () => {
  it('çarpan 1 iken eski davranış; >1 iken bütün deltalar ölçeklenir', () => {
    const now = new Date();
    const plain = applyCareAction(config, 'vet', vitals, health, null, now);
    expect(applyCareAction(config, 'vet', vitals, health, null, now, 1)).toEqual(plain);

    const boosted = applyCareAction(config, 'vet', vitals, health, null, now, 1.25);
    const vet = config.actions.vet;
    expect(boosted.health.injuryRisk).toBeCloseTo(health.injuryRisk + (vet.injuryRiskDelta ?? 0) * 1.25, 10);
    expect(boosted.health.recoveryRate).toBeCloseTo(health.recoveryRate + (vet.recoveryRateDelta ?? 0) * 1.25, 10);

    const groomed = applyCareAction(config, 'groom', vitals, health, null, now, 1.1);
    expect(groomed.vitals.morale).toBeCloseTo(vitals.morale + (config.actions.groom.vitalDelta?.morale ?? 0) * 1.1, 10);
  });
});
