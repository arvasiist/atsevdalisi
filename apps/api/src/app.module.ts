import { Module } from '@nestjs/common';
import { AuthModule } from './api/auth/auth.module';
import { CareModule } from './api/care/care.module';
import { EconomyModule } from './api/economy/economy.module';
import { HealthModule } from './api/health/health.module';
import { HorseModule } from './api/horse/horse.module';
import { MarketModule } from './api/market/market.module';
import { MatchmakingModule } from './api/matchmaking/matchmaking.module';
import { PlayerModule } from './api/player/player.module';
import { RateLimitModule } from './api/rate-limit/rate-limit.module';
import { RaceModule } from './api/race/race.module';
import { StableModule } from './api/stable/stable.module';
import { TrainingModule } from './api/training/training.module';
import { AppConfigModule } from './infrastructure/config/config.module';
import { TokenModule } from './infrastructure/auth/token.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';

/**
 * Kök modül. FAZ 1 wiring (bu oturum) `PlayerModule` + `DatabaseModule`'ü
 * ekledi (bkz. docs/ROADMAP.md "FAZ 1 wiring — İlk uçtan uca dilim");
 * ikinci dilimde `HorseModule` eklendi (yalnızca okuma uç noktaları +
 * kayıtta başlangıç atı verme); üçüncü dilimde `StableModule` eklendi
 * (Ahır Özeti); dördüncü dilimde `TrainingModule` eklendi (brief §10
 * Antrenman); beşinci dilimde `CareModule` eklendi (brief §11-12
 * Bakım/Besleme — `POST /horses/{id}/care`+`/feed`); altıncı dilimde
 * `StableModule`'e `POST /players/{id}/stable/upgrade` eklendi (Economy'nin
 * `debit`'i + satır kilitleme, bkz. docs/ARCHITECTURE.md §9.3); yedinci
 * dilimde `EconomyModule` eklendi (brief §37 Günlük Ödül —
 * `POST /players/{id}/daily-reward`, Economy'nin `credit`'i, bkz. "FAZ 1
 * wiring — Yedinci dilim"); sekizinci dilimde `RaceModule` eklendi (brief
 * §6 Race Engine — `POST /horses/{id}/practice-race`, `simulateRace`'in
 * İLK gerçek orkestrasyonu, bkz. "FAZ 1 wiring — Sekizinci dilim");
 * dokuzuncu dilimde `RedisModule` BAĞLANDI (`@Global()` olduğundan bir
 * kez buraya eklenmesi yeterli — bkz. `infrastructure/redis/redis.module.ts`)
 * ve Pratik Yarış'a giriş ücreti + ödül eklendi (Economy'nin `debit`+
 * `credit`'i TEK bir `updateWithLock` altında, brief §54'ün Idempotency-Key
 * altyapısının İLK gerçek kullanıcısı — bkz. "FAZ 1 wiring — Dokuzuncu
 * dilim"). Onuncu dilimde `StableModule`'ün KENDİ `stable/upgrade`
 * endpoint'ine de `IdempotencyInterceptor` eklendi (dokuzuncu dilimde
 * bilinçli olarak açık bırakılan tek güvenlik eksiği kapatıldı, bkz.
 * "FAZ 1 wiring — Onuncu dilim"). On birinci dilimde `MarketModule`
 * eklendi (brief §30 At Pazarı — `domain/market/market.ts`'in FAZ 0'dan
 * beri hazır ama hiç wiring edilmemiş `createListingDraft`/
 * `purchaseListing`/`cancelListing`'i gerçek veritabanına bağlar; bu,
 * Economy'nin `transfer` fonksiyonunun VE `PlayerRepository.
 * updateTwoWithLock`'un İLK gerçek kullanıcısıdır — bkz. "FAZ 1 wiring —
 * On birinci dilim"). On dördüncü dilimde `MatchmakingModule` eklendi
 * (brief §41 PvP Eşleştirme — `domain/online/{matchmaking,elo,race-room}.ts`'in
 * FAZ 7'den beri hazır ama hiç wiring edilmemiş saf fonksiyonlarını
 * gerçek veritabanına ve mevcut Race Engine'e (`simulateRace`) bağlar,
 * TAMAMEN senkron bir tasarımla — bkz. "FAZ 1 wiring — On dördüncü
 * dilim"). Geriye kalan büyük maddeler: gerçek zamanlı/WebSocket maç
 * bildirimi, tam "yarış takvimi" (zamanlanmış çok-katılımcılı yarışlar),
 * turnuva/kulüp/sıralama/sezon (FAZ 7'nin geri kalanı).
 *
 * AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum) — `RateLimitModule`
 * eklendi (kayıt/giriş rotalarına Redis tabanlı rate limiting, bkz.
 * `api/rate-limit/rate-limit.guard.ts` doc yorumu).
 *
 * AUDIT_REPORT.md Bulgu S1 (Critical) hardening (bu oturum) — brief §41/§50
 * Google/Apple Sign-In. `TokenModule` (`@Global()`, `DatabaseModule`/
 * `RedisModule` ile AYNI desen) burada BİR KEZ eklenir — `TOKEN_SERVICE`
 * artık her yerde (kayıt, giriş, `AuthGuard`) ayrıca `imports`'a eklemeye
 * GEREK OLMADAN enjekte edilebilir. `AuthModule` ise `AuthGuard`'ı
 * `APP_GUARD` ile GLOBAL olarak kaydeder (bkz. o modülün doc yorumu) —
 * bu, `@Public()` işaretli olmayan HER rotanın (health/register/login
 * hariç TÜMÜ) artık geçerli bir JWT gerektirdiği anlamına gelir.
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    TokenModule,
    HealthModule,
    AuthModule,
    PlayerModule,
    HorseModule,
    StableModule,
    TrainingModule,
    CareModule,
    EconomyModule,
    RaceModule,
    MarketModule,
    MatchmakingModule,
    RateLimitModule,
  ],
})
export class AppModule {}
