/**
 * TRİBÜN EMOTE'LARI — saf yardımcılar (02.10.2026, Faz 9). Ekran yalnızca
 * sunucunun YAYINLADIĞI emote'u gösterir (kendi bastığını yerelde önceden
 * çizmez — soğumada sunucu düşürürse ekran yalan söylemesin).
 */
import type { RaceEmoteEvent } from '@at-sevdalisi/shared-types';

export interface EmoteDefinition {
  key: string;
  symbol: string;
  label: string;
}

export interface EmoteBurst {
  id: number;
  symbol: string;
  /** Yatay konum (%), kimlikten türetilir — rastgele değil, test edilebilir. */
  leftPercent: number;
  expiresAtMs: number;
}

const SPREAD_STEPS = 7;
const SPREAD_STEP_PERCENT = 12;
const SPREAD_BASE_PERCENT = 8;

/** Bilinmeyen anahtar `null` (sunucu listesiyle istemci listesi ayrışırsa sessizce düşer). */
export function symbolFor(key: string, list: readonly EmoteDefinition[]): string | null {
  return list.find((emote) => emote.key === key)?.symbol ?? null;
}

/** Yeni emote'u ekler; süresi dolanları atar; en fazla `maxVisible` tutar (en yeniler). */
export function addBurst(
  bursts: readonly EmoteBurst[],
  event: RaceEmoteEvent,
  list: readonly EmoteDefinition[],
  nowMs: number,
  options: { displayMs: number; maxVisible: number },
  id: number,
): EmoteBurst[] {
  const live = bursts.filter((burst) => burst.expiresAtMs > nowMs);
  const symbol = symbolFor(event.key, list);
  if (symbol === null) return live;
  const next: EmoteBurst = {
    id,
    symbol,
    leftPercent: SPREAD_BASE_PERCENT + (id % SPREAD_STEPS) * SPREAD_STEP_PERCENT,
    expiresAtMs: nowMs + options.displayMs,
  };
  return [...live, next].slice(-options.maxVisible);
}
