import { describe, expect, it } from 'vitest';
import {
  STARTER_HORSE_AGE_MONTHS,
  STARTER_HORSE_NAMES,
  STARTER_HORSE_POTENTIAL,
  STARTER_HORSE_QUALITY,
  createStarterHorse,
  pickStarterHorseName,
} from '../../../src/domain/horse/horse';
import { InvalidHorseNameError } from '../../../src/domain/horse/errors';
import { getLifeStage } from '../../../src/domain/horse/age-curve';
import { loadHorseGrowthConfig } from '@at-sevdalisi/game-config';

describe('createStarterHorse', () => {
  const now = new Date('2026-09-12T00:00:00.000Z');

  it('brief §7/§9 alanlarını doğru başlangıç değerleriyle doldurur', () => {
    const horse = createStarterHorse({ id: 'horse-1', ownerId: 'player-1', name: 'Yıldız', now });

    expect(horse.id).toBe('horse-1');
    expect(horse.ownerId).toBe('player-1');
    expect(horse.name).toBe('Yıldız');
    expect(horse.gender).toBe('gelding');
    expect(horse.level).toBe(1);
    expect(horse.xp).toBe(0);
    expect(horse.quality).toBe(STARTER_HORSE_QUALITY);
    expect(horse.potential).toBe(STARTER_HORSE_POTENTIAL);
    expect(horse.health).toBe(100);
    expect(horse.fitness).toBe(50);
    expect(horse.fatigue).toBe(0);
    expect(horse.energy).toBe(100);
    expect(horse.morale).toBe(80);
    expect(horse.status).toBe('active');
    expect(horse.sireId).toBeNull();
    expect(horse.damId).toBeNull();
    expect(horse.weightKg).toBeNull();
  });

  it('isim baştaki/sondaki boşlukları kırpar', () => {
    const horse = createStarterHorse({ id: 'horse-1', ownerId: 'player-1', name: '  Rüzgar  ', now });
    expect(horse.name).toBe('Rüzgar');
  });

  it('çok kısa isim için InvalidHorseNameError fırlatır', () => {
    expect(() => createStarterHorse({ id: 'horse-1', ownerId: 'player-1', name: 'A', now })).toThrow(
      InvalidHorseNameError,
    );
  });

  it('doğum tarihi, atın "prime" evresinde (antrenmana/yarışa hazır) olacak şekilde ayarlanır', () => {
    const horse = createStarterHorse({ id: 'horse-1', ownerId: 'player-1', name: 'Yıldız', now });
    const config = loadHorseGrowthConfig();
    const stage = getLifeStage(STARTER_HORSE_AGE_MONTHS, config);
    expect(stage.name).toBe('prime');
    expect(new Date(horse.birthDate).getTime()).toBeLessThan(now.getTime());
  });
});

describe('pickStarterHorseName', () => {
  it('0 için ilk ismi döner', () => {
    expect(pickStarterHorseName(0)).toBe(STARTER_HORSE_NAMES[0]);
  });

  it("0.999... (1'e en yakın değer) için son ismi döner", () => {
    expect(pickStarterHorseName(0.9999999)).toBe(STARTER_HORSE_NAMES[STARTER_HORSE_NAMES.length - 1]);
  });

  it('geçerli aralık dışındaki değerlerde bile havuzdaki bir isme sınırlanır (clamp)', () => {
    expect(STARTER_HORSE_NAMES).toContain(pickStarterHorseName(-1));
    expect(STARTER_HORSE_NAMES).toContain(pickStarterHorseName(2));
  });

  it('aynı girdi için her zaman aynı ismi döner (saf fonksiyon)', () => {
    expect(pickStarterHorseName(0.42)).toBe(pickStarterHorseName(0.42));
  });
});
