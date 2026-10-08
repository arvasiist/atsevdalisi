import { describe, expect, it } from 'vitest';
import {
  BREEDS_CONFIG,
  SHOP_BREEDS,
  bestDistance,
  breedAvailability,
  breedLabel,
  isStarterBreed,
} from '../../../src/features/breeds/breed-catalog';

describe('ırk kataloğu (istemci)', () => {
  it('anahtar Türkçe ada çevrilir; katalogda olmayan eski metin olduğu gibi kalır', () => {
    expect(breedLabel('thoroughbred')).toBe('Safkan İngiliz');
    expect(breedLabel('hinis')).toBe('Hınıs');
    expect(breedLabel('Arap')).toBe('Arap');
  });

  it('mağaza ucuzdan pahalıya sıralı; en ucuz ırk ücretsiz başlangıç ırkıdır', () => {
    for (let index = 1; index < SHOP_BREEDS.length; index += 1) {
      expect(SHOP_BREEDS[index]!.priceMoney).toBeGreaterThanOrEqual(SHOP_BREEDS[index - 1]!.priceMoney);
    }
    expect(isStarterBreed(SHOP_BREEDS[0]!.key)).toBe(true);
    expect(SHOP_BREEDS).toHaveLength(BREEDS_CONFIG.breeds.length);
  });

  it('düğme ipucu: önce seviye, sonra bakiye', () => {
    const breed = BREEDS_CONFIG.breeds.find((candidate) => candidate.key === 'thoroughbred')!;
    expect(breedAvailability(breed, breed.minPlayerLevel - 1, breed.priceMoney)).toBe('level');
    expect(breedAvailability(breed, breed.minPlayerLevel, breed.priceMoney - 1)).toBe('money');
    expect(breedAvailability(breed, breed.minPlayerLevel, breed.priceMoney)).toBe('ok');
  });

  it('en iyi mesafe ırkın profilinden', () => {
    const quarter = BREEDS_CONFIG.breeds.find((candidate) => candidate.key === 'quarter_horse')!;
    const arabian = BREEDS_CONFIG.breeds.find((candidate) => candidate.key === 'arabian')!;
    expect(bestDistance(quarter)).toBe('short');
    expect(bestDistance(arabian)).toBe('long');
  });
});

describe('ırka özel yarış sınıfları (istemci ipucu)', () => {
  it('açık yarış herkese; sınıflı yarış yalnızca listedeki ırka; bilinmeyen sınıf kapalı', async () => {
    const { horseFitsRaceClass, RACE_CLASSES } = await import('../../../src/features/breeds/breed-catalog');
    expect(RACE_CLASSES.map((raceClass) => raceClass.key)).toContain('native');
    expect(horseFitsRaceClass(null, 'thoroughbred')).toBe(true);
    expect(horseFitsRaceClass('native', 'hinis')).toBe(true);
    expect(horseFitsRaceClass('native', 'thoroughbred')).toBe(false);
    expect(horseFitsRaceClass('unicorn', 'hinis')).toBe(false);
  });
});
