import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { ProviderAlreadyLinkedError, ProviderIdentityTakenError } from '../../domain/auth/errors';
import type { AuthProvider, PlayerAuthProviderLink } from '../../domain/player/auth-provider';
import type { PlayerAuthProviderRepository } from '../../application/ports/player-auth-provider.repository';
import { uniqueConstraintOf } from '../auth/postgres-player-credentials.repository';
import { PG_POOL } from '../database/database.module';

// Migration 0011'in adsız `UNIQUE (provider, provider_user_id)`'si Postgres'in
// varsayılan adını alır; 0048'inki açıkça adlandırılmıştır.
const IDENTITY_UNIQUE = 'player_auth_providers_provider_provider_user_id_key';
const PLAYER_PROVIDER_UNIQUE = 'player_auth_providers_player_provider_uq';

/**
 * `player_auth_providers` tablosunun satır şekli (snake_case,
 * `database/migrations/0011_create_player_auth_providers.up.sql`).
 * `postgres-player.repository.ts`'teki `PlayerRow`/`rowToPlayer` ile AYNI desen.
 */
interface PlayerAuthProviderRow {
  player_id: string;
  provider: string;
  provider_user_id: string;
  email: string | null;
}

function rowToLink(row: PlayerAuthProviderRow): PlayerAuthProviderLink {
  return {
    playerId: row.player_id,
    provider: row.provider as PlayerAuthProviderLink['provider'],
    providerUserId: row.provider_user_id,
    email: row.email,
  };
}

@Injectable()
export class PostgresPlayerAuthProviderRepository implements PlayerAuthProviderRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByProviderIdentity(provider: string, providerUserId: string): Promise<PlayerAuthProviderLink | null> {
    const result = await this.pool.query<PlayerAuthProviderRow>(
      'SELECT player_id, provider, provider_user_id, email FROM player_auth_providers WHERE provider = $1 AND provider_user_id = $2 LIMIT 1',
      [provider, providerUserId],
    );
    return result.rows[0] ? rowToLink(result.rows[0]) : null;
  }

  async findProvidersByPlayerId(playerId: string): Promise<AuthProvider[]> {
    const result = await this.pool.query<{ provider: AuthProvider }>(
      'SELECT provider FROM player_auth_providers WHERE player_id = $1 ORDER BY provider',
      [playerId],
    );
    return result.rows.map((row) => row.provider);
  }

  async save(link: PlayerAuthProviderLink): Promise<void> {
    try {
      await this.pool.query(
        'INSERT INTO player_auth_providers (player_id, provider, provider_user_id, email) VALUES ($1, $2, $3, $4)',
        [link.playerId, link.provider, link.providerUserId, link.email],
      );
    } catch (error) {
      // Ön kontrolü eşzamanlı olarak geçen ikinci istek buraya düşer;
      // kısıtın ADI hangi kuralın çiğnendiğini söyler.
      const constraint = uniqueConstraintOf(error);
      if (constraint === IDENTITY_UNIQUE) {
        throw new ProviderIdentityTakenError();
      }
      if (constraint === PLAYER_PROVIDER_UNIQUE) {
        throw new ProviderAlreadyLinkedError();
      }
      throw error;
    }
  }
}
