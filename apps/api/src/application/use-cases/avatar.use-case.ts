import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AvatarAppearance, AvatarView, ProfilePhotoView } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig, loadCosmeticsConfig } from '@at-sevdalisi/game-config';
import { AVATAR_CATALOG_KEYS, deriveDefaultAvatar, validateAvatarAppearance } from '../../domain/avatar/avatar';
import { InvalidAvatarError } from '../../domain/avatar/errors';
import { assertAvatarCosmeticsOwned, optionRef, premiumOptionIndex } from '../../domain/cosmetics/cosmetics';
import { AVATAR_REPOSITORY, type AvatarRepository } from '../ports/avatar.repository';
import { COSMETICS_REPOSITORY, type CosmeticsRepository } from '../ports/cosmetics.repository';
import { PROFILE_PHOTO_REPOSITORY, type ProfilePhotoRepository } from '../ports/profile-photo.repository';

const config = loadAvatarConfig();
const cosmetics = loadCosmeticsConfig();
const premiumOptions = premiumOptionIndex(cosmetics);
/** 09.10.2026 — mağazadan açılan seçenekler varsayılan avatarda seçilmez. */
const isLocked = (catalog: Parameters<typeof optionRef>[0], optionId: string): boolean =>
  premiumOptions.has(optionRef(catalog, optionId));

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
    @Inject(COSMETICS_REPOSITORY) private readonly cosmeticsRepository: CosmeticsRepository,
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
    return { appearance: deriveDefaultAvatar(playerId, config, isLocked), source: 'default', updatedAt: null, photo };
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
    // 09.10.2026 — mağazadan açılan seçenek yalnızca sahibine (sahiplik geri
    // alınmadığı için kilitsiz okuma yeterli).
    assertAvatarCosmeticsOwned(appearance, AVATAR_CATALOG_KEYS, await this.cosmeticsRepository.listOwnedKeys(playerId), cosmetics);
    const stored = await this.repository.save(playerId, appearance, now);
    return { appearance, source: 'manual', updatedAt: stored.updatedAt.toISOString(), photo: await this.photoOf(playerId) };
  }
}
