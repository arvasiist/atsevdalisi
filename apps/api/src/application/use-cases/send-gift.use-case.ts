import { Inject, Injectable } from '@nestjs/common';
import type { SendGiftResult } from '@at-sevdalisi/shared-types';
import { GiftRequiresFriendshipError } from '../../domain/gift/errors';
import { assertGiftConfigIsValid, assertNotSelfGift, resolveGiftCurrency } from '../../domain/gift/gift';
import { parseGiftAmount } from '../../domain/gift/validation';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { canonicalPair } from '../../domain/social/friendship';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { GIFT_REPOSITORY, type GiftRepository } from '../ports/gift.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * Hediye gönderme (proje sahibinin açık talebi, 27.09.2026 — üç parçanın
 * üçüncüsü). `POST /players/:id/gifts`.
 *
 * **Akış — sıra ÖNEMLİDİR:**
 *   1. `assertGiftConfigIsValid` — bozuk config "hediye hiç gönderilemez"
 *      ya da "günlük tavan sessizce kapalı" gibi görünmez bir duruma
 *      dönüşmesin diye, HİÇBİR ŞEY yapılmadan ÖNCE (`PurchaseRaceTicketUseCase`'in
 *      `assertTicketPriceIsValid` adımıyla AYNI gerekçe).
 *   2. `assertNotSelfGift` — kendine hediye (400).
 *   3. `parseGiftAmount` + `resolveGiftCurrency` — HAM gövde değerleri
 *      (CLAUDE.md "Kardeş tuzak": DTO dekoratörleri Vitest/esbuild altında
 *      atlanır, gövdedeki değer `number`/`Currency` olduğu iddia edilen bir
 *      `string` olabilir).
 *   4. Alıcı okunur; yoksa `PlayerNotFoundError` (404) — aksi halde FK
 *      `23503` ile 500 dönerdi (`SendMessageUseCase`'in AYNI adımı).
 *      (`recipientId`nin ŞEKİL kontrolü burada DEĞİL, `GiftController.
 *      sendGift`tedir — 400 döner, bkz. o dosyanın "İKİNCİ SAVUNMA HATTI"
 *      notu. Aynı koruma `social.controller.ts`/`market.controller.ts`te de
 *      CONTROLLER katmanındadır; domain Nest'i import ETMEZ.)
 *   5. Arkadaşlık ÖN kontrolü (`areFriends`) — **erken ve anlaşılır bir
 *      hata** içindir, güvenlik için DEĞİL: asıl kapı
 *      `PostgresGiftRepository.sendGift`'in İÇİNDE, kilitli satırlarla
 *      TEKRARLANIR (bkz. `assertGiftAllowedByFriendship` doc yorumu — bu
 *      kuralın DB CHECK'i olamayacağı için ikinci savunma hattı ancak
 *      transaction içinde kurulabilir).
 *   6. `sendGift` — **PARA YOLU**, tek transaction.
 *
 * **Neden 4/5 transaction'ın DIŞINDA:** bunlar okuma; asıl yazma kararı
 * kilit altında yeniden verilir. Erken kontrolün faydası yalnızca hızlı ve
 * net bir hata mesajıdır — arada arkadaşlık silinirse sonuç yine
 * `GIFT_REQUIRES_FRIENDSHIP` olur, ama bu sefer transaction İÇİNDEN
 * (AYNI sınıf fırlatılır ki istemci iki yoldan da AYNI kodu görsün).
 *
 * **`recipientBalance` DÖNMEZ** — gerekçe `SendGiftResult` doc yorumunda.
 */
@Injectable()
export class SendGiftUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(GIFT_REPOSITORY) private readonly giftRepository: GiftRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(
    senderId: string,
    recipientId: string,
    rawAmount: unknown,
    rawCurrency: unknown,
    idempotencyKey: string | null,
  ): Promise<SendGiftResult> {
    const giftConfig = this.config.gift;
    assertGiftConfigIsValid(giftConfig);

    assertNotSelfGift(senderId, recipientId);

    const amount = parseGiftAmount(rawAmount, giftConfig.minAmount, giftConfig.maxAmount);
    const currency = resolveGiftCurrency(rawCurrency, giftConfig.allowedCurrencies);

    const recipient = await this.playerRepository.findById(recipientId);
    if (recipient === null) {
      throw new PlayerNotFoundError(recipientId);
    }

    const { lowId, highId } = canonicalPair(senderId, recipientId);
    if (!(await this.socialRepository.areFriends(lowId, highId))) {
      throw new GiftRequiresFriendshipError(recipientId);
    }

    const execution = await this.giftRepository.sendGift({
      senderId,
      recipientId,
      currency,
      amount,
      minAmount: giftConfig.minAmount,
      maxAmount: giftConfig.maxAmount,
      dailyLimit: giftConfig.dailyLimit,
      dailyWindowHours: giftConfig.dailyWindowHours,
      allowedCurrencies: giftConfig.allowedCurrencies,
      idempotencyKey,
    });

    return {
      giftId: execution.giftId,
      currency,
      amount,
      recipient: execution.recipient,
      senderBalance: execution.senderBalance,
    };
  }
}
