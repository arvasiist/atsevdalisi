/**
 * AT IRKLARI (07.10.2026) — saf kurallar. Katalog `config/breeds.config.json`.
 *
 * Sahibinin kuralı: yeni oyuncuya verilen ÜCRETSİZ at EN ZAYIF ırktır; güçlü
 * ırklar ırk mağazasından oyun parasıyla, seviye kapısını geçerek alınır.
 * Bu dosya bu kuralı config'e karşı DOĞRULAR (`validateBreedsConfig`): ırk
 * eklenirken başlangıç ırkından zayıf bir ırk ya da gücüne göre ucuz bir ırk
 * yazılırsa API açılmaz ve `breeds.spec.ts` kırılır.
 *
 * Irk YALNIZCA atın DOĞUŞ statlarını belirler (± `statJitter`, atın
 * kimliğinden determinist). Yarış motoru ırkı OKUMAZ — motor statları okur;
 * ırk motoruna ikinci bir güç kaynağı sokmak dondurulmuş snapshot'ın
 * açıkladığı sayılarla sonucu üreten sayıları ayırırdı.
 */
import type {
  BreedDefinitionConfig,
  BreedDistanceKey,
  BreedStatKey,
  BreedsConfig,
  BreedSurfaceKey,
} from '@at-sevdalisi/game-config';
import { createSeededRandom } from '@at-sevdalisi/shared-types';

export const BREED_STAT_KEYS: readonly BreedStatKey[] = [
  'speed',
  'acceleration',
  'stamina',
  'strength',
  'agility',
  'balance',
  'sprint',
  'endurance',
];
export const BREED_SURFACE_KEYS: readonly BreedSurfaceKey[] = ['grass', 'dirt', 'wet', 'heavy', 'dry', 'mud'];
export const BREED_DISTANCE_KEYS: readonly BreedDistanceKey[] = ['short', 'middle', 'long'];

/** `horse_distance_stats` sütun adları (migration 0003). */
export const BREED_DISTANCE_COLUMNS: Record<BreedDistanceKey, string> = {
  short: 'short_distance',
  middle: 'middle_distance',
  long: 'long_distance',
};

/** Config'te verilmeyen bir stat DB varsayılanında (50) kalır — migration 0003 ile aynı. */
export const BREED_UNSPECIFIED_STAT = 50;

/** Motorun okuduğu üç temel stat — ırkın "gücü" bunların ortalamasıdır. */
const POWER_STATS: readonly BreedStatKey[] = ['speed', 'acceleration', 'stamina'];

const BREED_KEY_PATTERN = /^[a-z][a-z_]{1,31}$/;

/** Bireysel sapmanın üst sınırı — daha genişi ırk farkını gürültüye boğardı. */
const MAX_STAT_JITTER = 10;

export class BreedNotFoundError extends Error {
  constructor(public readonly breed: string) {
    super('Bu ırk katalogda yok.');
    this.name = 'BreedNotFoundError';
  }
}

export class BreedLevelLockedError extends Error {
  constructor(
    public readonly playerLevel: number,
    public readonly minPlayerLevel: number,
  ) {
    super(`Bu ırkı almak için en az ${minPlayerLevel}. seviye olmalısın (şu an ${playerLevel}).`);
    this.name = 'BreedLevelLockedError';
  }
}

export class InvalidHorseGenderError extends Error {
  constructor() {
    super('Cinsiyet mare, stallion ya da gelding olmalıdır.');
    this.name = 'InvalidHorseGenderError';
  }
}

/** Yeni bir atın ırktan gelen başlangıç değerleri (DB'ye yazılacak hâli). */
export interface BreedInitialStats {
  stats: Partial<Record<BreedStatKey, number>>;
  surface: Partial<Record<BreedSurfaceKey, number>>;
  distance: Partial<Record<BreedDistanceKey, number>>;
}

