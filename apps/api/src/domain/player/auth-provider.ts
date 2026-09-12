/**
 * Google/Apple Sign-In eşlemesi (brief §7/§31; karar: docs/ARCHITECTURE.md
 * §10 madde 1 — proje sahibi tarafından onaylandı).
 *
 * Domain katmanı gerçek bir OAuth/OpenID Connect kütüphanesi BİLMEZ
 * (framework/lib bağımlılığı yasak) — Google/Apple'ın kimlik doğrulama
 * (ID token doğrulama, imza kontrolü vb.) kısmı infrastructure katmanının
 * sorumluluğudur. Bu dosya yalnızca, sağlayıcıdan ZATEN doğrulanmış olarak
 * gelen (`provider`, `providerUserId`, `email`) üçlüsünü nasıl bir
 * `player_auth_providers` kaydına dönüştüreceğimizi tanımlar.
 */

import type { UUID } from '@at-sevdalisi/shared-types';
import { InvalidAuthProviderTokenError } from './errors';

export type AuthProvider = 'google' | 'apple';

export interface PlayerAuthProviderLink {
  playerId: UUID;
  provider: AuthProvider;
  providerUserId: string;
  email: string | null;
}

export interface VerifiedProviderIdentity {
  provider: AuthProvider;
  providerUserId: string;
  email: string | null;
}

/**
 * `player_auth_providers` tablosuna yazılacak bağlantı kaydını oluşturur.
 * `identity`'nin GERÇEKTEN doğrulanmış olduğu (infrastructure katmanının
 * Google/Apple SDK'sı ile ID token'ı doğrulamış olduğu) varsayılır — bu
 * fonksiyon yalnızca yapısal geçerliliği (boş olmayan providerUserId) kontrol eder.
 */
export function createPlayerAuthProviderLink(
  playerId: UUID,
  identity: VerifiedProviderIdentity,
): PlayerAuthProviderLink {
  if (identity.providerUserId.trim().length === 0) {
    throw new InvalidAuthProviderTokenError('providerUserId boş olamaz.');
  }

  return {
    playerId,
    provider: identity.provider,
    providerUserId: identity.providerUserId,
    email: identity.email,
  };
}
