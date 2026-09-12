/**
 * Kayıt/kimlik doğrulama kuralları (brief §7 Player, §31/§42 hesap oluşturma).
 *
 * NOT (docs/ARCHITECTURE.md §10 açık karar maddesi): brief, kimlik doğrulama
 * SAĞLAYICISINI (email/şifre mi, OAuth mu, misafir girişi mi) belirtmez —
 * bu, kullanıcıdan henüz yanıt bekleyen açık bir mimari karardır. Bu dosya
 * sağlayıcıdan bağımsız, evrensel geçerli kuralları (kullanıcı adı, görünen
 * ad, şifre GÜÇLÜ ise) içerir; asıl hash'leme algoritması (bcrypt/argon2 vb.)
 * bir infrastructure detayıdır ve domain'e SIZDIRILMAZ (bkz. `PasswordHasher`
 * arayüzü — application/infrastructure katmanı bunu somutlaştırır).
 */

import { InvalidDisplayNameError, InvalidUsernameError, WeakPasswordError } from './errors';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_PATTERN = /^[a-z0-9_]+$/;

const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 30;

const PASSWORD_MIN_LENGTH = 8;

/** `players.username` (brief §7: UNIQUE, DB'de). Küçük harf, rakam, alt çizgi. */
export function validateUsername(username: string): void {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    throw new InvalidUsernameError(
      `Kullanıcı adı ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} karakter arasında olmalıdır.`,
    );
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new InvalidUsernameError('Kullanıcı adı yalnızca küçük harf, rakam ve alt çizgi (_) içerebilir.');
  }
}

/** `players.display_name` — oyun içinde görünen isim, daha esnek kurallar. */
export function validateDisplayName(displayName: string): void {
  const trimmed = displayName.trim();
  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH || trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new InvalidDisplayNameError(
      `Görünen ad ${DISPLAY_NAME_MIN_LENGTH}-${DISPLAY_NAME_MAX_LENGTH} karakter arasında olmalıdır.`,
    );
  }
}

export interface PasswordStrengthCheck {
  valid: boolean;
  reasons: string[];
}

/**
 * Şifre GÜÇLÜ mü kontrol eder (asla şifreyi kendisi saklamaz/hash'lemez).
 * Kurallar: en az 8 karakter, en az bir harf, en az bir rakam.
 */
export function checkPasswordStrength(password: string): PasswordStrengthCheck {
  const reasons: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    reasons.push(`en az ${PASSWORD_MIN_LENGTH} karakter olmalı`);
  }
  if (!/[a-zA-Z]/.test(password)) {
    reasons.push('en az bir harf içermeli');
  }
  if (!/[0-9]/.test(password)) {
    reasons.push('en az bir rakam içermeli');
  }

  return { valid: reasons.length === 0, reasons };
}

/** `checkPasswordStrength` başarısızsa `WeakPasswordError` fırlatan yardımcı. */
export function assertPasswordIsStrong(password: string): void {
  const result = checkPasswordStrength(password);
  if (!result.valid) {
    throw new WeakPasswordError(result.reasons);
  }
}

/**
 * Domain katmanı asla gerçek bir hash algoritması bilmez (framework/lib
 * bağımlılığı yasak) — infrastructure katmanı bu arayüzü (örn. bcrypt veya
 * argon2 ile) somutlaştırır ve application katmanına enjekte eder.
 */
export interface PasswordHasher {
  hash(plainTextPassword: string): Promise<string>;
  verify(plainTextPassword: string, passwordHash: string): Promise<boolean>;
}