/** Irkın gücü — hız, ivme ve dayanıklılığın ortalaması (verilmeyen 50 sayılır). */
export function breedRacingPower(breed: BreedDefinitionConfig): number {
  const total = POWER_STATS.reduce((sum, key) => sum + (breed.stats[key] ?? BREED_UNSPECIFIED_STAT), 0);
  return total / POWER_STATS.length;
}

export function findBreed(config: BreedsConfig, key: unknown): BreedDefinitionConfig | null {
  if (typeof key !== 'string') {
    return null;
  }
  return config.breeds.find((breed) => breed.key === key) ?? null;
}

export function getBreed(config: BreedsConfig, key: unknown): BreedDefinitionConfig {
  const breed = findBreed(config, key);
  if (!breed) {
    throw new BreedNotFoundError(typeof key === 'string' ? key : '');
  }
  return breed;
}

export function getStarterBreed(config: BreedsConfig): BreedDefinitionConfig {
  return getBreed(config, config.starterBreed);
}

/** Seviye kapısı — mağaza alımında oyuncu satırı KİLİTLİYKEN çağrılır. */
export function assertCanBuyBreed(breed: BreedDefinitionConfig, playerLevel: number): void {
  if (playerLevel < breed.minPlayerLevel) {
    throw new BreedLevelLockedError(playerLevel, breed.minPlayerLevel);
  }
}

