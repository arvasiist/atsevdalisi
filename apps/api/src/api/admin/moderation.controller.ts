import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type {
  AdminAnnouncementView,
  AnnouncementView,
  ApiSuccess,
  AssignableRole,
  PlayerSanctionView,
} from '@at-sevdalisi/shared-types';
import { ModerationUseCase } from '../../application/use-cases/moderation.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { Public } from '../auth/public.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * MODERASYON (02.10.2026, Faz 10 + 11-A). Çağıran YALNIZCA token'dan gelir;
 * yetki her işlemde veritabanındaki rolden okunur (use-case'in ilk satırı).
 * Gövdeler HAM geçirilir, doğrulama domain'dedir (CLAUDE.md kural 5).
 */
@Controller('admin')
export class ModerationController {
  constructor(@Inject(ModerationUseCase) private readonly moderation: ModerationUseCase) {}

  @RateLimit({ name: 'admin-sanction', limit: 30, windowSeconds: 300, keyBy: 'player' })
  @Post('players/:playerId/sanctions')
  @HttpCode(HttpStatus.CREATED)
  async sanction(
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Body() body: { kind?: unknown; reason?: unknown; durationHours?: unknown },
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PlayerSanctionView>> {
    return { success: true, data: await this.moderation.sanction(actor.id, playerId, body ?? {}) };
  }

  @Get('players/:playerId/sanctions')
  async history(
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PlayerSanctionView[]>> {
    return { success: true, data: await this.moderation.history(actor.id, playerId) };
  }

  @RateLimit({ name: 'admin-sanction-lift', limit: 30, windowSeconds: 300, keyBy: 'player' })
  @Post('sanctions/:sanctionId/lift')
  @HttpCode(HttpStatus.OK)
  async lift(
    @Param('sanctionId', ParseUUIDPipe) sanctionId: string,
    @Body() body: { reason?: unknown },
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PlayerSanctionView>> {
    return { success: true, data: await this.moderation.lift(actor.id, sanctionId, body?.reason) };
  }

  @RateLimit({ name: 'admin-role', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @Put('players/:playerId/role')
  @HttpCode(HttpStatus.OK)
  async setRole(
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Body() body: { role?: unknown },
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<{ from: AssignableRole; to: AssignableRole }>> {
    return { success: true, data: await this.moderation.setRole(actor.id, playerId, body?.role) };
  }

  @RateLimit({ name: 'admin-announcement', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @Post('announcements')
  @HttpCode(HttpStatus.CREATED)
  async createAnnouncement(
    @Body() body: { title?: unknown; body?: unknown; level?: unknown; startsAt?: unknown; endsAt?: unknown },
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminAnnouncementView>> {
    return { success: true, data: await this.moderation.createAnnouncement(actor.id, body ?? {}) };
  }

  @RateLimit({ name: 'admin-announcement-archive', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @Post('announcements/:announcementId/archive')
  @HttpCode(HttpStatus.OK)
  async archiveAnnouncement(
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminAnnouncementView>> {
    return { success: true, data: await this.moderation.archiveAnnouncement(actor.id, announcementId) };
  }

  @Get('announcements')
  async listAnnouncements(@CurrentPlayer() actor: AuthenticatedPlayer): Promise<ApiSuccess<AdminAnnouncementView[]>> {
    return { success: true, data: await this.moderation.listAnnouncementsForAdmin(actor.id) };
  }
}

/**
 * DUYURULAR — oyunculara açık (02.10.2026, Faz 11-A). `@Public()`: giriş
 * yapmamış ziyaretçi de bakım duyurusunu görmeli. Yalnızca yayındakiler.
 */
@Controller('announcements')
export class AnnouncementsController {
  constructor(@Inject(ModerationUseCase) private readonly moderation: ModerationUseCase) {}

  @RateLimit({ name: 'announcements-read', limit: 120, windowSeconds: 60, keyBy: 'ip' })
  @Public()
  @Get()
  async live(): Promise<ApiSuccess<AnnouncementView[]>> {
    return { success: true, data: await this.moderation.liveAnnouncements() };
  }
}
