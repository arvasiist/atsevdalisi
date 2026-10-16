/**
 * AT KİŞİLİĞİ — İSTEMCİ (08.10.2026). Sunucu gizli sayılardan (özellik, uç)
 * çiftini türetir (`HorsePersonalityView`); metin `config/horse-personality.
 * config.json`dan (sunucu ile AYNI dosya). Sayı istemciye GELMEZ — bu dosya
 * yalnızca adlandırır.
 */
import { loadHorsePersonalityConfig } from '@at-sevdalisi/game-config';
import type { HorsePersonalityView } from '@at-sevdalisi/shared-types';

const CONFIG = loadHorsePersonalityConfig();

export interface PersonalityChip {
  key: string;
  label: string;
  hint: string;
}

/** Görünüm → çipler. Boş liste "Dengeli" çipidir; görünüm yoksa (eski yanıt) çip yok. */
export function personalityChips(view: HorsePersonalityView | undefined): PersonalityChip[] {
  if (!view) return [];
  if (view.traits.length === 0) {
    return [{ key: 'balanced', ...CONFIG.labels.balanced }];
  }
  return view.traits.flatMap(({ trait, pole }) => {
    const text = CONFIG.labels.traits[trait]?.[pole];
    return text ? [{ key: `${trait}-${pole}`, label: text.label, hint: text.hint }] : [];
  });
}
