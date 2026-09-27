import { Module } from '@nestjs/common';
import { SOCIAL_REPOSITORY } from '../../application/ports/social.repository';
import { GetConversationUseCase } from '../../application/use-cases/get-conversation.use-case';
import { GetInboxUseCase } from '../../application/use-cases/get-inbox.use-case';
import { GetSocialOverviewUseCase } from '../../application/use-cases/get-social-overview.use-case';
import { RemoveFriendUseCase } from '../../application/use-cases/remove-friend.use-case';
import { RespondFriendRequestUseCase } from '../../application/use-cases/respond-friend-request.use-case';
import { SendFriendRequestUseCase } from '../../application/use-cases/send-friend-request.use-case';
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';
import { PostgresSocialRepository } from '../../infrastructure/social/postgres-social.repository';
import { PlayerModule } from '../player/player.module';
import { SocialController } from './social.controller';

/**
 * Arkadaşlık + mesajlaşma modülü (proje sahibinin açık talebi, 27.09.2026).
 *
 * `GrandstandModule`/`FeedModule` ile AYNI desen: `PlayerModule` import
 * edilir (`PLAYER_REPOSITORY` için — dört use-case "oyuncu var mı" sorusunu
 * onunla sorar), kendi repository'si `SOCIAL_REPOSITORY` token'ına bağlanır.
 * `DatabaseModule` `@Global()` olduğundan `PG_POOL` ayrıca import edilmez.
 *
 * **`IdempotencyInterceptor` YOKTUR** — bu modüldeki hiçbir rota para/
 * mülkiyet değiştirmez (bkz. `SocialController` doc yorumu); interceptor'ın
 * çözdüğü sorun burada mevcut değildir. **`RateLimitGuard` için de burada
 * bir provider GEREKMEZ:** o guard global `APP_GUARD` olarak kayıtlıdır ve
 * `@RateLimit(...)` meta verisini controller üzerinden okur
 * (`grandstand.controller.ts` ile AYNI durum).
 *
 * **`SOCIAL_REPOSITORY` EXPORT EDİLİR (hediye diliminde EKLENDİ):** bu
 * dilimde başka bir modül sosyal veriye ihtiyaç duymaz, AMA hediye
 * gönderimi (`GiftModule`) arkadaşlık ÖN kontrolünü `areFriends` ile
 * yapar ve o token'ı buradan tüketir. Export edilmemiş olsaydı
 * `GiftModule` aynı `useClass`'ı İKİNCİ kez bağlamak zorunda kalırdı —
 * "aynı token'ın iki örneği" (`GrandstandModule`'ün "neden export, neden
 * ikinci kayıt değil" notuyla AYNI gerekçe).
 *
 * **NOT (hediye dilimi):** `PostgresGiftRepository` bu repository'yi
 * KULLANMAZ — arkadaşlık sorgusunu kendi transaction'ının `PoolClient'ı
 * üzerinde yapar (bkz. `GiftModule` doc yorumu). Buradaki export, use-case
 * katmanındaki erken kontrol içindir.
 */
@Module({
  imports: [PlayerModule],
  controllers: [SocialController],
  providers: [
    GetSocialOverviewUseCase,
    SendFriendRequestUseCase,
    RespondFriendRequestUseCase,
    RemoveFriendUseCase,
    SendMessageUseCase,
    GetConversationUseCase,
    GetInboxUseCase,
    { provide: SOCIAL_REPOSITORY, useClass: PostgresSocialRepository },
  ],
  exports: [SOCIAL_REPOSITORY],
})
export class SocialModule {}
