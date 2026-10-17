import { describe, expect, it } from 'vitest';
import { loadCareConfig, loadTrainingConfig } from '@at-sevdalisi/game-config';
import {
  computeHorseNeeds,
  computeNeed,
  hungerFeedTypes,
  toHorseNeedsView,
  validateNeedsConfig,
} from '../../../src/domain/care/needs';
import { calculateStatGain } from '../../../src/domain/training/training';

/** 17.10.2026 (brief §14) — yem/su ihtiyacı: son beslenme/sudan türetilir. */
const care = loadCareConfig();
const HOUR = 3_600_000;
const now = new Date('2026-10-17T12:00:00Z');
const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

describe('yem/su ihtiyacı (17.10.2026)', () => {
  it('gerçek config geçerli; karın doyuran yemler takviye/ilaç değil', () => {
    expect(validateNeedsConfig(care)).toEqual([]);
    const types = hungerFeedTypes(care);
    expect(types).toContain('saman');
    expect(types).toContain('tay_yemi');
    expect(types).not.toContain('vitamin');
    expect(types).not.toContain('agri_kesici');
  });

  it('düzey sınırları: aralık içinde ok, iki katına kadar due, ötesi urgent (sınır dahil)', () => {
    expect(computeNeed(ago(24), ago(100), 24, now).level).toBe('ok');
    expect(computeNeed(ago(24.01), ago(100), 24, now).level).toBe('due');
    expect(computeNeed(ago(48), ago(100), 24, now).level).toBe('due');
    expect(computeNeed(ago(48.01), ago(100), 24, now).level).toBe('urgent');
    expect(computeNeed(ago(5), ago(100), 24, now).dueAt.getTime()).toBe(ago(5).getTime() + 24 * HOUR);
  });

  it('hiç beslenmemiş at çıpadan ölçülür; çıpadan önceki beslenme sayılmaz', () => {
    expect(computeNeed(null, ago(1), 24, now)).toMatchObject({ level: 'ok', satisfiedAt: ago(1) });
    expect(computeNeed(ago(200), ago(30), 24, now)).toMatchObject({ level: 'due', satisfiedAt: ago(30) });
  });

  it('antrenman çarpanı en kötü ihtiyacın düzeyi; görünüm ISO taşır', () => {
    const factors = care.needs.trainingFactorByLevel;
    const fed = computeHorseNeeds({ lastFedAt: ago(1), lastWateredAt: ago(1), anchorAt: ago(500) }, now, care.needs);
    expect(fed.trainingFactor).toBe(1);
    const thirsty = computeHorseNeeds(
      { lastFedAt: ago(1), lastWateredAt: ago(care.needs.waterIntervalHours * 2 + 1), anchorAt: ago(500) },
      now,
      care.needs,
    );
    expect(thirsty).toMatchObject({ feed: { level: 'ok' }, water: { level: 'urgent' }, trainingFactor: factors.urgent });
    const hungry = computeHorseNeeds(
      { lastFedAt: ago(care.needs.feedIntervalHours + 1), lastWateredAt: ago(1), anchorAt: ago(500) },
      now,
      care.needs,
    );
    expect(hungry.trainingFactor).toBe(factors.due);
    expect(toHorseNeedsView(hungry)).toEqual({
      feed: { level: 'due', lastAt: ago(care.needs.feedIntervalHours + 1).toISOString(), dueAt: ago(1).toISOString() },
      water: { level: 'ok', lastAt: ago(1).toISOString(), dueAt: new Date(ago(1).getTime() + care.needs.waterIntervalHours * HOUR).toISOString() },
      trainingFactor: factors.due,
    });
  });

  it('antrenman kazancı çarpanla ölçeklenir; çarpan 1 eski formülle bit bit aynı', () => {
    const ctx = {
      trainingType: 'speed' as const,
      intensity: 'medium' as const,
      durationMinutes: 30,
      currentStatValue: 50,
      potential: 90,
      vitals: { health: 100, fitness: 50, fatigue: 0, energy: 100, morale: 50 },
    };
    const training = loadTrainingConfig();
    const base = calculateStatGain(training, ctx);
    expect(calculateStatGain(training, { ...ctx, needsFactor: 1 })).toBe(base);
    expect(calculateStatGain(training, { ...ctx, needsFactor: 0.75 })).toBeCloseTo(base * 0.75, 12);
  });

  it('bozuk config reddedilir', () => {
    const broken = {
      ...care,
      needs: { ...care.needs, feedCategories: ['medicine-yok'], trainingFactorByLevel: { ok: 0.9, due: 0.5, urgent: 0.8 } },
    };
    const problems = validateNeedsConfig(broken);
    expect(problems.some((p) => p.includes('feedCategories'))).toBe(true);
    expect(problems.some((p) => p.includes('.ok'))).toBe(true);
    expect(problems.some((p) => p.includes('acil'))).toBe(true);
  });
});
