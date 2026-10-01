/**
 * DON RENGİ PALETİ (01.10.2026) — `HorseAppearance` → malzeme renkleri.
 * Salt sunum; oyun mantığı değildir. Gerçek GLB geldiğinde aynı eşleme
 * doku tonlaması (tint) için kullanılır.
 */

import type { HorseAppearance, HorseCoatColor } from '@at-sevdalisi/shared-types';

export interface CoatPalette {
  body: string;
  mane: string;
  /** Alt bacak (bilek) tonu — doru/yağızda koyu, kırda açık. */
  lowerLeg: string;
}

export const COAT_PALETTES: Record<HorseCoatColor, CoatPalette> = {
  bay: { body: '#6b3a1f', mane: '#1a1210', lowerLeg: '#2a1c14' },
  dark_bay: { body: '#4a2a17', mane: '#140e0b', lowerLeg: '#1e140e' },
  chestnut: { body: '#8c4a20', mane: '#6a3416', lowerLeg: '#5a2e14' },
  black: { body: '#1d1714', mane: '#0d0a09', lowerLeg: '#141110' },
  grey: { body: '#8a847c', mane: '#5d5852', lowerLeg: '#4a4641' },
  palomino: { body: '#c9a15a', mane: '#efe3c4', lowerLeg: '#9c7a3f' },
};

/** İşaret (beyaz alan) rengi. */
export const MARKING_WHITE = '#efece6';

export function paletteFor(appearance: HorseAppearance): CoatPalette {
  return COAT_PALETTES[appearance.coatColor];
}
