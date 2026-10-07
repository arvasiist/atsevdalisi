import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AvatarGenerationProvider } from '../../application/ports/avatar-generation.provider';
import type { AvatarStorage } from '../../application/ports/avatar-storage';
import { LocalAvatarStorage } from './local-avatar-storage';

/**
 * SAĞLAYICI SEÇİMİ (07.10.2026, Faz 8-B). `AVATAR_PROVIDER` ortam değişkeni
 * bir sağlayıcı adıdır. BUGÜN hiçbir gerçek sağlayıcı uygulaması YOKTUR
 * (sahibinin kararı + sözleşme + API anahtarı bekleniyor): değişken boşsa
 * hat kapalıdır (`null`), bilinmeyen bir ad ise açılışta HATA verir —
 * yanlış yazılmış bir ad sessizce "kapalı"ya düşüp yanıltmasın.
 * Yeni sağlayıcı: `AvatarGenerationProvider`ı uygula, buraya ekle.
 */
const PROVIDERS: Record<string, (env: NodeJS.ProcessEnv) => AvatarGenerationProvider> = {};

export function createAvatarGenerationProvider(env: NodeJS.ProcessEnv): AvatarGenerationProvider | null {
  const name = env.AVATAR_PROVIDER?.trim();
  if (!name) return null;
  const factory = PROVIDERS[name];
  if (!factory) {
    throw new Error(`AVATAR_PROVIDER="${name}" tanınmıyor (bilinen: ${Object.keys(PROVIDERS).join(', ') || 'yok'}).`);
  }
  return factory(env);
}

/** `AVATAR_STORAGE_DIR` yoksa işletim sisteminin geçici dizini (yalnızca geliştirme/test). */
export function createAvatarStorage(env: NodeJS.ProcessEnv): AvatarStorage {
  return new LocalAvatarStorage(env.AVATAR_STORAGE_DIR?.trim() || join(tmpdir(), 'at-sevdalisi-avatars'));
}
