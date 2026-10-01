import { Inject, Injectable } from '@nestjs/common';
import type { AuthProvidersView } from '@at-sevdalisi/shared-types';
import { InvalidCredentialsInputError, ProviderAlreadyLinkedError, ProviderIdentityTakenError } from '../../domain/auth/errors';
import { createPlayerAuthProviderLink, type AuthProvider } from '../../domain/player/auth-provider';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import {
  IDENTITY_PROVIDER_VERIFIER,
  type IdentityProviderVerifier,
  verifyProviderIdToken,
} from '../ports/identity-provider';
import {
  PLAYER_AUTH_PROVIDER_REPOSITORY,
  type PlayerAuthProviderRepository,
} from '../ports/player-auth-provider.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

const SUPPORTED_PROVIDERS: readonly AuthProvider[] = ['google', 'apple'];

/**
 * GOOGLE HESABI BAĞLAMA (01.10.2026, migration 0048) — `PasswordAuthUseCase.
 * saveAccount`'un Google karşılığı: oturum açmış oyuncu (misafir ya da
 * e-postalı) kendi hesabına bir Google kimliği bağlar. Oyuncu satırı
 * DEĞİŞMEZ; atlar ve para aynı `player_id`de kalır. Sonrasında başka bir
 * cihazda `POST /auth/login` (Google) AYNI oyuncuya döner.
 *
 *  - Kimlik ZATEN bu oyuncuya bağlıysa işlem tekrarlanabilir (no-op).
 *  - Kimlik BAŞKA oyuncudaysa 409 `PROVIDER_IDENTITY_TAKEN` — iki hesap
 *    BİRLEŞTİRİLMEZ (birleştirme para/at taşımak demektir, ayrı bir karar).
 *  - Oyuncunun bu sağlayıcıdan BAŞKA bir hesabı varsa 409
 *    `PROVIDER_ALREADY_LINKED`. Ön kontrollerin TOCTOU penceresini
 *    migration 0048'in kısıtı kapatır (repository aynı hataya çevirir).
 *
 * `provider` burada AYRICA doğrulanır: esbuild altında DTO `@IsIn` atlanır
 * (CLAUDE.md kural 5).
 */
@Injectable()
export class LinkProviderUseCase {
  constructor(
    @Inject(IDENTITY_PROVIDER_VERIFIER) private readonly verifier: IdentityProviderVerifier,
    @Inject(PLAYER_AUTH_PROVIDER_REPOSITORY) private readonly links: PlayerAuthProviderRepository,
    @Inject(PLAYER_REPOSITORY) private readonly players: PlayerRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async link(playerId: string, rawProvider: unknown, rawIdToken: unknown): Promise<{ provider: AuthProvider }> {
    if (typeof rawProvider !== 'string' || !SUPPORTED_PROVIDERS.includes(rawProvider as AuthProvider)) {
      throw new InvalidCredentialsInputError('Sağlayıcı "google" ya da "apple" olmalıdır.');
    }
    if (typeof rawIdToken !== 'string' || rawIdToken.trim() === '') {
      throw new InvalidCredentialsInputError('Kimlik belgesi (idToken) eksik.');
    }
    const provider = rawProvider as AuthProvider;
    if ((await this.players.findById(playerId)) === null) {
      throw new PlayerNotFoundError(playerId);
    }
    const identity = await verifyProviderIdToken(this.verifier, provider, rawIdToken);

    const existing = await this.links.findByProviderIdentity(identity.provider, identity.providerUserId);
    if (existing !== null) {
      if (existing.playerId === playerId) {
        return { provider };
      }
      throw new ProviderIdentityTakenError();
    }
    if ((await this.links.findProvidersByPlayerId(playerId)).includes(provider)) {
      throw new ProviderAlreadyLinkedError();
    }
    await this.links.save(createPlayerAuthProviderLink(playerId, identity));
    return { provider };
  }

  linkedProviders(playerId: string): Promise<AuthProvider[]> {
    return this.links.findProvidersByPlayerId(playerId);
  }

  /** Web'in Google düğmesini gösterip göstermeyeceği — boş kimlik = `null`. */
  providersView(): AuthProvidersView {
    const googleClientId = this.config.env.googleOAuthClientId;
    return { googleClientId: googleClientId === '' ? null : googleClientId };
  }
}
