import {
  Body,
  CanActivate,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type {
  AdminAvatarJobView,
  ApiSuccess,
  AvatarGenerationJobView,
  AvatarGenerationStatusView,
} from '@at-sevdalisi/shared-types';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import { AVATAR_GENERATION_PROVIDER, type AvatarGenerationProvider } from '../../application/ports/avatar-generation.provider';
import { AvatarGenerationUseCase } from '../../application/use-cases/avatar-generation.use-case';
import { AvatarGenerationUnavailableError } from '../../domain/avatar/errors';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

const MAX_UPLOAD_BYTES = loadAvatarConfig().generation.maxUploadBytes;

/**
 * Sağlayıcı yoksa yükleme GÖVDESİ HİÇ OKUNMADAN 503 (guard'lar interceptor'dan
 * önce koşar): sunucu işleyemeyeceği bir selfie'yi belleğe bile almaz.
 */
@Injectable()
export class AvatarGenerationAvailableGuard implements CanActivate {
  constructor(@Inject(AVATAR_GENERATION_PROVIDER) private readonly provider: AvatarGenerationProvider | null) {}

  canActivate(): boolean {
    if (this.provider === null) throw new AvatarGenerationUnavailableError();
    return true;
  }
}

/**
 * SELFIE → AI AVATAR (07.10.2026, Faz 8-B). Oyuncu kimliği YALNIZCA
 * token'dan; iş kimliği yol parametresi (UUID) ve sahiplik use-case'te.
 * Dosya bellekte tutulur (diske yazılmaz), tek dosya, boyut sınırı config'ten.
 */
@Controller('avatar')
export class AvatarGenerationController {
  constructor(@Inject(AvatarGenerationUseCase) private readonly generation: AvatarGenerationUseCase) {}

  @Get('generation')
  async status(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<AvatarGenerationStatusView>> {
    return { success: true, data: await this.generation.status(player.id) };
  }

  @RateLimit({ name: 'avatar-generation-request', limit: 5, windowSeconds: 3600, keyBy: 'player' })
  @UseGuards(AvatarGenerationAvailableGuard)
  @UseInterceptors(FileInterceptor('selfie', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4 } }))
  @Post('generation')
  @HttpCode(HttpStatus.ACCEPTED)
  async request(
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
    @Body() body: { consentVersion?: unknown } | undefined,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AvatarGenerationJobView>> {
    const data = await this.generation.request(player.id, {
      consentVersion: body?.consentVersion,
      file: file ? { bytes: new Uint8Array(file.buffer), mimetype: file.mimetype } : null,
    });
    return { success: true, data };
  }

  @RateLimit({ name: 'avatar-generation-cancel', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @Post('generation/:jobId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AvatarGenerationJobView>> {
    return { success: true, data: await this.generation.cancel(player.id, jobId) };
  }

  /** Gizlilik silmesi: AI avatar + işler + depodaki dosyalar (manuel avatar kalır). */
  @RateLimit({ name: 'avatar-ai-delete', limit: 10, windowSeconds: 300, keyBy: 'player' })
  @Delete('ai')
  async purge(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<{ deletedObjects: number }>> {
    return { success: true, data: await this.generation.purge(player.id) };
  }

  /** Modelin kendisi — yalnızca sahibine, önbelleğe alınmaz. */
  @Get('ai/model')
  async model(@CurrentPlayer() player: AuthenticatedPlayer, @Res() response: Response): Promise<void> {
    const object = await this.generation.model(player.id);
    response
      .status(HttpStatus.OK)
      .set({ 'Content-Type': object.contentType, 'Cache-Control': 'private, no-store' })
      .send(Buffer.from(object.bytes));
  }
}

/** Yönetim — AI işleri (brief Faz 10 "AI Jobs"); yalnızca yönetici. */
@Controller('admin')
export class AdminAvatarJobsController {
  constructor(@Inject(AvatarGenerationUseCase) private readonly generation: AvatarGenerationUseCase) {}

  @Get('avatar-jobs')
  async list(@CurrentPlayer() actor: AuthenticatedPlayer): Promise<ApiSuccess<AdminAvatarJobView[]>> {
    return { success: true, data: await this.generation.listForAdmin(actor.id) };
  }
}
