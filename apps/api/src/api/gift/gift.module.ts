import { Module } from '@nestjs/common';
import { GIFT_REPOSITORY } from '../../application/ports/gift.repository';
import { ListMyGiftsUseCase } from '../../application/use-cases/list-my-gifts.use-case';
import { SendGiftUseCase } from '../../application/use-cases/send-gift.use-case';
import { PostgresGiftRepository } from '../../infrastructure/gift/postgres-gift.repository';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { PlayerModule } from '../player/player.module';
import { SocialModule } from '../social/social.module';
import { GiftController } from './gift.controller';

/**
 * Hediye gönderimi modülü (proje sahibinin açık talebi, 27.09.2026).
 *
 * **İKİ modül import edilir:**
 *   - `PlayerModule` — `SendGiftUseCase`/`ListMyGiftsUseCase` "oyuncu var mı"
 *     sorusunu `PLAYER_REPOSITORY` ile sorar.
 *   - `SocialModule` — `SendGiftUseCase` arkadaşlık ÖN kontrolünü
 *     `SOCIAL_REPOSITORY.areFriends` ile yapar. Bunun için `SocialModule`
 *     bu dilimde `SOCIAL_REPOSITORY` token'ını **EXPORT EDECEK ŞEKİLDE
 *     DEĞİŞTİRİLDİ** — bkz. o modülün doc yorumu: orada "hediye gönderimi
 *     ayrı dilim, kararı o dilim verir" diye not edilmişti; karar bu.
 *
 * **NEDEN `PostgresGiftRepository` arkadaşlığı KENDİ transaction'ında
 * TEKRAR SORGULAR (neden `SOCIAL_REPOSITORY`'yi repository'ye de
 * enjekte etmiyoruz):** o sorgu bir `PoolClient` üzerinde, kilitli
 * satırlarla AYNI transaction'da koşmak ZORUNDADIR; `SocialRepository` ise
 * havuzdan kendi bağlantısını alır (`this.pool.query`). Onu buraya
 * enjekte etmek, "aynı transaction" garantisini SESSİZCE kırardı. Bu
 * yüzden `friendships` sorgusu repository'nin içinde, üç satırlık düz SQL
 * olarak durur — `PostgresMarketPurchaseRepository`'nin `horses` sorgusunu
 * kendi içinde tutmasıyla AYNI gerekçe.
 *
 * **`SOCIAL_REPOSITORY` İKİ KEZ BAĞLANMAZ:** `GiftModule` onu `SocialModule`
 * üzerinden (export edilmiş hâliyle) tüketir; ikinci bir `useClass` kaydı
 * "aynı token'ın iki örneği" demek olurdu ve `PostgresSocialRepository`
 * durum taşırsa (bugün taşımıyor) ikisi AYRIŞIRDI.
 */
@Module({
  imports: [PlayerModule, SocialModule],
  controllers: [GiftController],
  providers: [
    SendGiftUseCase,
    ListMyGiftsUseCase,
    IdempotencyInterceptor,
    { provide: GIFT_REPOSITORY, useClass: PostgresGiftRepository },
  ],
})
export class GiftModule {}
