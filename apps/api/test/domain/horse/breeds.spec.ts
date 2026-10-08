import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadBreedsConfig,
  loadHorseAppearanceConfig,
  loadProgressionConfig,
  type BreedsConfig,
} from '@at-sevdalisi/game-config';
import { deriveAppearance } from '../../../src/domain/horse/appearance';
import { generateBotEntrants } from '../../../src/domain/race/bot-generator';
import { validateRaceCreation } from '../../../src/domain/race/lobby';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import {
  BreedLevelLockedError,
  BreedNotFoundError,
  assertCanBuyBreed,
  breedRacingPower,
  deriveBreedInitialStats,
  isBreedAllowedInRaceClass,
  raceClassBotStatRange,
  getBreed,
  getStarterBreed,
  resolveFoalBreed,
  validateBreedsConfig,
} from '../../../src/domain/horse/breeds';

/**
 * AT IRKLARI (07.10.2026). Sahibinin kuralı burada KİLİTLİDİR: ücretsiz
 * başlangıç atı EN ZAYIF ırktır, güçlü ırk ucuz olamaz. Config bu kuralı
 * bozarsa API açılmaz (`AppConfigService`) ve bu dosya kırılır.
 */
const config = loadBreedsConfig();
const maxLevel = loadProgressionConfig().maxLevel;

function clone(): BreedsConfig {
  return JSON.parse(JSON.stringify(config)) as BreedsConfig;
}

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let depth = 0; depth < 10; depth += 1) {
    try {
      readdirSync(join(dir, 'database'));
      return dir;
    } catch {
      dir = join(dir, '..');
    }
  }
  throw new Error(`Depo kökü bulunamadı: ${startDir}`);
}

