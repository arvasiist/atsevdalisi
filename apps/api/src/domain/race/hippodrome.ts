import type { HippodromeConfig, HippodromesConfig } from '@at-sevdalisi/game-config';

/**
 * HİPODROMLAR (08.10.2026) — saf. Yarış bir hipodroma `races.track_id` ile
 * bağlanır; anahtar ↔ kimlik eşlemesi config'tedir (migration 0072 aynı
 * satırları yazar, `hippodromes.spec.ts` ikisini karşılaştırır). Hipodrom
 * YALNIZCA sahneyi/kimliği belirler — motor pist ölçüsü okumaz, sonuç
 * değişmez.
 */
export function hippodromeKeys(config: HippodromesConfig): string[] {
  return config.hippodromes.map((hippodrome) => hippodrome.key);
}

export function findHippodrome(
  config: HippodromesConfig,
  key: string | null,
): HippodromeConfig | null {
  return config.hippodromes.find((hippodrome) => hippodrome.key === key) ?? null;
}

/** `races.track_id` → hipodrom anahtarı; eşlenmeyen (eski/NULL) kimlik `null`. */
export function hippodromeKeyForTrack(
  config: HippodromesConfig,
  trackId: string | null,
): string | null {
  if (trackId === null) return null;
  return config.hippodromes.find((hippodrome) => hippodrome.trackId === trackId)?.key ?? null;
}

/** `races.track_id` → görünen anahtar; NULL/eşlenmeyen kimlik varsayılan hipodromdur. */
export function resolveHippodromeKey(config: HippodromesConfig, trackId: string | null): string {
  return hippodromeKeyForTrack(config, trackId) ?? config.defaultKey;
}

/** Anahtar → `tracks.id`; bilinmeyen anahtar `null` (çağıran önce doğrular). */
export function trackIdForHippodrome(config: HippodromesConfig, key: string | null): string | null {
  return findHippodrome(config, key)?.trackId ?? null;
}

/**
 * Oyuncunun seçmediği yarışlar (pratik, eşleşme) için hipodrom: yarış
 * kimliğinden DETERMİNİST (FNV-1a) — aynı yarış her zaman aynı hipodromda
 * görünür (koşu sırasında ve tekrarında), yarışlar hipodromlara dağılır.
 */
export function pickHippodromeForRace(config: HippodromesConfig, raceId: string): HippodromeConfig {
  let hash = 0x811c9dc5;
  for (let i = 0; i < raceId.length; i += 1) {
    hash ^= raceId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return config.hippodromes[(hash >>> 0) % config.hippodromes.length]!;
}

/** Config tutarlılığı: anahtar/kimlik tekil, varsayılan tanımlı. Sorun listesi döner. */
export function validateHippodromesConfig(config: HippodromesConfig): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const hippodrome of config.hippodromes) {
    if (keys.has(hippodrome.key)) problems.push(`Hipodrom anahtarı tekrarlı: ${hippodrome.key}`);
    if (ids.has(hippodrome.trackId))
      problems.push(`Hipodrom kimliği tekrarlı: ${hippodrome.trackId}`);
    keys.add(hippodrome.key);
    ids.add(hippodrome.trackId);
    if (!hippodrome.name.trim() || !hippodrome.shortName.trim()) {
      problems.push(`Hipodrom adı/kısa adı boş: ${hippodrome.key}`);
    }
    if (hippodrome.lapLengthMeters <= 0 || hippodrome.turnRadiusMeters <= 0) {
      problems.push(`Hipodrom ölçüsü geçersiz: ${hippodrome.key}`);
    }
  }
  if (config.hippodromes.length === 0) problems.push('En az bir hipodrom tanımlı olmalı.');
  if (!keys.has(config.defaultKey))
    problems.push(`Varsayılan hipodrom tanımlı değil: ${config.defaultKey}`);
  return problems;
}
