import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { RequestIdMiddleware } from './api/middleware/request-id.middleware';
import { AdminModule } from './api/admin/admin.module';
import { AuthModule } from './api/auth/auth.module';
import { BreedingModule } from './api/breeding/breeding.module';
import { CareModule } from './api/care/care.module';
import { ClubModule } from './api/club/club.module';
import { EconomyModule } from './api/economy/economy.module';
import { EquipmentModule } from './api/equipment/equipment.module';
import { FarmModule } from './api/farm/farm.module';
import { FeedModule } from './api/feed/feed.module';
import { GiftModule } from './api/gift/gift.module';
import { GrandstandModule } from './api/grandstand/grandstand.module';
import { HealthModule } from './api/health/health.module';
import { HorseModule } from './api/horse/horse.module';
import { JockeyModule } from './api/jockey/jockey.module';
import { MarketModule } from './api/market/market.module';
import { MatchmakingModule } from './api/matchmaking/matchmaking.module';
import { NotificationModule } from './api/notification/notification.module';
import { PlayerModule } from './api/player/player.module';
import { RateLimitModule } from './api/rate-limit/rate-limit.module';
import { RaceModule } from './api/race/race.module';
import { RealtimeModule } from './api/realtime/realtime.module';
import { SeasonModule } from './api/season/season.module';
import { SocialModule } from './api/social/social.module';
import { StableModule } from './api/stable/stable.module';
import { StaffModule } from './api/staff/staff.module';
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
 * AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum, iki dilim) —
 * `RateLimitModule` eklendi (kayıt/giriş + ekonomi uçlarına Redis tabanlı
 * rate limiting, bkz. `api/rate-limit/rate-limit.guard.ts` doc yorumu).
 * ÖNEMLİ — `imports` dizisinde `RateLimitModule` `AuthModule`'den SONRA
 * gelir: `keyBy: 'player'` (satın alma/ödül talebi) `AuthGuard`'ın
 * doldurduğu `request.player.id`'ye bağımlıdır, ve Nest birden fazla
 * `APP_GUARD`'ı bu dizideki modül SIRASINA göre çalıştırır — bu sıra
 * BOZULURSA `RateLimitGuard` `AuthGuard`'dan ÖNCE çalışır ve
 * `request.player` henüz dolmamış olur (bkz. `rate-limit.guard.ts`'teki
 * `keyBy: 'player'` doc yorumu).
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
    // brief §32 "Çiftlik" (bu turda EKLENDİ) — `facilities` tablosu ve
    // `domain/farm/farm.ts` FAZ 2'den beri hazırdı ama ikisini bağlayan
    // hiçbir katman yoktu; bkz. `api/farm/farm.module.ts` doc yorumu.
    FarmModule,
    TrainingModule,
    CareModule,
    // brief §12 Beslenme / yem dükkânı (bu turda EKLENDİ) — yem kalemleri
    // somutlaştı, elmasla satın alma + stoktan besleme + günlük hediye
    // bağlandı; bkz. `api/feed/feed.module.ts` doc yorumu.
    FeedModule,
    EconomyModule,
    RaceModule,
    // TRIBÜN (proje sahibinin açık talebi, 27.09.2026 — "tribüne ücretli
    // girişler olsun, insanlar yarışları izleyebilsin") — bkz.
    // `api/grandstand/grandstand.module.ts` doc yorumu. `RaceModule`'den
    // SONRA durması ZORUNLU DEĞİL (`RaceModule` bu modülü kendi `imports`'una
    // alır ve Nest modül grafiğini sıraya bakmadan çözer) ama okunabilirlik
    // için ilişkili olduğu `RaceModule`'ün hemen yanına konuldu.
    GrandstandModule,
    // ARKADAŞLIK + MESAJLAŞMA (proje sahibinin açık talebi, 27.09.2026 —
    // "arkadaşlık + mesajlaşma") — bkz. `api/social/social.module.ts` doc
    // yorumu. `GrandstandModule`'e komşu durmasının tek gerekçesi
    // okunabilirliktir: ikisi de aynı turda eklenen, birbirinden BAĞIMSIZ
    // dilimlerdir (Nest modül grafiğini sıraya bakmadan çözer).
    SocialModule,
    // HEDİYE GÖNDERİMİ (proje sahibinin açık talebi, 27.09.2026 — üç
    // parçanın üçüncüsü: "hediye gönderimi") — bkz.
    // `api/gift/gift.module.ts` doc yorumu. `SocialModule`'ün HEMEN
    // ardında durur çünkü onu `imports`'una alır (arkadaşlık ön kontrolü);
    // Nest modül grafiğini sıraya bakmadan çözer, bu komşuluk yalnızca
    // okunabilirlik içindir.
    GiftModule,
    // KULÜP (brief §44, 01.10.2026) — bkz. `api/club/club.module.ts`.
    ClubModule,
    // PERSONEL (brief §33, 01.10.2026) — bkz. `api/staff/staff.module.ts`.
    StaffModule,
    // SEZON (brief §69, 01.10.2026) — bkz. `api/season/season.module.ts`.
    SeasonModule,
    // ÇİFTLEŞTİRME (proje sahibinin talebi — soy ağacı veri zincirinin
    // ÜÇÜNCÜ parçası; okuma yolu `HorseModule`'deki
    // `GET /horses/:id/pedigree`). `HorseModule`'ün HEMEN ardında durması
    // okunabilirlik içindir (aynı veri zinciri); Nest modül grafiğini
    // sıraya bakmadan çözer ve bu modül `HorseModule`'ü import ETMEZ
    // (bkz. `api/breeding/breeding.module.ts` doc yorumu).
    BreedingModule,
    MarketModule,
    MatchmakingModule,
    RateLimitModule,
    // claude/hizli-bitirme-plani.md'nin proje sahibi tarafından
    // önceliklendirdiği "düşük riskli, karar gerektirmeyen" dilim (bu
    // turda EKLENDİ) — bkz. `api/equipment/equipment.module.ts` doc yorumu.
    EquipmentModule,
    // JOKEY (brief §13, §42 PHASE 6.2 — proje sahibinin "sırayla yap"
    // talimatı, 29.09.2026). `RaceModule`'ün HEMEN ardında durması
    // okunabilirlik içindir: `jockeySkillComposite`in motora girdiği yer
    // orasıdır (`EntrantSnapshotBuilder`), burası ise o değeri ÜRETEN
    // jokeyin sahiplik/okuma uçlarıdır.
    JockeyModule,
    // AUDIT_REPORT.md Bulgu F2 (bu oturum) — bkz. `api/realtime/race.gateway.ts`
    // doc yorumu. `RaceModule`'DEN SONRA gelmesi ZORUNLU DEĞİL (WebSocket
    // guard'ı `AuthGuard`'ın AKSİNE global `APP_GUARD` DEĞİL, kendi
    // `handleConnection`'ında bağımsız doğrulama yapar) ama okunabilirlik
    // için ilişkili olduğu `RaceModule`'e yakın, dizinin sonuna eklendi.
    RealtimeModule,
    // BİLDİRİMLER + YARIŞ DAVETİ (brief §16/§28, §42 PHASE 11) — bkz.
    // `api/notification/notification.module.ts` doc yorumu. `RealtimeModule`'ün
    // HEMEN ardında durur çünkü onu `imports`'una alır (`NOTIFICATION_NOTIFIER`
    // yayını için) ve `SocialModule`'ü de (arkadaşlık kapısı); Nest modül
    // grafiğini sıraya bakmadan çözer, bu komşuluk yalnızca okunabilirlik
    // içindir.
    NotificationModule,
    // YÖNETİM (ADMIN) — brief §34 "ADMIN PANEL", §42 PHASE 15-B (proje
    // sahibinin "brieften kontrol edelim sırayla" talimatı, 28.09.2026) —
    // bkz. `api/admin/admin.module.ts` doc yorumu. `NotificationModule`'ün
    // ardında durması yalnızca kronolojiktir (en son eklenen dilim); Nest
    // modül grafiğini sıraya bakmadan çözer ve bu modül HİÇBİR modülü
    // import ETMEZ (yalnızca `DatabaseModule`, o da `@Global()`).
    AdminModule,
  ],
})
export class AppModule implements NestModule {
  // 02.10.2026 (Faz 13-A) — istek kimliği HER rotada (hata zarfı + yanıt
  // başlığı). Modülde kaydedilir ki e2e önyüklemesi de aynısını alsın.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
