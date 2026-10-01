/**
 * Şifre özetleme portu (30.09.2026). Uygulama katmanı `node:crypto`
 * bilmez; somut sınıf `infrastructure/auth/scrypt-password-hasher.ts`tir.
 */
export interface PasswordHasher {
  /** Yeni bir tuzla özetler; dönen metin parametreleri ve tuzu içerir. */
  hash(password: string): Promise<string>;
  /** Özet bu şifreye mi ait? Sabit zamanlı karşılaştırma. Bozuk özet → `false`. */
  verify(password: string, stored: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
