/**
 * OYUNCU AVATARI (07.10.2026, brief §44 özelleştirme + §49 yedek manuel
 * oluşturucu). Her alan `config/avatar.config.json` kataloğundaki bir
 * seçeneğin KİMLİĞİDİR (renkler de kimlikle seçilir, hex config'tedir) —
 * istemci serbest değer gönderemez, sunucu kataloğa karşı doğrular.
 *
 * AI ile selfie'den avatar (brief §38–48) bu tipten AYRIDIR ve bir
 * sağlayıcı gerektirir; manuel avatar onun yokluğunda/başarısızlığında
 * oyuncunun yedeğidir.
 */
export const AVATAR_FIELDS = [
  'skinTone',
  'hairStyle',
  'hairColor',
  'socialOutfit',
  'outfitColor',
  'shoes',
  'hat',
  'accessory',
  'raceOutfit',
  'silksPrimary',
  'silksSecondary',
] as const;

export type AvatarField = (typeof AVATAR_FIELDS)[number];

export type AvatarAppearance = Record<AvatarField, string>;

export interface AvatarView {
  appearance: AvatarAppearance;
  /** `default` = oyuncu henüz seçmedi (kimlikten türetilir); `manual` = oyuncu kaydetti. */
  source: 'default' | 'manual';
  updatedAt: string | null;
}
