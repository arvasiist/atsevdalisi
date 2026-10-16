/**
 * `player_credentials` portu (30.09.2026, migration 0046).
 */
export interface PlayerCredentialsRepository {
  /** E-posta (normalleştirilmiş) ile — giriş yolu. */
  findByEmail(email: string): Promise<{ playerId: string; passwordHash: string } | null>;
  /** Oyuncunun kayıtlı e-postası; yoksa `null` (misafir). */
  findEmailByPlayerId(playerId: string): Promise<string | null>;
  /**
   * Oyuncuya e-posta + şifre bağlar. Oyuncunun zaten kaydı varsa
   * `CredentialsAlreadySetError`, e-posta başkasındaysa
   * `EmailAlreadyRegisteredError` fırlatır — ikisi de VERİTABANI kısıtıyla
   * (PK + `lower(email)` tekil indeksi) zorlanır, ön kontrol yalnızca
   * kolaylıktır.
   */
  create(input: { playerId: string; email: string; passwordHash: string }): Promise<void>;

  /** ŞİFRE SIFIRLAMA (migration 0047) — oyuncunun en son bağlantısının oluşturulma anı; yoksa `null`. */
  findLatestResetRequestAt(playerId: string): Promise<Date | null>;

  /** Yeni bir sıfırlama bağlantısı — yalnızca ÖZETİ saklanır. */
  createResetToken(input: { playerId: string; tokenHash: string; expiresAt: Date }): Promise<void>;

  /**
   * Bağlantıyı TEK transaction'da tüketir: kullanılmamış ve süresi dolmamış
   * bir satır varsa (`FOR UPDATE`) şifre özetini değiştirir ve oyuncunun
   * TÜM bekleyen bağlantılarını kullanılmış sayar. Geçersizse `null`;
   * başarılıysa oyuncu kimliği.
   */
  consumeResetToken(input: { tokenHash: string; now: Date; passwordHash: string }): Promise<string | null>;

  /** E-POSTA DOĞRULAMA (migration 0058) — kayıtlı e-posta ve doğrulanma anı; misafirde `null`. */
  findVerificationState(playerId: string): Promise<{ email: string; verifiedAt: Date | null } | null>;

  /** Oyuncunun en son doğrulama bağlantısının oluşturulma anı; yoksa `null`. */
  findLatestVerificationRequestAt(playerId: string): Promise<Date | null>;

  /** Yeni doğrulama bağlantısı — yalnızca ÖZETİ ve hedef e-posta saklanır. */
  createVerificationToken(input: { playerId: string; email: string; tokenHash: string; expiresAt: Date }): Promise<void>;

  /**
   * Bağlantıyı TEK transaction'da tüketir (`FOR UPDATE`): kullanılmamış,
   * süresi dolmamış VE hesabın ŞU ANKİ e-postasıyla eşleşen bir satır
   * varsa `email_verified_at`ı yazar ve oyuncunun bekleyen tüm
   * bağlantılarını kullanılmış sayar. Geçersizse `null`.
   */
  consumeVerificationToken(input: { tokenHash: string; now: Date }): Promise<string | null>;
}

export const PLAYER_CREDENTIALS_REPOSITORY = Symbol('PLAYER_CREDENTIALS_REPOSITORY');
