import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AvatarAppearance, AvatarView, ProfilePhotoView } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import { deriveDefaultAvatar, validateAvatarAppearance } from '../../domain/avatar/avatar';
import { InvalidAvatarError } from '../../domain/avatar/errors';
import { AVATAR_REPOSITORY, type AvatarRepository } from '../ports/avatar.repository';
import { PROFILE_PHOTO_REPOSITORY, type ProfilePhotoRepository } from '../ports/profile-photo.repository';

const config = loadAvatarConfig();

/**
 * MANUEL AVATAR (07.10.2026, brief §44/§49). Oyuncu kataloğdan seçer; sunucu
 * doğrular ve saklar. Kaydı olmayan oyuncu kimliğinden türetilen varsayılan
 * avatarla görünür — "avatarsız" durum yoktur (§49: oyuncu oyuna devam eder).
 */
@Injectable()
export class AvatarUseCase {
  private readonly logger = new Logger(AvatarUseCase.name);

  constructor(
    @Inject(AVATAR_REPOSITORY) private readonly repository: AvatarRepository,
    @Inject(PROFILE_PHOTO_REPOSITORY) private readonly photos: ProfilePhotoRepository,
  ) {}

  async get(playerId: string): Promise<AvatarView> {
    const [stored, photo] = await Promise.all([this.repository.find(playerId), this.photoOf(playerId)]);
    if (stored) {
      try {
        return {
          appearance: validateAvatarAppearance(stored.appearance, config),
          source: 'manual',
          updatedAt: stored.updatedAt.toISOString(),
          photo,
        };
      } catch (error) {
        // Katalogdan bir seçenek kaldırılmışsa eski kayıt geçersizleşir: oyuncu
        // varsayılanla görünür, yeni seçimi kaydedene kadar (kayıt silinmez).
        if (!(error instanceof InvalidAvatarError)) throw error;
        this.logger.warn(`Kayıtlı avatar artık katalogla uyuşmuyor (oyuncu ${playerId}); varsayılan gösteriliyor.`);
      }
    }
    return { appearance: deriveDefaultAvatar(playerId, config), source: 'default', updatedAt: null, photo };
  }

  /** Profil fotoğrafı (08.10.2026); yoksa `null`. */
  async photoOf(playerId: string): Promise<ProfilePhotoView | null> {
    const photo = await this.photos.findByPlayer(playerId);
    return photo
      ? { photoId: photo.photoId, width: photo.width, height: photo.height, updatedAt: photo.updatedAt.toISOString() }
      : null;
  }

  /** Herkese açık profil için yalnızca görünüş. */
  async appearanceOf(playerId: string): Promise<AvatarAppearance> {
    return (await this.get(playerId)).appearance;
  }

  async save(playerId: string, raw: unknown, now: Date = new Date()): Promise<AvatarView> {
    const appearance = validateAvatarAppearance(raw, config);
    const stored = await this.repository.save(playerId, appearance, now);
    return { appearance, source: 'manual', updatedAt: stored.updatedAt.toISOString(), photo: await this.photoOf(playerId) };
  }
}
