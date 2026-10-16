import { Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import type {
  ApiSuccess,
  FriendGiftBoardView,
  FriendGiftCollectResult,
  FriendGiftSendAllResult,
} from '@at-sevdalisi/shared-types';
import { FriendGiftUseCase } from '../../application/use-cases/friend-gift.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * DOSTLUK HEDİYESİ (08.10.2026). Oyuncu kimliği YALNIZCA token'dan gelir;
 * gövde YOKTUR (tutar, alıcılar ve sınırlar sunucudadır).
 *
 * `Idempotency-Key` gerekmez: gönderim günlük tekillikle (aynı kişiye günde
 * bir), toplama "toplanmamış hediye" durumuyla korunur — tekrar istek ikinci
 * kez para üretmez, yalnızca sıfır toplar.
 */
@Controller('friend-gifts')
export class FriendGiftController {
  constructor(@Inject(FriendGiftUseCase) private readonly friendGifts: FriendGiftUseCase) {}

  @Get()
  async board(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<FriendGiftBoardView>> {
    return { success: true, data: await this.friendGifts.board(player.id) };
  }

  @RateLimit({ name: 'friend-gift-send-all', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Post('send-all')
  @HttpCode(HttpStatus.OK)
  async sendAll(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<FriendGiftSendAllResult>> {
    return { success: true, data: await this.friendGifts.sendAll(player.id) };
  }

  @RateLimit({ name: 'friend-gift-collect', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Post('collect')
  @HttpCode(HttpStatus.OK)
  async collect(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<FriendGiftCollectResult>> {
    return { success: true, data: await this.friendGifts.collect(player.id) };
  }
}