describe('ırk kataloğu', () => {
  it('gerçek config geçerlidir', () => {
    expect(() => validateBreedsConfig(config, maxLevel)).not.toThrow();
  });

  it('sahibinin istediği on bir ırkın hepsi vardır', () => {
    expect(config.breeds.map((breed) => breed.name).sort()).toEqual(
      [
        'Ahalteke',
        'Anglo-Arap',
        'Çukurova',
        'Hınıs',
        'Malakan',
        'Quarter Horse',
        'Rahvan',
        'Safkan Arap',
        'Safkan İngiliz',
        'Standardbred',
        'Uzunyayla',
      ].sort(),
    );
  });

  it('ücretsiz başlangıç ırkı TEK en zayıf ırktır ve seviye 1de açıktır', () => {
    const starter = getStarterBreed(config);
    expect(starter.minPlayerLevel).toBe(1);
    for (const breed of config.breeds.filter((candidate) => candidate.key !== starter.key)) {
      expect(breedRacingPower(breed), breed.key).toBeGreaterThan(breedRacingPower(starter));
    }
  });

  it('güç arttıkça fiyat düşmez; en güçlü ırk en pahalı ve en yüksek seviyeyi ister', () => {
    const byPower = [...config.breeds].sort((a, b) => breedRacingPower(a) - breedRacingPower(b));
    for (let index = 1; index < byPower.length; index += 1) {
      expect(byPower[index]!.priceMoney).toBeGreaterThanOrEqual(byPower[index - 1]!.priceMoney);
    }
    const strongest = byPower[byPower.length - 1]!;
    expect(strongest.priceMoney).toBe(Math.max(...config.breeds.map((breed) => breed.priceMoney)));
    expect(strongest.minPlayerLevel).toBe(Math.max(...config.breeds.map((breed) => breed.minPlayerLevel)));
  });

  it('migration CHECK kümesi config anahtarlarıyla aynıdır', () => {
    const root = findRepoRoot(process.cwd());
    const dir = join(root, 'database', 'migrations');
    const latest = readdirSync(dir)
      .filter((name) => name.endsWith('.up.sql'))
      .sort()
      .filter((name) => readFileSync(join(dir, name), 'utf-8').includes('horses_breed_valid CHECK'))
      .pop();
    expect(latest).toBeDefined();
    const sql = readFileSync(join(dir, latest!), 'utf-8');
    const block = sql.slice(sql.indexOf('horses_breed_valid CHECK'));
    const inList = block.slice(block.indexOf('IN (') + 4, block.indexOf('))'));
    const keys = [...inList.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(keys.sort()).toEqual(config.breeds.map((breed) => breed.key).sort());
  });
});

describe('config doğrulaması kuralı bozanı reddeder', () => {
  it('başlangıç ırkından zayıf bir ırk', () => {
    const broken = clone();
    const weak = broken.breeds.find((breed) => breed.key === 'malakan')!;
    weak.stats = { ...weak.stats, speed: 30, acceleration: 30, stamina: 30 };
    expect(() => validateBreedsConfig(broken, maxLevel)).toThrow(/en zayıf/);
  });

  it('daha güçlü ama daha ucuz bir ırk', () => {
    const broken = clone();
    broken.breeds.find((breed) => breed.key === 'thoroughbred')!.priceMoney = 2500;
    expect(() => validateBreedsConfig(broken, maxLevel)).toThrow(/ucuz/);
  });

  it('bilinmeyen stat, sapma taşması, bozuk melez kuralı, olmayan başlangıç ırkı', () => {
    const unknownStat = clone();
    (unknownStat.breeds[0]!.stats as Record<string, number>).temperament = 50;
    expect(() => validateBreedsConfig(unknownStat, maxLevel)).toThrow(/bilinmeyen/);

    const overflow = clone();
    overflow.breeds.find((breed) => breed.key === 'thoroughbred')!.stats.speed = 99;
    expect(() => validateBreedsConfig(overflow, maxLevel)).toThrow(/0-100/);

    const badCross = clone();
    badCross.crossbreeds.push({ parents: ['arabian', 'unicorn'], foal: 'anglo_arab' });
    expect(() => validateBreedsConfig(badCross, maxLevel)).toThrow(/melez/);

    const noStarter = clone();
    noStarter.starterBreed = 'unicorn';
    expect(() => validateBreedsConfig(noStarter, maxLevel)).toThrow(/başlangıç ırkı/);
  });
});

describe('ırk kuralları', () => {
  it('statlar taban ± sapma içinde, at kimliğinden determinist', () => {
    const breed = getBreed(config, 'thoroughbred');
    const first = deriveBreedInitialStats('horse-a', breed, config.statJitter);
    expect(deriveBreedInitialStats('horse-a', breed, config.statJitter)).toEqual(first);
    for (const [key, base] of Object.entries(breed.stats)) {
      const value = first.stats[key as keyof typeof first.stats]!;
      expect(Math.abs(value - base!)).toBeLessThanOrEqual(config.statJitter);
    }
    expect(Object.keys(first.surface).sort()).toEqual(Object.keys(breed.surface).sort());
    expect(Object.keys(first.distance).sort()).toEqual(Object.keys(breed.distance).sort());
    // Farklı at → (en az bir statta) farklı değer.
    expect(deriveBreedInitialStats('horse-b', breed, config.statJitter)).not.toEqual(first);
  });

  it('tayın ırkı: aynı ırk, sırasız melez kuralı, aksi hâlde kısrağınki', () => {
    expect(resolveFoalBreed(config, 'arabian', 'arabian')).toBe('arabian');
    expect(resolveFoalBreed(config, 'arabian', 'thoroughbred')).toBe('anglo_arab');
    expect(resolveFoalBreed(config, 'thoroughbred', 'arabian')).toBe('anglo_arab');
    expect(resolveFoalBreed(config, 'anglo_arab', 'thoroughbred')).toBe('anglo_arab');
    expect(resolveFoalBreed(config, 'quarter_horse', 'hinis')).toBe('hinis');
  });

  it('seviye kapısı ve bilinmeyen ırk', () => {
    const breed = getBreed(config, 'thoroughbred');
    expect(() => assertCanBuyBreed(breed, breed.minPlayerLevel - 1)).toThrow(BreedLevelLockedError);
    expect(() => assertCanBuyBreed(breed, breed.minPlayerLevel)).not.toThrow();
    expect(() => getBreed(config, 'unicorn')).toThrow(BreedNotFoundError);
    expect(() => getBreed(config, 42)).toThrow(BreedNotFoundError);
  });

  it('ırkın don ağırlıkları yalnızca izin verdiği donları üretir', () => {
    const breed = getBreed(config, 'standardbred');
    const allowed = Object.entries(breed.coatWeights!)
      .filter(([, weight]) => weight > 0)
      .map(([coat]) => coat);
    const appearanceConfig = loadHorseAppearanceConfig();
    for (let index = 0; index < 200; index += 1) {
      const { coatColor } = deriveAppearance(`horse-${index}`, appearanceConfig, breed.coatWeights);
      expect(allowed).toContain(coatColor);
    }
  });
});

describe('ırka özel yarışlar (08.10.2026)', () => {
  const classKeys = config.raceClasses.map((raceClass) => raceClass.key);

  it('migration CHECK kümesi config sınıflarıyla aynıdır', () => {
    const root = findRepoRoot(process.cwd());
    const dir = join(root, 'database', 'migrations');
    const latest = readdirSync(dir)
      .filter((name) => name.endsWith('.up.sql'))
      .sort()
      .filter((name) => readFileSync(join(dir, name), 'utf-8').includes('races_breed_class_valid CHECK'))
      .pop();
    expect(latest).toBeDefined();
    const sql = readFileSync(join(dir, latest!), 'utf-8');
    const block = sql.slice(sql.indexOf('races_breed_class_valid CHECK'));
    const inList = block.slice(block.indexOf('IN (') + 4, block.indexOf(')'));
    const keys = [...inList.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(keys.sort()).toEqual([...classKeys].sort());
  });

  it('ücretsiz başlangıç ırkının yarışabileceği bir sınıf vardır (Yerli Irklar)', () => {
    expect(config.raceClasses.some((raceClass) => raceClass.breeds.includes(config.starterBreed))).toBe(true);
  });

  it('sınıf kapısı: açık yarış herkese, sınıflı yarış yalnızca listedeki ırka, bilinmeyen sınıf kimseye', () => {
    expect(isBreedAllowedInRaceClass(config, null, 'thoroughbred')).toBe(true);
    expect(isBreedAllowedInRaceClass(config, 'native', 'hinis')).toBe(true);
    expect(isBreedAllowedInRaceClass(config, 'native', 'thoroughbred')).toBe(false);
    expect(isBreedAllowedInRaceClass(config, 'arabian', 'anglo_arab')).toBe(false);
    expect(isBreedAllowedInRaceClass(config, 'unicorn', 'hinis')).toBe(false);
  });

  it('bot aralığı sınıfın ırklarından; açık yarışta null (genel aralık, botlar değişmez)', () => {
    expect(raceClassBotStatRange(config, null)).toBeNull();
    const native = raceClassBotStatRange(config, 'native')!;
    const thoroughbred = raceClassBotStatRange(config, 'thoroughbred')!;
    expect(native[0]).toBeLessThan(native[1]);
    expect(native[1]).toBeLessThan(thoroughbred[1]);
    for (const bot of generateBotEntrants(7, 'seed-x', native)) {
      for (const value of [bot.speed, bot.stamina, bot.acceleration]) {
        expect(value).toBeGreaterThanOrEqual(native[0]);
        expect(value).toBeLessThanOrEqual(native[1]);
      }
    }
    // Varsayılan yol: üçüncü argüman verilmeyen çağrı eski davranış.
    expect(generateBotEntrants(5, 'seed-y')).toEqual(generateBotEntrants(5, 'seed-y'));
  });

  it('yarış açma doğrulaması: geçerli sınıf, verilmeyen sınıf (null), bilinmeyen sınıf (sorun)', () => {
    const lobby = loadRaceLobbyConfig();
    const now = new Date('2026-10-08T10:00:00Z');
    const input = {
      name: 'Yerli Koşu',
      fieldSize: 8,
      maxPlayers: 8,
      entryFee: 0,
      raceType: 'free',
      startTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      surface: 'dirt',
      weather: 'sunny',
      distanceMeters: 1400,
      tribuneFee: 0,
      spectatorCapacity: 500,
    };
    expect(validateRaceCreation({ ...input, breedClass: 'native' }, lobby, now, classKeys).value?.breedClass).toBe('native');
    expect(validateRaceCreation(input, lobby, now, classKeys).value?.breedClass).toBeNull();
    expect(validateRaceCreation({ ...input, breedClass: 'unicorn' }, lobby, now, classKeys).problems).toHaveLength(1);
    expect(validateRaceCreation({ ...input, breedClass: 42 }, lobby, now, classKeys).value).toBeNull();
    // Sınıf listesi verilmeyen çağıran sınıflı yarış açamaz (sessizce açık yarışa dönmez).
    expect(validateRaceCreation({ ...input, breedClass: 'native' }, lobby, now).value).toBeNull();
  });

  it('config doğrulaması bilinmeyen ırk içeren sınıfı reddeder', () => {
    const broken = clone();
    broken.raceClasses[0]!.breeds.push('unicorn');
    expect(() => validateBreedsConfig(broken, maxLevel)).toThrow(/yarış sınıfı/);
  });
});
