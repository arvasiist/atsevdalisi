import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ApiSuccess, ClubChatMessageView } from '@at-sevdalisi/shared-types';
import { ClubChatUseCase } from '../../application/use-cases/club-chat.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/** Kulüp sohbeti (Faz 9). Kimlik token'dan; üyelik kapısı use-case'te. */
@Controller('clubs/:clubId/messages')
export class ClubChatController {
  constructor(@Inject(ClubChatUseCase) private readonly chat: ClubChatUseCase) {}

  @Get()
  async list(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ClubChatMessageView[]>> {
    return { success: true, data: await this.chat.list(player.id, clubId) };
  }

  // Yarış sohbetiyle aynı bütçe (chat.rateLimit: 20 / 60 sn), ayrı sayaç.
  @RateLimit({ name: 'club-chat', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async send(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body() body: { body?: unknown },
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ClubChatMessageView>> {
    return { success: true, data: await this.chat.send(player.id, clubId, body?.body) };
  }
}
