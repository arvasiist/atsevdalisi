import type { PlayerAuthProviderLink } from '../../domain/player/auth-provider';

/**
 * `PlayerAuthProviderRepository` — `player_auth_providers` tablosuna
 * (`database/migrations/0011_create_player_auth_providers.up.sql`) bağlanan
 * PORT. `application/ports/player.repository.ts` ile AYNI desen.
 */
export interface PlayerAuthProviderRepository {
  /** `(provider, providerUserId)` benzersiz çiftine göre bağlantıyı bulur — `null` ise bu sağlayıcı kimliği daha önce hiç giriş yapmamış (yeni oyuncu oluşturulmalı). */
  findByProviderIdentity(provider: string, providerUserId: string): Promise<PlayerAuthProviderLink | null>;
  /** Yeni bir bağlantı ekler. */
  save(link: PlayerAuthProviderLink): Promise<void>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const PLAYER_AUTH_PROVIDER_REPOSITORY = Symbol('PLAYER_AUTH_PROVIDER_REPOSITORY');
