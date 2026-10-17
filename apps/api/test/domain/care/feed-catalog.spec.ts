import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCareConfig, type CareConfig } from '@at-sevdalisi/game-config';
import {
  applyFeed,
  assertFeedAllowedForLifeStage,
  assertVetPrescription,
  buildFeedItemView,
  computeUpbringingGain,
  validateUpbringingConfig,
} from '../../../src/domain/care/care';
import { FeedNotAllowedForAgeError, FeedRequiresVetCheckError } from '../../../src/domain/care/errors';
import { FEED_TYPES } from '../../../src/domain/care/validation';

/**
 * 16.10.2026 — yem / takviye / ilaç kataloğu + tay yemi (brief §7–§8).
 * Üç kopya birebir: config `feedTypes`, `FEED_TYPES`, en son migration CHECK'i.
 */
const config = loadCareConfig();
const MIGRATIONS = join(__dirname, '../../../../../database/migrations');

function latestFeedCheck(): { file: string; values: string[] } {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.up.sql'))
    .sort()
    .filter((name) => readFileSync(join(MIGRATIONS, name), 'utf8').includes('horse_feed_log_item_type_check') || name.startsWith('0030'));
  const file = files[files.length - 1]!;
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
  const block = /horse_feed_log[\s\S]*?CHECK \(item_type IN \(([\s\S]*?)\)\)/.exec(sql)!;
  return { file, values: [...block[1]!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!) };
}

describe('yem kataloğu (brief §8)', () => {
  it('config, FEED_TYPES ve en son migration CHECK\'i aynı küme', () => {
    const check = latestFeedCheck();
    expect(check.file).toBe('0095_feed_categories_and_foal_feed.up.sql');
    expect(new Set(Object.keys(config.feedTypes))).toEqual(new Set(FEED_TYPES));
    expect(new Set(check.values)).toEqual(new Set(FEED_TYPES));
  });

  it('her kalemin kategorisi ve kalite kademesi var; satılanlar oyun parasıyla (elmas politikası)', () => {
    for (const [type, effect] of Object.entries(config.feedTypes)) {
      expect(['feed', 'supplement', 'medicine', 'foal'], type).toContain(effect.category);
      expect(['basic', 'standard', 'premium'], type).toContain(effect.qualityTier);
      if (effect.price) expect(effect.price.currency, type).toBe('money');
    }
    for (const category of ['feed', 'supplement', 'medicine', 'foal']) {
      expect(Object.values(config.feedTypes).some((effect) => effect.category === category), category).toBe(true);
    }
    const view = buildFeedItemView(config, 'agri_kesici', 2, null);
    expect(view).toMatchObject({ category: 'medicine', requiresVetWithinHours: 24, allowedLifeStages: null });
    expect(buildFeedItemView(config, 'tay_yemi', 0, null).allowedLifeStages).toEqual(['foal', 'development']);
  });

  it('ilaç/takviye sakatlık riskini ve eklem durumunu değiştirir', () => {
    const vitals = { health: 80, fitness: 50, fatigue: 30, energy: 60, morale: 70 };
    const health = { injuryRisk: 20, recoveryRate: 50, jointCondition: 60, weightCondition: 50 };
    expect(applyFeed(config, 'agri_kesici', vitals, health).health.injuryRisk).toBe(20 + config.feedTypes.agri_kesici.injuryRiskDelta!);
    expect(applyFeed(config, 'eklem_takviyesi', vitals, health).health.jointCondition).toBe(
      60 + config.feedTypes.eklem_takviyesi.jointConditionDelta!,
    );
  });

  it('tay yemi yalnızca tay/gelişim çağına; ilaç son 24 saatte veteriner ister', () => {
    expect(() => assertFeedAllowedForLifeStage(config, 'tay_yemi', 'foal')).not.toThrow();
    expect(() => assertFeedAllowedForLifeStage(config, 'tay_yemi', 'prime')).toThrow(FeedNotAllowedForAgeError);
    expect(() => assertFeedAllowedForLifeStage(config, 'arpa', 'prime')).not.toThrow();
    const now = new Date('2026-10-16T12:00:00Z');
    expect(() => assertVetPrescription(config, 'agri_kesici', null, now)).toThrow(FeedRequiresVetCheckError);
    expect(() => assertVetPrescription(config, 'agri_kesici', new Date(now.getTime() - 25 * 3_600_000), now)).toThrow(
      FeedRequiresVetCheckError,
    );
    expect(() => assertVetPrescription(config, 'agri_kesici', new Date(now.getTime() - 3_600_000), now)).not.toThrow();
    expect(() => assertVetPrescription(config, 'arpa', null, now)).not.toThrow();
  });
});

describe('tay yetiştirme (brief §7)', () => {
  const stats = { speed: 40, stamina: 40, acceleration: 40, sprint: 40 };

  it('statlar sırayla döner, kazanç config\'ten; potansiyel tavanı ve ömür boyu sınır aşılmaz', () => {
    const gain = config.feedTypes.tay_yemi.upbringingStatGain!;
    const rotation = config.upbringing.statRotation;
    expect(computeUpbringingGain(config, 'tay_yemi', 0, stats, 80)).toEqual({ stat: rotation[0], newValue: 40 + gain, amount: gain });
    expect(computeUpbringingGain(config, 'tay_yemi', 1, stats, 80)?.stat).toBe(rotation[1 % rotation.length]);
    expect(computeUpbringingGain(config, 'tay_yemi', config.upbringing.maxFeedsPerHorse, stats, 80)).toBeNull();
    expect(computeUpbringingGain(config, 'tay_yemi', 0, { ...stats, speed: 80 }, 80)).toBeNull();
    expect(computeUpbringingGain(config, 'arpa', 0, stats, 80)).toBeNull();
    // Toplam yetiştirme katkısı küçüktür: tavan × kazanç.
    expect(config.upbringing.maxFeedsPerHorse * gain).toBeLessThanOrEqual(10);
  });

  it('yaşa sınırsız yetiştirme kazancı config\'i API\'yi açtırmaz', () => {
    expect(validateUpbringingConfig(config)).toEqual([]);
    const broken: CareConfig = structuredClone(config);
    delete broken.feedTypes.tay_yemi.allowedLifeStages;
    expect(validateUpbringingConfig(broken).join(' ')).toMatch(/yaş evresi/);
  });
});
