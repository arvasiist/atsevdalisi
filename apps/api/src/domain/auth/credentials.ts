import type { AuthConfig } from '@at-sevdalisi/game-config';
import { InvalidCredentialsInputError } from './errors';

/**
 * E-posta + şifre girişinin SAF kuralları (30.09.2026, migration 0046).
 * Framework'süz: DTO dekoratörleri esbuild altında atlanabildiği için
 * (CLAUDE.md kural 5) doğrulamanın asıl yeri burasıdır ve girdiler
 * `unknown` alınır.
 */

/**
 * Pratik bir e-posta biçimi: `yerel@alan.uzantı`, boşluksuz. RFC 5322'nin
 * tamamı değildir ve olması da gerekmez — amaç yazım hatasını yakalamak;
 * adresin gerçekten var olup olmadığını hiçbir biçim kontrolü söyleyemez.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Kırpılmış + küçük harfe çevrilmiş e-posta — tekillik ve giriş aynı biçimle karşılaştırır. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: unknown, config: Pick<AuthConfig, 'email'>): string {
  if (typeof raw !== 'string') {
    throw new InvalidCredentialsInputError('E-posta bir metin olmalıdır.');
  }
  const email = normalizeEmail(raw);
  if (email.length > config.email.maxLength || !EMAIL_PATTERN.test(email)) {
    throw new InvalidCredentialsInputError('Geçerli bir e-posta adresi girin.');
  }
  return email;
}

/**
 * Şifre kırpılMAZ — baştaki/sondaki boşluk da şifrenin parçasıdır; kırpmak
 * kullanıcının yazdığından farklı bir şifre saklamak olurdu.
 */
export function validatePassword(raw: unknown, config: Pick<AuthConfig, 'password'>): string {
  if (typeof raw !== 'string') {
    throw new InvalidCredentialsInputError('Şifre bir metin olmalıdır.');
  }
  if (raw.length < config.password.minLength || raw.length > config.password.maxLength) {
    throw new InvalidCredentialsInputError(
      `Şifre ${config.password.minLength}–${config.password.maxLength} karakter olmalıdır.`,
    );
  }
  return raw;
}
