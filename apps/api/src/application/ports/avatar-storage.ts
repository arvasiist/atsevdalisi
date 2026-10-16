/**
 * AVATAR NESNE DEPOSU (07.10.2026, brief §46). Selfie, GLB ve küçük resim
 * VERİTABANINA konmaz. Anahtarları YALNIZCA sunucu üretir (`selfies/<iş>.jpg`,
 * `models/<iş>.glb`); kullanıcının dosya adı asla yol olmaz.
 */
export const AVATAR_STORAGE = Symbol('AVATAR_STORAGE');

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface AvatarStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  /** Yoksa sessizce döner (silme tekrar edilebilir olmalı). */
  delete(key: string): Promise<void>;
}

/** Sunucunun ürettiği anahtar biçimi — depo uygulamaları bunun dışını REDDEDER. */
export const AVATAR_STORAGE_KEY_PATTERN = /^(selfies|models|thumbnails|photos)\/[0-9a-f-]{36}\.(jpg|png|webp|glb)$/;
