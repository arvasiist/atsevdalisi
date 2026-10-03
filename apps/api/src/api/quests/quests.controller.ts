import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AdminLiveEventView, ApiSuccess, QuestBoardView, QuestClaimResult } from '@at-sevdalisi/shared-types';
import { QuestUseCase } from '../../application/use-cases/quest.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * GÖREVLER + ETKİNLİKLER (02.10.2026, Faz 11-B). Oyuncu kimliği YALNIZCA
 * token'dan gelir; gövdede/yolda oyuncu kimliği yoktur (başkası adına
 * talep edilemez). Görev anahtarı yalnızca config listesinde aranır.
 */
@Controller('quests')
export class QuestsController {
  constructor(@Inject(QuestUseCase) private readonly quests: QuestUseCase) {}

  @Get()
  async board(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<QuestBoardView>> {
    return { success: true, data: await this.quests.board(player.id) };
  }

  @RateLimit({ name: 'quest-claim', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @Post(':questKey/claim')
  @HttpCode(HttpStatus.OK)
  async claim(
    @Param('questKey') questKey: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<QuestClaimResult>> {
    return { success: true, data: await this.quests.claimQuest(player.id, questKey) };
  }
}

@Controller('events')
export class LiveEventsController {
  constructor(@Inject(QuestUseCase) private readonly quests: QuestUseCase) {}

  @RateLimit({ name: 'event-claim', limit: 30, windowSeconds: 60, keyBy: 'player' })
  @Post(':eventId/claim')
  @HttpCode(HttpStatus.OK)
  async claim(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<QuestClaimResult>> {
    return { success: true, data: await this.quests.claimEvent(player.id, eventId) };
  }
}

/** Etkinlik yönetimi — yalnızca yönetici (`events.manage`), her istekte DB'den. */
@Controller('admin/events')
export class AdminLiveEventsController {
  constructor(@Inject(QuestUseCase) private readonly quests: QuestUseCase) {}

  @RateLimit({ name: 'admin-event', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: Record<string, unknown>,
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminLiveEventView>> {
    return { success: true, data: await this.quests.createEvent(actor.id, body ?? {}) };
  }

  @Get()
  async list(@CurrentPlayer() actor: AuthenticatedPlayer): Promise<ApiSuccess<AdminLiveEventView[]>> {
    return { success: true, data: await this.quests.listEventsForAdmin(actor.id) };
  }

  @RateLimit({ name: 'admin-event-archive', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @Post(':eventId/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AdminLiveEventView>> {
    return { success: true, data: await this.quests.archiveEvent(actor.id, eventId) };
  }
}
