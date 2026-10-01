import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAuthConfig } from '@at-sevdalisi/game-config';
import { normalizeEmail, validateEmail, validatePassword } from '../../../src/domain/auth/credentials';
import { InvalidCredentialsInputError } from '../../../src/domain/auth/errors';

/** E-posta + şifre kuralları (30.09.2026, migration 0046). */
describe('credentials — saf kurallar', () => {
  const config = loadAuthConfig();

  it('e-posta kırpılır ve küçük harfe çevrilir', () => {
    expect(normalizeEmail('  Ali@Ornek.COM ')).toBe('ali@ornek.com');
    expect(validateEmail('  Ali@Ornek.COM ', config)).toBe('ali@ornek.com');
  });

  it('biçimsiz / metin olmayan / çok uzun e-posta reddedilir', () => {
    for (const bad of ['ali', 'ali@', '@ornek.com', 'ali @ornek.com', 42, null]) {
      expect(() => validateEmail(bad, config)).toThrow(InvalidCredentialsInputError);
    }
    const tooLong = `${'a'.repeat(config.email.maxLength)}@ornek.com`;
    expect(() => validateEmail(tooLong, config)).toThrow(InvalidCredentialsInputError);
  });

  it('şifre sınırları config\'ten; şifre KIRPILMAZ', () => {
    expect(() => validatePassword('a'.repeat(config.password.minLength - 1), config)).toThrow(InvalidCredentialsInputError);
    expect(() => validatePassword('a'.repeat(config.password.maxLength + 1), config)).toThrow(InvalidCredentialsInputError);
    const spaced = ` ${'a'.repeat(config.password.minLength)} `;
    expect(validatePassword(spaced, config)).toBe(spaced);
  });

  it('email.maxLength migration 0046 CHECK\'iyle (254) eşleşir', () => {
    const migration = readFileSync(
      join(__dirname, '../../../../../database/migrations/0046_create_player_credentials.up.sql'),
      'utf8',
    );
    expect(migration).toContain(`char_length(email) BETWEEN 3 AND ${config.email.maxLength}`);
  });

  it('scrypt maliyeti 2\'nin kuvvetidir ve en az 2^14 (OWASP alt sınırı)', () => {
    const { cost } = config.scrypt;
    expect(Number.isInteger(Math.log2(cost))).toBe(true);
    expect(cost).toBeGreaterThanOrEqual(2 ** 14);
  });
});
