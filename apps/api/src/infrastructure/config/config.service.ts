import { Injectable } from '@nestjs/common';
import {
  loadCareConfig,
  loadEconomyConfig,
  loadGeneticsConfig,
  loadHorseGrowthConfig,
  loadOnlineConfig,
  loadProgressionConfig,
  loadRaceConfig,
  loadStableConfig,
  loadTrainingConfig,
  loadWeatherConfig,
} from '@at-sevdalisi/game-config';

/**
 * Ortam değişkenleri + oyun dengesi config'lerine tek noktadan erişim.
 * Use-case'ler magic number/hard-coded değer yerine bu servisi kullanır
 * (bkz. docs/CODING_CONVENTIONS.md §3).
 */
@Injectable()
export class AppConfigService {
  readonly env = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? '',
    jwtSecret: process.env.JWT_SECRET ?? '',
    idempotencyKeyTtlSeconds: Number(process.env.IDEMPOTENCY_KEY_TTL_SECONDS ?? 86400),
    // AUDIT_REPORT.md Bulgu S1 hardening (bu oturum) — brief §41/§50
    // Google/Apple Sign-In. Bizim KENDİ oturum JWT'imizin geçerlilik
    // süresi (`TokenService.sign`, bkz. o dosyanın doc yorumu) —
    // sağlayıcı ID token'larının kendi süreleriyle İLGİSİZDİR.
    jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 60 * 60 * 24 * 30),
    // Google Cloud Console'da oluşturulan OAuth 2.0 Client ID (Web/iOS/
    // Android türlerinden en az biri) — `google-auth-library`'nin
    // `verifyIdToken` audience kontrolü için ZORUNLUDUR. Proje sahibi
    // henüz gerçek bir Google OAuth uygulaması OLUŞTURMADI (bkz. görev
    // takibi) — boş string iken `GoogleAppleIdentityProvider.verifyGoogleIdToken`
    // bilinçli olarak HER ZAMAN `InvalidProviderTokenError` fırlatır (yanlışlıkla
    // doğrulamasız bir "geçti" durumuna asla düşülmez).
    googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    // Apple Developer'da oluşturulan Services ID (Sign in with Apple'ın
    // `aud`/audience değeri) — `googleOAuthClientId` ile AYNI gerekçe.
    appleOAuthClientId: process.env.APPLE_OAUTH_CLIENT_ID ?? '',
  };

  readonly race = loadRaceConfig();
  readonly training = loadTrainingConfig();
  readonly economy = loadEconomyConfig();
  readonly genetics = loadGeneticsConfig();
  readonly weather = loadWeatherConfig();
  readonly horseGrowth = loadHorseGrowthConfig();
  readonly progression = loadProgressionConfig();
  readonly stable = loadStableConfig();
  readonly care = loadCareConfig();
  // FAZ 1 wiring, on dördüncü dilim (bu oturum) — PvP Eşleştirme (brief
  // §41/§43). `loadOnlineConfig()` FAZ 7'den beri `@at-sevdalisi/game-config`'te
  // hazırdı ama hiçbir yerde çağrılmıyordu (bkz. docs/ROADMAP.md).
  readonly online = loadOnlineConfig();
}
