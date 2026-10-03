import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { ApiSuccess, ClubDetailView, ClubSummaryView } from '@at-sevdalisi/shared-types';
import { ManageClubUseCase } from '../../application/use-cases/manage-club.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * Kulüp uçları (brief §44, 01.10.2026). Gövde alanları (`name`, `tag`,
 * `role`) DOMAIN'de doğrulanır; kimlikler yol parametresidir →
 * `ParseUUIDPipe`. Bütün yazma rotaları `@RateLimit` taşır (opt-in, CLAUDE.md).
 * Para yolu yoktur (kulüp kurmak ücretsiz) → `Idempotency-Key` gerekmez:
 * tekrarlanan "kur"/"katıl" ikinci kez yazamaz (ad tekilliği + tek kulüp
 * birincil anahtarı).
 */
@Controller('clubs')
export class ClubController {
  constructor(@Inject(ManageClubUseCase) private readonly clubs: ManageClubUseCase) {}

  @Get()
  async list(@Query('search') search: unknown): Promise<ApiSuccess<ClubSummaryView[]>> {
    return { success: true, data: await this.clubs.list(search) };
  }

  @Get('mine')
  async mine(
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ClubDetailView | null>> {
    return { success: true, data: await this.clubs.mine(player.id) };
  }

  @Get(':clubId')
  async detail(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ClubDetailView>> {
    return { success: true, data: await this.clubs.detail(clubId, player.id) };
  }

  @Post()
  @RateLimit({ name: 'club-create', limit: 5, windowSeconds: 60, keyBy: 'player' })
  async create(
    @Body() body: { name?: unknown; tag?: unknown },
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ClubDetailView>> {
    return { success: true, data: await this.clubs.create(player.id, body?.name, body?.tag) };
  }

  @Post(':clubId/join')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'club-join', limit: 20, windowSeconds: 60, keyBy: 'player' })
  async join(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ClubDetailView>> {
    return { success: true, data: await this.clubs.join(player.id, clubId) };
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'club-leave', limit: 20, windowSeconds: 60, keyBy: 'player' })
  async leave(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<{ left: true }>> {
    await this.clubs.leave(player.id);
    return { success: true, data: { left: true } };
  }

  @Delete(':clubId/members/:playerId')
  @RateLimit({ name: 'club-kick', limit: 30, windowSeconds: 60, keyBy: 'player' })
  async kick(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('playerId', ParseUUIDPipe) targetId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ClubDetailView>> {
    return { success: true, data: await this.clubs.kick(player.id, clubId, targetId) };
  }

  @Post(':clubId/members/:playerId/role')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'club-role', limit: 30, windowSeconds: 60, keyBy: 'player' })
  async changeRole(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('playerId', ParseUUIDPipe) targetId: string,
    @Body() body: { role?: unknown },
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ClubDetailView>> {
    return {
      success: true,
      data: await this.clubs.changeRole(player.id, clubId, targetId, body?.role),
    };
  }

  @Delete(':clubId')
  @RateLimit({ name: 'club-disband', limit: 5, windowSeconds: 60, keyBy: 'player' })
  async disband(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<{ disbanded: true }>> {
    await this.clubs.disband(player.id, clubId);
    return { success: true, data: { disbanded: true } };
  }
}
