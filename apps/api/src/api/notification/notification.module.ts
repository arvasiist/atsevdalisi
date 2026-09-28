import { Module } from '@nestjs/common';
import { NOTIFICATION_REPOSITORY } from '../../application/ports/notification.repository';
import { RACE_INVITE_REPOSITORY } from '../../application/ports/race-invite.repository';
import { ListNotificationsUseCase } from '../../application/use-cases/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from '../../application/use-cases/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from '../../application/use-cases/mark-notification-read.use-case';
import { RespondRaceInviteUseCase } from '../../application/use-cases/respond-race-invite.use-case';
import { SendRaceInviteUseCase } from '../../application/use-cases/send-race-invite.use-case';
import { PostgresNotificationRepository } from '../../infrastructure/social/postgres-notification.repository';
import { PostgresRaceInviteRepository } from '../../infrastructure/social/postgres-race-invite.repository';
import { PlayerModule } from '../player/player.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SocialModule } from '../social/social.module';
import { NotificationController } from './notification.controller';

/**
 * Bildirimler + yarış daveti modülü (brief §16, §28, §42 PHASE 11).
 *
 * `SocialModule` ile AYNI desen, ÜÇ import:
 *
 * - `PlayerModule` → `PLAYER_REPOSITORY` (davet eden/hedef oyuncunun
 *   varlığı ve `displayName`i).
 * - `SocialModule` → `SOCIAL_REPOSITORY` (yalnızca `areFriends` — brief
 *   §16'nın "arkadaşlar birbirini davet edebilsin" kapısı). `SocialModule`
 *   bu token'ı ZATEN export ediyor (hediye diliminde eklendi), yani burada
 *   ikinci bir `useClass` kaydı YOK.
 * - `RealtimeModule` → `NOTIFICATION_NOTIFIER` (bildirim/davet yayını).
 *   Döngü YOK: `RealtimeModule` `RaceModule` + `ChatModule` import eder,
 *   ikisi de bu modülü tanımaz.
 *
 * `DatabaseModule` `@Global()` olduğundan `PG_POOL` ayrıca import edilmez.
 *
 * **`IdempotencyInterceptor` YOKTUR** — bu modüldeki hiçbir rota para/
 * mülkiyet değiştirmez (bkz. `NotificationController` doc yorumu).
 * **`RateLimitGuard` için de burada bir provider GEREKMEZ:** o guard
 * global `APP_GUARD` olarak kayıtlıdır ve `@RateLimit(...)` meta verisini
 * controller üzerinden okur (`SocialModule` ile AYNI durum).
 *
 * **`RACE_INVITE_REPOSITORY` / `NOTIFICATION_REPOSITORY` EXPORT EDİLMEZ**
 * (bilinçli): bu dilimde başka bir modül bunlara ihtiyaç duymaz. Hediye
 * diliminde `SOCIAL_REPOSITORY`in export edilme sebebi GERÇEK bir ikinci
 * tüketicinin (GiftModule) olmasıydı; ihtiyaç doğduğunda eklenir —
 * spekülatif export, "kim kullanıyor" sorusunu cevapsız bırakır.
 */
@Module({
  imports: [PlayerModule, SocialModule, RealtimeModule],
  controllers: [NotificationController],
  providers: [
    ListNotificationsUseCase,
    MarkAllNotificationsReadUseCase,
    MarkNotificationReadUseCase,
    SendRaceInviteUseCase,
    RespondRaceInviteUseCase,
    { provide: NOTIFICATION_REPOSITORY, useClass: PostgresNotificationRepository },
    { provide: RACE_INVITE_REPOSITORY, useClass: PostgresRaceInviteRepository },
  ],
})
export class NotificationModule {}
