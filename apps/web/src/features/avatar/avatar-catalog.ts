/**
 * AVATAR KATALOĞU — İSTEMCİ (07.10.2026). Seçenek kimlikleri ve renkler
 * `config/avatar.config.json`dan (sunucu ile AYNI dosya); burada yalnızca
 * Türkçe adlar ve renk çözümü vardır. Sunucu her kaydı kataloğa karşı
 * yeniden doğrular — buradaki liste yalnızca seçim arayüzü içindir.
 */
import { AVATAR_FIELDS, type AvatarAppearance, type AvatarField } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig, type AvatarCatalogKey } from '@at-sevdalisi/game-config';

export const AVATAR_CONFIG = loadAvatarConfig();

const CATALOG_KEYS: Record<AvatarField, AvatarCatalogKey> = {
  skinTone: 'skinTones',
  hairStyle: 'hairStyles',
  hairColor: 'hairColors',
  socialOutfit: 'socialOutfits',
  outfitColor: 'outfitColors',
  shoes: 'shoes',
  hat: 'hats',
  accessory: 'accessories',
  raceOutfit: 'raceOutfits',
  silksPrimary: 'silkColors',
  silksSecondary: 'silkColors',
};

export const AVATAR_FIELD_LABELS: Record<AvatarField, string> = {
  skinTone: 'Ten rengi',
  hairStyle: 'Saç',
  hairColor: 'Saç rengi',
  socialOutfit: 'Sosyal kıyafet',
  outfitColor: 'Kıyafet rengi',
  shoes: 'Ayakkabı',
  hat: 'Şapka',
  accessory: 'Aksesuar',
  raceOutfit: 'Yarış forması deseni',
  silksPrimary: 'Forma ana rengi',
  silksSecondary: 'Forma ikinci rengi',
};

const OPTION_LABELS: Record<string, string> = {
  light: 'Açık', medium: 'Orta', tan: 'Buğday', dark: 'Koyu',
  short: 'Kısa', long: 'Uzun', curly: 'Kıvırcık', ponytail: 'At kuyruğu', bald: 'Kel',
  black: 'Siyah', brown: 'Kahverengi', auburn: 'Kızıl', blonde: 'Sarı', gray: 'Gri',
  casual: 'Günlük', jacket: 'Ceket', suit: 'Takım elbise',
  navy: 'Lacivert', burgundy: 'Bordo', forest: 'Yeşil', charcoal: 'Antrasit', cream: 'Krem',
  boots: 'Çizme', sneakers: 'Spor ayakkabı', loafers: 'Makosen',
  none: 'Yok', cap: 'Kasket', fedora: 'Fötr', flatcap: 'Kep',
  glasses: 'Gözlük', scarf: 'Atkı', medal: 'Madalya',
  solid: 'Düz', stripes: 'Dikey çizgili', hoops: 'Yatay çizgili', halves: 'İki renk',
  gold: 'Altın', red: 'Kırmızı', blue: 'Mavi', green: 'Yeşil', white: 'Beyaz', purple: 'Mor',
  // 09.10.2026 — kozmetik mağazadan açılan forma renkleri.
  turquoise: 'Turkuaz', orange: 'Turuncu', pink: 'Pembe', silver: 'Gümüş',
  // 09.10.2026 — kozmetik mağazadan açılan şapka ve aksesuarlar.
  tophat: 'Silindir', bowler: 'Melon', bowtie: 'Papyon', binoculars: 'Dürbün',
};

export function avatarOptions(field: AvatarField): string[] {
  const entry = AVATAR_CONFIG[CATALOG_KEYS[field]];
  return Array.isArray(entry) ? [...entry] : Object.keys(entry);
}

/** 09.10.2026 — alanın avatar kataloğu (kozmetik kilidi için). */
export function catalogOfField(field: AvatarField): AvatarCatalogKey {
  return CATALOG_KEYS[field];
}

/** 09.10.2026 — kataloğu kullanan İLK alan (forma renkleri → ana renk); bilinmeyen → `null`. */
export function fieldOfCatalog(catalog: string): AvatarField | null {
  return AVATAR_FIELDS.find((field) => CATALOG_KEYS[field] === catalog) ?? null;
}

/**
 * 09.10.2026 — mağaza önizlemesi: her alanın İLK seçeneği + ürünün seçeneği.
 * Sabittir (oyuncudan bağımsız) — kimin baktığına göre değişmez.
 */
export function previewAppearance(field: AvatarField, option: string): AvatarAppearance {
  const appearance = {} as AvatarAppearance;
  for (const each of AVATAR_FIELDS) appearance[each] = avatarOptions(each)[0]!;
  appearance[field] = option;
  return appearance;
}

/** Renk alanıysa seçeneğin hex değeri, değilse `null`. */
export function avatarSwatch(field: AvatarField, option: string): string | null {
  const entry = AVATAR_CONFIG[CATALOG_KEYS[field]];
  return Array.isArray(entry) ? null : (entry[option] ?? null);
}

export function optionLabel(option: string): string {
  return OPTION_LABELS[option] ?? option;
}

/** 3D/SVG için çözülmüş renkler; bilinmeyen kimlik nötr griye düşer (çökme yok). */
export function avatarColors(appearance: AvatarAppearance) {
  const pick = (field: AvatarField) => avatarSwatch(field, appearance[field]) ?? '#808080';
  return {
    skin: pick('skinTone'),
    hair: pick('hairColor'),
    outfit: pick('outfitColor'),
    silksPrimary: pick('silksPrimary'),
    silksSecondary: pick('silksSecondary'),
  };
}

export { AVATAR_FIELDS };
