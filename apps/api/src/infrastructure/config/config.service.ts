import { Injectable } from '@nestjs/common';
import {
  loadCareConfig,
  loadEconomyConfig,
  loadFarmConfig,
  loadGeneticsConfig,
  loadGiftConfig,
  loadGrandstandConfig,
  loadHorseGrowthConfig,
  loadOnlineConfig,
  loadProgressionConfig,
  loadRaceConfig,
  loadSocialConfig,
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
  // brief §32 "Çiftlik" (bu turda EKLENDİ) — `loadFarmConfig()` FAZ 2'den
  // beri `@at-sevdalisi/game-config`'te hazırdı ama HİÇBİR YERDE
  // çağrılmıyordu: `domain/farm/farm.ts` yalnızca birim testinden
  // besleniyordu ve `facilities` tablosu ölü şemaydı. Bu satır, o zincirin
  // ilk halkasıdır.
  readonly farm = loadFarmConfig();
  // TRIBÜN (proje sahibinin açık talebi, 27.09.2026) — `config/grandstand.config.json`
  // bu dilimde OLUŞTURULDU; bilet fiyatı/izleme penceresi/liste limitleri
  // use-case'lerde hard-code EDİLMEZ (CLAUDE.md "SİHİRLİ SAYI YOK").
  readonly grandstand = loadGrandstandConfig();
  // ARKADAŞLIK + MESAJLAŞMA (proje sahibinin açık talebi, 27.09.2026) —
  // `config/social.config.json` bu dilimde OLUŞTURULDU. `maxMessageLength`
  // DB CHECK'iyle (`direct_messages.body`) EŞLEŞMEK ZORUNDADIR; liste
  // limitleri ve bekleyen istek tavanı da use-case'lerde hard-code
  // EDİLMEZ (CLAUDE.md "SİHİRLİ SAYI YOK").
  readonly social = loadSocialConfig();
  // HEDİYE GÖNDERİMİ (proje sahibinin açık talebi, 27.09.2026) —
  // `config/gift.config.json` bu dilimde OLUŞTURULDU. Miktar sınırları,
  // günlük hediye tavanı + penceresi ve izinli para birimleri use-case'te
  // hard-code EDİLMEZ (CLAUDE.md "SİHİRLİ SAYI YOK"). `allowedCurrencies`
  // brief §13/§14'ün hediye yolundaki karşılığıdır: ileride eklenen bir
  // birim (ör. etkinlik para birimi) bu listeye AÇIKÇA yazılmadıkça
  // hediye edilemez.
  readonly gift = loadGiftConfig();
}
