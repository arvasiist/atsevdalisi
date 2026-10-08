export const PROFILE_PHOTO_REPOSITORY = Symbol('PROFILE_PHOTO_REPOSITORY');

export interface StoredProfilePhoto {
  playerId: string;
  photoId: string;
  storageKey: string;
  contentType: string;
  width: number;
  height: number;
  byteSize: number;
  updatedAt: Date;
}

export type NewProfilePhoto = Omit<StoredProfilePhoto, 'updatedAt'>;

/**
 * PROFİL FOTOĞRAFI (08.10.2026, migration 0071). Satır, fotoğrafın SUNULUP
 * sunulmayacağının tek kaynağıdır: satır yoksa depoda dosya kalsa bile
 * `GET /avatar/photos/:photoId` 404 döner. Değiştirme/silme önceki depo
 * anahtarını döner; dosyayı use-case commit SONRASI siler.
 */
export interface ProfilePhotoRepository {
  findByPlayer(playerId: string): Promise<StoredProfilePhoto | null>;
  /** Yalnızca GÜNCEL fotoğraf (silinen/değiştirilen kimlik bulunmaz). Silinmiş hesabınki de bulunmaz. */
  findByPhotoId(photoId: string): Promise<StoredProfilePhoto | null>;
  /** Oyuncunun fotoğrafını değiştirir (satır kilitli); önceki depo anahtarını döner. */
  replace(photo: NewProfilePhoto, now: Date): Promise<{ previousStorageKey: string | null }>;
  /** Oyuncunun fotoğrafını siler; silinen depo anahtarını döner (yoksa `null`). */
  remove(playerId: string): Promise<string | null>;
  /**
   * Yönetim kaldırması: satırı siler ve `admin_audit_log`
   * (`player.photo_removed`, gerekçe) AYNI transaction'da yazar.
   */
  removeByStaff(input: { actorId: string; playerId: string; reason: string }): Promise<string | null>;
}
