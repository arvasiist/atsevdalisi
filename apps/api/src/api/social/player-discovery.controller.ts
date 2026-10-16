import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  ApiSuccess,
  PlayerPrivacyView,
  PlayerRelationshipView,
  PlayerSearchResultView,
} from '@at-sevdalisi/shared-types';
import { PlayerDiscoveryUseCase } from '../../application/use-cases/player-discovery.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * 16.10.2026 — sosyal brief §3: oyuncu arama, profil ilişkisi, çevrimiçi
 * durumu nabzı ve gizlilik ayarı. Hepsi kimlik ister (`@Public` YOK):
 * arama ve ilişki arayana göre hesaplanır, durum yalnızca arkadaşa gider.
 */
@Controller()
export class PlayerDiscoveryController {
  constructor(@Inject(PlayerDiscoveryUseCase) private readonly discovery: PlayerDiscoveryUseCase) {}

  /** Kimlik tam eşleşme ya da kullanıcı adı ön eki; hız sınırı numaralandırmayı yavaşlatır. */
  @RateLimit({ name: 'player-search', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @Get('social/search')
  async search(
    @Query('q') q: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PlayerSearchResultView[]>> {
    return { success: true, data: await this.discovery.search(currentPlayer.id, typeof q === 'string' ? q : '') };
  }

  @Get('players/:id/relationship/:otherId')
  async relationship(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('otherId', ParseUUIDPipe) otherId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PlayerRelationshipView>> {
    assertSelf(currentPlayer.id, id);
    return { success: true, data: await this.discovery.relationship(id, otherId) };
  }

  @RateLimit({ name: 'presence-heartbeat', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Post('presence/heartbeat')
  @HttpCode(HttpStatus.OK)
  async heartbeat(@CurrentPlayer() currentPlayer: AuthenticatedPlayer): Promise<ApiSuccess<{ ok: true }>> {
    await this.discovery.heartbeat(currentPlayer.id);
    return { success: true, data: { ok: true } };
  }

  @Get('players/:id/privacy')
  async getPrivacy(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PlayerPrivacyView>> {
    assertSelf(currentPlayer.id, id);
    return { success: true, data: await this.discovery.getPrivacy(id) };
  }

  @RateLimit({ name: 'privacy-update', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Put('players/:id/privacy')
  async setPrivacy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { showOnlineStatus?: unknown },
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PlayerPrivacyView>> {
    assertSelf(currentPlayer.id, id);
    // DTO dekoratörü esbuild altında atlanabilir (CLAUDE.md kural 5) — tür burada denetlenir.
    if (typeof body?.showOnlineStatus !== 'boolean') {
      throw new BadRequestException('showOnlineStatus true ya da false olmalıdır.');
    }
    return { success: true, data: await this.discovery.setPrivacy(id, body.showOnlineStatus) };
  }
}
