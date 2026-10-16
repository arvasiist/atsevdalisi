import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ProfilePhotoView } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig, loadModerationConfig } from '@at-sevdalisi/game-config';
import { assertStaffPermission, parseLiftReason } from '../../domain/admin/staff';
import { PhotoRejectedError, prepareProfilePhoto } from '../../domain/avatar/profile-photo';
import { SELFIE_EXTENSIONS } from '../../domain/avatar/selfie';
import { ProfilePhotoNotFoundError } from '../../domain/avatar/errors';
import { AVATAR_STORAGE, type AvatarStorage, type StoredObject } from '../ports/avatar-storage';
import { MODERATION_REPOSITORY, type ModerationRepository } from '../ports/moderation.repository';
import { PROFILE_PHOTO_REPOSITORY, type ProfilePhotoRepository } from '../ports/profile-photo.repository';

const PHOTO_RULES = loadAvatarConfig().photo;
const MODERATION = loadModerationConfig();

/**
 * PROFİL FOTOĞRAFI (08.10.2026). Oyuncu kendi fotoğrafını yükler; sunucu
 * baytlardan doğrular, meta veriyi (EXIF/GPS) siler ve depoya SUNUCUNUN
 * ürettiği anahtarla (`photos/<photoId>.<uzantı>`) yazar — kullanıcının dosya
 * adı hiçbir yerde kullanılmaz. Fotoğraf herkese açık profilde görünür;
 * uygunsuz olanı moderatör/yönetici kaldırır (denetim kaydıyla).
 *
 * Sıra: dosya önce depoya yazılır, sonra satır değişir; satır yazılamazsa
 * yeni dosya silinir. Eski dosya satır değiştikten SONRA silinir — arada
 * düşülse depoda sahipsiz bir dosya kalır (sunulmaz: satır yok), ama
 * oyuncunun görünen fotoğrafı hiçbir an kaybolmaz.
 */
@Injectable()
export class ProfilePhotoUseCase {
  private readonly logger = new Logger(ProfilePhotoUseCase.name);

  constructor(
    @Inject(PROFILE_PHOTO_REPOSITORY) private readonly photos: ProfilePhotoRepository,
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage,
    @Inject(MODERATION_REPOSITORY) private readonly moderation: ModerationRepository,
  ) {}

  async upload(
    playerId: string,
    file: { bytes: Uint8Array; mimetype: string } | null,
    now: Date = new Date(),
  ): Promise<ProfilePhotoView> {
    if (file === null) throw new PhotoRejectedError('EMPTY_FILE');
    const prepared = prepareProfilePhoto(file.bytes, file.mimetype, PHOTO_RULES);
    const photoId = randomUUID();
    const storageKey = `photos/${photoId}.${SELFIE_EXTENSIONS[prepared.type]}`;
    await this.storage.put(storageKey, prepared.bytes, prepared.type);
    let previousStorageKey: string | null;
    try {
      ({ previousStorageKey } = await this.photos.replace(
        {
          playerId,
          photoId,
          storageKey,
          contentType: prepared.type,
          width: prepared.width,
          height: prepared.height,
          byteSize: prepared.bytes.length,
        },
        now,
      ));
    } catch (error) {
      await this.deleteQuietly(storageKey);
      throw error;
    }
    if (previousStorageKey) await this.deleteQuietly(previousStorageKey);
    return {
      photoId,
      width: prepared.width,
      height: prepared.height,
      updatedAt: now.toISOString(),
    };
  }

  /** Oyuncunun kendi fotoğrafını kaldırması (yoksa 404). */
  async remove(playerId: string): Promise<void> {
    const key = await this.photos.remove(playerId);
    if (key === null) throw new ProfilePhotoNotFoundError();
    await this.deleteQuietly(key);
  }

  /** Hesap silme: satır + dosya (yoksa sessiz). */
  async purge(playerId: string): Promise<void> {
    const key = await this.photos.remove(playerId);
    if (key !== null) await this.deleteQuietly(key);
  }

  /** Herkese açık sunum: yalnızca GÜNCEL fotoğraf. */
  async serve(photoId: string): Promise<StoredObject> {
    const photo = await this.photos.findByPhotoId(photoId);
    if (photo === null) throw new ProfilePhotoNotFoundError();
    const object = await this.storage.get(photo.storageKey);
    if (object === null) throw new ProfilePhotoNotFoundError();
    return { bytes: object.bytes, contentType: photo.contentType };
  }

  /** Yönetim: uygunsuz fotoğrafı kaldırır. Yetki kapısı VERİ OKUMADAN önce. */
  async removeByStaff(actorId: string, playerId: string, rawReason: unknown): Promise<void> {
    assertStaffPermission(await this.moderation.findRole(actorId), 'photos.moderate');
    const reason = parseLiftReason(rawReason, MODERATION.sanctions);
    const key = await this.photos.removeByStaff({ actorId, playerId, reason });
    if (key === null) throw new ProfilePhotoNotFoundError();
    await this.deleteQuietly(key);
  }

  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      // Sahipsiz dosya sunulmaz (satır yok); kaybı loglanır, istek bozulmaz.
      this.logger.warn(`Profil fotoğrafı dosyası silinemedi: ${key} (${(error as Error).message})`);
    }
  }
}
