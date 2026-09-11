/**
 * Deterministik, seed'e bağlı pseudo-random sayı üretici.
 *
 * Neden gerekli: docs/RACE_ENGINE.md §7 ve brief §18 gereği, Race Engine
 * içinde `Math.random()` KULLANILMAZ — aynı seed + aynı girdi her zaman
 * aynı sonucu üretmelidir (replay, server doğrulama, debug, dispute
 * analysis için gereklidir, brief §18 son madde).
 *
 * Algoritma: mulberry32 (küçük, hızlı, bağımlılıksız, iyi dağılım kalitesi
 * yeterli olan bir PRNG). Kriptografik güvenlik gerektirmez — sadece
 * tekrarlanabilirlik ve makul dağılım gerekir.
 *
 * Kullanım (bkz. docs/RACE_ENGINE.md §7):
 *   const rng = createSeededRandom(`${raceId}:${horseId}:${segmentIndex}:pace`);
 *   const value = rng(); // [0, 1) aralığında
 *
 * Her farklı "amaç" (purpose) için ayrı bir isim uzayı kullanılması önerilir
 * (örn. seed string'ine amaç eklenerek), böylece bir atın rastgele değeri
 * değiştirilse bile diğer atların/segmentlerin sonucu etkilenmez.
 */

/** Basit, hızlı bir string hash (32-bit FNV-1a benzeri). Seed'i sayısala çevirir. */
function hashStringToSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Verilen string seed'e bağlı, [0, 1) aralığında sayı üreten bir fonksiyon
 * döndürür. Her çağrıda dizideki bir sonraki değeri üretir (stateful
 * closure); aynı seed ile oluşturulan iki üretici, çağrıldıkça birebir
 * aynı sırayla aynı değerleri üretir.
 */
export function createSeededRandom(seed: string): () => number {
  let state = hashStringToSeed(seed);

  return function nextRandom(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min, max) aralığında deterministik bir sayı üretir. */
export function seededRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Bir değeri [min, max] aralığına sınırlar (brief'teki "clamp" kullanımı, örn. §10 injury_risk). */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
