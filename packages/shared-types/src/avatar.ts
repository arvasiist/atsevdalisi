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

/**
 * AI AVATAR ÜRETİM İŞİ (07.10.2026, Faz 8-B, brief §41). Yalnızca sunucunun
 * GERÇEKTEN yazdığı durumlar vardır: brief'in OPTIMIZING/RIGGING adımları
 * sağlayıcının işidir ve bu hat onları kendisi yapmadığı için durum olarak
 * uydurulmaz (CLAUDE.md: hiçbir kodun yazmadığı durum eklenmez).
 */
export const AVATAR_JOB_STATUSES = [
  'requested',
  'analyzing',
  'generating',
  'processing',
  'ready',
  'failed',
  'cancelled',
] as const;

export type AvatarJobStatus = (typeof AVATAR_JOB_STATUSES)[number];

export interface AvatarGenerationJobView {
  id: string;
  status: AvatarJobStatus;
  /** Başarısızlık nedeni (`FACE_NOT_FOUND`, `TIMEOUT`, `INVALID_MODEL` …); başarılıysa `null`. */
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface AvatarGenerationStatusView {
  /** Sunucuda bir sağlayıcı yapılandırılmış mı? `false` ise yükleme kapalıdır. */
  available: boolean;
  consentVersion: string;
  maxUploadBytes: number;
  acceptedTypes: string[];
  minDimension: number;
  currentJob: AvatarGenerationJobView | null;
  /** Hazır AI avatar (yoksa `null`); model yalnızca sahibine `GET /avatar/ai/model` ile verilir. */
  aiAvatar: { updatedAt: string } | null;
}

export interface AdminAvatarJobView extends AvatarGenerationJobView {
  playerId: string;
  username: string;
  provider: string;
}
