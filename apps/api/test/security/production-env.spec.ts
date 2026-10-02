import { describe, expect, it } from 'vitest';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import { checkEnvironment, type EnvCheckInput } from '../../src/infrastructure/ops/production-env';
import { resolveRequestId } from '../../src/api/middleware/request-id.middleware';

/**
 * Faz 13-A (02.10.2026) — üretimde eksik/zayıf ortam değişkeniyle açılmama
 * kuralı ve istek kimliği temizliği. Kurallar `config/ops.config.json`dan
 * okunur; test de ORADAN okur (kopya tutmaz).
 */
const rules = loadOpsConfig().productionEnv;
const strongSecret = 'x'.repeat(rules.minJwtSecretLength);

const healthyProduction: EnvCheckInput = {
  NODE_ENV: 'production',
  JWT_SECRET: strongSecret,
  DATABASE_URL: 'postgres://u:p@db:5432/at',
  REDIS_URL: 'redis://cache:6379',
  CORS_ORIGIN: 'https://atsevdalisi.example',
  WEB_BASE_URL: 'https://atsevdalisi.example',
  RESEND_API_KEY: 're_x',
  GOOGLE_OAUTH_CLIENT_ID: 'id.apps.googleusercontent.com',
};

describe('checkEnvironment — üretim ortamı', () => {
  it('eksiksiz üretim ortamı geçer, uyarı yok', () => {
    expect(checkEnvironment(healthyProduction, rules)).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ['JWT_SECRET boş', { JWT_SECRET: '' }],
    ['JWT_SECRET kısa', { JWT_SECRET: 'x'.repeat(rules.minJwtSecretLength - 1) }],
    ['JWT_SECRET CI test değeri', { JWT_SECRET: rules.forbiddenJwtSecrets[0] }],
    ['DATABASE_URL yok', { DATABASE_URL: undefined }],
    ['REDIS_URL yok', { REDIS_URL: '  ' }],
    ['CORS_ORIGIN yok', { CORS_ORIGIN: undefined }],
    ['CORS_ORIGIN localhost', { CORS_ORIGIN: 'http://localhost:3000' }],
    ['WEB_BASE_URL 127.0.0.1', { WEB_BASE_URL: 'http://127.0.0.1:3000' }],
    ['hız sınırı kapalı', { DISABLE_RATE_LIMIT: 'true' }],
  ])('%s → açılış HATASI', (_label, patch) => {
    const result = checkEnvironment({ ...healthyProduction, ...patch }, rules);
    expect(result.errors).toHaveLength(1);
  });

  it('e-posta / Google anahtarı yoksa yalnızca UYARI (açılır)', () => {
    const result = checkEnvironment({ ...healthyProduction, RESEND_API_KEY: '', GOOGLE_OAUTH_CLIENT_ID: undefined }, rules);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(2);
  });

  it('geliştirmede eksikler UYARIDIR, açılışı durdurmaz', () => {
    const result = checkEnvironment({ NODE_ENV: 'development' }, rules);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('mesajlar gizli değeri İÇERMEZ', () => {
    const secret = rules.forbiddenJwtSecrets[0]!;
    const result = checkEnvironment({ ...healthyProduction, JWT_SECRET: secret }, rules);
    expect(result.errors.join(' ')).not.toContain(secret);
  });
});

describe('resolveRequestId', () => {
  const max = loadOpsConfig().requestId.maxLength;
  it('güvenli ve sınır içi kimliği korur', () => {
    expect(resolveRequestId('lb-abc_123.x', max)).toBe('lb-abc_123.x');
  });
  it('bozuk, uzun ya da eksik kimlik yerine yenisini üretir', () => {
    for (const bad of [undefined, '', 'a b', 'satır\nenjeksiyon', 'x'.repeat(max + 1), ['dizi']]) {
      const id = resolveRequestId(bad, max);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
