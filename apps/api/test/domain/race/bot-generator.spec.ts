import { describe, expect, it } from 'vitest';
import { generateBotEntrants } from '../../../src/domain/race/bot-generator';

/**
 * brief §18/§53 determinizm ilkesi burada bot üretimi için de geçerlidir
 * — `race-engine.spec.ts`'teki "aynı seed = aynı sonuç" testiyle AYNI
 * gerekçe.
 */
describe('generateBotEntrants (determinizm — brief §18)', () => {
  it('istenen sayıda bot üretir, her biri tekil bir horseId taşır', () => {
    const bots = generateBotEntrants(5, 'seed-a');

    expect(bots).toHaveLength(5);
    const ids = bots.map((bot) => bot.horseId);
    expect(new Set(ids).size).toBe(5);
  });

  it('aynı seedBase her zaman bit bit aynı bot statlarını üretir', () => {
    const first = generateBotEntrants(5, 'seed-a');
    const second = generateBotEntrants(5, 'seed-a');

    expect(second).toEqual(first);
  });

  it('farklı bir seedBase farklı bot statları üretir', () => {
    const first = generateBotEntrants(5, 'seed-a');
    const second = generateBotEntrants(5, 'seed-b');

    expect(second).not.toEqual(first);
  });

  it('tüm bot statlarını [0, 100] sınırları içinde üretir', () => {
    const bots = generateBotEntrants(5, 'seed-c');

    for (const bot of bots) {
      expect(bot.speed).toBeGreaterThanOrEqual(0);
      expect(bot.speed).toBeLessThanOrEqual(100);
      expect(bot.stamina).toBeGreaterThanOrEqual(0);
      expect(bot.stamina).toBeLessThanOrEqual(100);
      expect(bot.acceleration).toBeGreaterThanOrEqual(0);
      expect(bot.acceleration).toBeLessThanOrEqual(100);
      expect(bot.fitness).toBeGreaterThanOrEqual(0);
      expect(bot.fitness).toBeLessThanOrEqual(100);
    }
  });

  it('sıfır bot istenirse boş dizi döner', () => {
    expect(generateBotEntrants(0, 'seed-d')).toEqual([]);
  });
});
