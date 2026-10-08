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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { ApiSuccess, ProfilePhotoView } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import { ProfilePhotoUseCase } from '../../application/use-cases/profile-photo.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { Public } from '../auth/public.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

const PHOTO = loadAvatarConfig().photo;

/**
 * PROFİL FOTOĞRAFI (08.10.2026). Yükleme/silme yalnızca kendi hesabına
 * (oyuncu kimliği token'dan); dosya bellekte tutulur, tek dosya, boyut sınırı
 * config'ten. Sunum herkese açıktır (profil de öyle) — ama yalnızca GÜNCEL
 * fotoğraf ve tarayıcının içeriği başka bir şey sanamayacağı başlıklarla.
 */
@Controller('avatar')
export class ProfilePhotoController {
  constructor(@Inject(ProfilePhotoUseCase) private readonly photos: ProfilePhotoUseCase) {}

  @RateLimit({ name: 'profile-photo-upload', limit: 10, windowSeconds: 3600, keyBy: 'player' })
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: PHOTO.maxUploadBytes, files: 1, fields: 2 } }))
  @Post('photo')
  @HttpCode(HttpStatus.CREATED)
  async upload(
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ProfilePhotoView>> {
    const data = await this.photos.upload(
      player.id,
      file ? { bytes: new Uint8Array(file.buffer), mimetype: file.mimetype } : null,
    );
    return { success: true, data };
  }

  @RateLimit({ name: 'profile-photo-delete', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @Delete('photo')
  async remove(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<{ removed: true }>> {
    await this.photos.remove(player.id);
    return { success: true, data: { removed: true } };
  }

  /**
   * Görüntünün kendisi. `photoId` her yüklemede değiştiği için uzun önbellek
   * güvenlidir; kaldırılan fotoğrafın adresi 404 döner. `nosniff` + boş CSP:
   * dosya yalnızca bir GÖRÜNTÜ olarak yorumlanır, belge olarak açılsa bile
   * betik/stil çalıştıramaz.
   */
  @Public()
  @Get('photos/:photoId')
  async serve(@Param('photoId', ParseUUIDPipe) photoId: string, @Res() response: Response): Promise<void> {
    const object = await this.photos.serve(photoId);
    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': object.contentType,
        'Cache-Control': `public, max-age=${PHOTO.cacheMaxAgeSeconds}, immutable`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': 'inline',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      })
      .send(Buffer.from(object.bytes));
  }
}

/** Yönetim — uygunsuz profil fotoğrafını kaldırma (moderatör + yönetici, denetim kaydıyla). */
@Controller('admin')
export class AdminProfilePhotoController {
  constructor(@Inject(ProfilePhotoUseCase) private readonly photos: ProfilePhotoUseCase) {}

  @Delete('players/:playerId/photo')
  async remove(
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Body() body: { reason?: unknown } | undefined,
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<{ removed: true }>> {
    await this.photos.removeByStaff(actor.id, playerId, body?.reason);
    return { success: true, data: { removed: true } };
  }
}
