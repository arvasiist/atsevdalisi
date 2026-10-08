/** Avatar hataları (07.10.2026). `http-exception.filter.ts` → `DOMAIN_ERROR_MAP`'te. */
export class InvalidAvatarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAvatarError';
  }
}

/** Sunucuda AI avatar sağlayıcısı yapılandırılmamış (503) — selfie HİÇ saklanmaz. */
export class AvatarGenerationUnavailableError extends Error {
  constructor() {
    super('Fotoğraftan avatar şu an kullanılamıyor. Manuel avatarın kullanılmaya devam eder.');
    this.name = 'AvatarGenerationUnavailableError';
  }
}

export class AvatarConsentRequiredError extends Error {
  constructor() {
    super('Fotoğrafının işlenmesi için güncel gizlilik metnini onaylaman gerekiyor.');
    this.name = 'AvatarConsentRequiredError';
  }
}

export const SELFIE_REJECTION_REASONS = [
  'EMPTY_FILE',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FORMAT',
  'TYPE_MISMATCH',
  'CORRUPT_IMAGE',
  'IMAGE_TOO_SMALL',
  'IMAGE_TOO_LARGE',
] as const;
export type SelfieRejectionReason = (typeof SELFIE_REJECTION_REASONS)[number];

const SELFIE_MESSAGES: Record<SelfieRejectionReason, string> = {
  EMPTY_FILE: 'Dosya boş.',
  FILE_TOO_LARGE: 'Fotoğraf çok büyük.',
  UNSUPPORTED_FORMAT: 'Yalnızca JPEG, PNG ya da WebP fotoğraf yükleyebilirsin.',
  TYPE_MISMATCH: 'Dosyanın içeriği bildirilen türle uyuşmuyor.',
  CORRUPT_IMAGE: 'Fotoğraf okunamadı; dosya bozuk olabilir.',
  IMAGE_TOO_SMALL: 'Fotoğraf çözünürlüğü çok düşük; yüzün net görüneceği daha büyük bir fotoğraf seç.',
  IMAGE_TOO_LARGE: 'Fotoğraf çözünürlüğü çok yüksek.',
};

/** Selfie kalite/biçim kontrolü başarısız (422 `SELFIE_REJECTED`); neden MESAJDADIR, `reason` testler/loglar içindir. */
export class SelfieRejectedError extends Error {
  constructor(readonly reason: SelfieRejectionReason) {
    super(SELFIE_MESSAGES[reason]);
    this.name = 'SelfieRejectedError';
  }
}

export class AvatarJobInProgressError extends Error {
  constructor() {
    super('Hazırlanan bir avatarın var; bitmesini bekle ya da iptal et.');
    this.name = 'AvatarJobInProgressError';
  }
}

export class AvatarJobNotFoundError extends Error {
  constructor() {
    super('Avatar işi bulunamadı.');
    this.name = 'AvatarJobNotFoundError';
  }
}

export class AiAvatarNotFoundError extends Error {
  constructor() {
    super('Hazır bir AI avatarın yok.');
    this.name = 'AiAvatarNotFoundError';
  }
}

/** Geçersiz durum geçişi — programlama hatasıdır (500); kilit altında okunan duruma göre karar verilir. */
export class InvalidAvatarJobTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Avatar işi ${from} → ${to} geçişi yapamaz.`);
    this.name = 'InvalidAvatarJobTransitionError';
  }
}

/** Profil fotoğrafı yok (404) — kaldırılmış/değiştirilmiş fotoğrafın eski adresi de buraya düşer. */
export class ProfilePhotoNotFoundError extends Error {
  constructor() {
    super('Profil fotoğrafı bulunamadı.');
    this.name = 'ProfilePhotoNotFoundError';
  }
}