function jittered(base: number, jitter: number, seed: string): number {
  const roll = createSeededRandom(seed)();
  const value = base + (roll * 2 - 1) * jitter;
  // NUMERIC(5,2) — iki ondalık; CHECK 0-100.
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

function jitterAll<K extends string>(
  values: Partial<Record<K, number>>,
  keys: readonly K[],
  jitter: number,
  seedPrefix: string,
): Partial<Record<K, number>> {
  const result: Partial<Record<K, number>> = {};
  for (const key of keys) {
    const base = values[key];
    if (base !== undefined) {
      result[key] = jittered(base, jitter, `${seedPrefix}:${key}`);
    }
  }
  return result;
}

/**
 * Yeni bir atın ırk statları: taban ± `statJitter`. Tohum atın kimliğidir —
 * aynı at her zaman aynı statlarla doğar (`deriveAppearance` ile aynı desen;
 * `Math.random()` YOK).
 */
export function deriveBreedInitialStats(horseId: string, breed: BreedDefinitionConfig, jitter: number): BreedInitialStats {
  return {
    stats: jitterAll(breed.stats, BREED_STAT_KEYS, jitter, `${horseId}:breed:stat`),
    surface: jitterAll(breed.surface, BREED_SURFACE_KEYS, jitter, `${horseId}:breed:surface`),
    distance: jitterAll(breed.distance, BREED_DISTANCE_KEYS, jitter, `${horseId}:breed:distance`),
  };
}

/**
 * Tayın ırkı: aynı ırk → o ırk; config'teki melez kuralı (sırasız çift) →
 * kuralın ırkı; aksi hâlde KISRAĞIN ırkı (gerçek atçılıkta tay kısrağın
 * kayıtlı ırkıyla tescil edilir — eski davranış).
 */
export function resolveFoalBreed(config: BreedsConfig, sireBreed: string, mareBreed: string): string {
  if (sireBreed === mareBreed) {
    return mareBreed;
  }
  const rule = config.crossbreeds.find(
    ({ parents: [a, b] }) => (a === sireBreed && b === mareBreed) || (a === mareBreed && b === sireBreed),
  );
  return rule ? rule.foal : mareBreed;
}

function isStatValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Config'in tutarlılığı — API açılışında ve testte koşar. Sahibinin kuralı
 * burada kilitlidir: başlangıç ırkı seviye 1'de, EN ZAYIF ve TEK en zayıf;
 * daha güçlü bir ırk daha ucuz olamaz.
 */
export function validateBreedsConfig(config: BreedsConfig, maxPlayerLevel: number): void {
  const fail = (message: string): never => {
    throw new Error(`Irk config'i geçersiz (config/breeds.config.json): ${message}`);
  };
  if (!Array.isArray(config.breeds) || config.breeds.length === 0) {
    fail('en az bir ırk olmalı.');
  }
  if (!Number.isFinite(config.statJitter) || config.statJitter < 0 || config.statJitter > MAX_STAT_JITTER) {
    fail(`statJitter 0-${MAX_STAT_JITTER} aralığında olmalı.`);
  }
  if (!Number.isInteger(config.shopHorseAgeMonths) || config.shopHorseAgeMonths <= 0) {
    fail('shopHorseAgeMonths pozitif tam sayı olmalı.');
  }
  const keys = new Set<string>();
  for (const breed of config.breeds) {
    if (!BREED_KEY_PATTERN.test(breed.key)) {
      fail(`"${breed.key}" geçerli bir anahtar değil (küçük harf + alt çizgi).`);
    }
    if (keys.has(breed.key)) {
      fail(`"${breed.key}" iki kez tanımlı.`);
    }
    keys.add(breed.key);
    if (!breed.name || !breed.description || !breed.origin) {
      fail(`"${breed.key}" için ad, köken ve açıklama zorunlu.`);
    }
    if (!Number.isInteger(breed.priceMoney) || breed.priceMoney <= 0) {
      fail(`"${breed.key}" fiyatı pozitif tam sayı olmalı.`);
    }
    if (!Number.isInteger(breed.minPlayerLevel) || breed.minPlayerLevel < 1 || breed.minPlayerLevel > maxPlayerLevel) {
      fail(`"${breed.key}" seviye şartı 1-${maxPlayerLevel} aralığında olmalı.`);
    }
    if (!isStatValue(breed.quality) || !isStatValue(breed.potential)) {
      fail(`"${breed.key}" kalite/potansiyel 0-100 olmalı.`);
    }
    const groups: Array<[Record<string, number | undefined>, readonly string[]]> = [
      [breed.stats, BREED_STAT_KEYS],
      [breed.surface, BREED_SURFACE_KEYS],
      [breed.distance, BREED_DISTANCE_KEYS],
    ];
    for (const [values, allowed] of groups) {
      for (const [key, value] of Object.entries(values ?? {})) {
        if (!allowed.includes(key)) {
          fail(`"${breed.key}" bilinmeyen alan: ${key}.`);
        }
        // Taban ± sapma 0-100 içinde kalmalı — kırpılan stat ırkın tanımını sessizce değiştirirdi.
        if (!isStatValue(value) || value - config.statJitter < 0 || value + config.statJitter > 100) {
          fail(`"${breed.key}" ${key} değeri (± statJitter) 0-100 dışında.`);
        }
      }
    }
    if (breed.coatWeights) {
      const positive = Object.values(breed.coatWeights).filter((weight) => weight > 0);
      if (positive.length === 0) {
        fail(`"${breed.key}" don ağırlıkları en az bir pozitif değer içermeli.`);
      }
    }
  }

  const starter = findBreed(config, config.starterBreed);
  if (!starter) {
    return fail(`başlangıç ırkı "${config.starterBreed}" katalogda yok.`);
  }
  if (starter.minPlayerLevel !== 1) {
    fail('başlangıç ırkının seviye şartı 1 olmalı.');
  }
  const starterPower = breedRacingPower(starter);
  for (const breed of config.breeds) {
    if (breed.key !== starter.key && breedRacingPower(breed) <= starterPower) {
      fail(`"${breed.key}" ücretsiz başlangıç ırkından güçlü olmalı (ücretsiz at en zayıf at).`);
    }
  }
  for (const a of config.breeds) {
    for (const b of config.breeds) {
      if (breedRacingPower(a) > breedRacingPower(b) && a.priceMoney < b.priceMoney) {
        fail(`"${a.key}" "${b.key}"den güçlü ama daha ucuz.`);
      }
    }
  }

  for (const rule of config.crossbreeds ?? []) {
    const [a, b] = rule.parents;
    if (!keys.has(a) || !keys.has(b) || !keys.has(rule.foal) || a === b) {
      fail(`melez kuralı ${a} × ${b} → ${rule.foal} geçersiz.`);
    }
  }
}
