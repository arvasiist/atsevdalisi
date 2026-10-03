/**
 * ÜRETİM ORTAM DOĞRULAMASI (02.10.2026, Faz 13-A) — saf. `main.ts` uygulama
 * AÇILMADAN önce çağırır; `errors` doluysa süreç başlamaz.
 *
 * Neden: eksik/zayıf bir ortam değişkeni üretimde SESSİZ bir güvenlik açığı
 * olur — boş `JWT_SECRET` ile imzalanmış token'lar herkesçe üretilebilir,
 * `DISABLE_RATE_LIMIT=true` kaba kuvvete kapıyı açar, `localhost` CORS/
 * e-posta bağlantısı canlıda kırık bağlantı üretir. Bunların hiçbiri hata
 * VERMEZDİ; burada açılışta durdurulur.
 *
 * Geliştirme/test ortamında yalnızca uyarı üretir (yerel kurulumu kırmaz).
 */
export interface EnvCheckInput {
  NODE_ENV?: string;
  JWT_SECRET?: string;
  DATABASE_URL?: string;
  REDIS_URL?: string;
  CORS_ORIGIN?: string;
  WEB_BASE_URL?: string;
  DISABLE_RATE_LIMIT?: string;
  RESEND_API_KEY?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
}

export interface EnvCheckRules {
  minJwtSecretLength: number;
  forbiddenJwtSecrets: readonly string[];
}

export interface EnvCheckResult {
  errors: string[];
  warnings: string[];
}

const LOCAL_HOST = /localhost|127\.0\.0\.1|0\.0\.0\.0/i;

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

export function checkEnvironment(env: EnvCheckInput, rules: EnvCheckRules): EnvCheckResult {
  const production = env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];
  // Üretimde hata, diğer ortamlarda uyarı.
  const problem = (message: string): void => {
    (production ? errors : warnings).push(message);
  };

  const secret = env.JWT_SECRET ?? '';
  if (isBlank(secret)) {
    problem('JWT_SECRET tanımlı değil — oturum token\'ları imzalanamaz/güvensiz olur.');
  } else if (rules.forbiddenJwtSecrets.includes(secret)) {
    problem('JWT_SECRET bilinen bir test değeri — üretimde kullanılamaz.');
  } else if (secret.length < rules.minJwtSecretLength) {
    problem(`JWT_SECRET en az ${rules.minJwtSecretLength} karakter olmalı.`);
  }
  if (isBlank(env.DATABASE_URL)) problem('DATABASE_URL tanımlı değil.');
  if (isBlank(env.REDIS_URL)) problem('REDIS_URL tanımlı değil.');

  if (production) {
    if (isBlank(env.CORS_ORIGIN) || LOCAL_HOST.test(env.CORS_ORIGIN ?? '')) {
      errors.push('CORS_ORIGIN üretimde gerçek web adresi olmalı (localhost olamaz).');
    }
    if (isBlank(env.WEB_BASE_URL) || LOCAL_HOST.test(env.WEB_BASE_URL ?? '')) {
      errors.push('WEB_BASE_URL üretimde gerçek web adresi olmalı (e-posta bağlantıları buna gider).');
    }
    if (env.DISABLE_RATE_LIMIT === 'true') {
      errors.push('DISABLE_RATE_LIMIT=true üretimde YASAK (yalnızca test içindir).');
    }
    if (isBlank(env.RESEND_API_KEY)) {
      warnings.push('RESEND_API_KEY yok — şifre sıfırlama/doğrulama e-postaları GÖNDERİLMEZ.');
    }
    if (isBlank(env.GOOGLE_OAUTH_CLIENT_ID)) {
      warnings.push('GOOGLE_OAUTH_CLIENT_ID yok — Google girişi gizli kalır.');
    }
  }
  return { errors, warnings };
}
