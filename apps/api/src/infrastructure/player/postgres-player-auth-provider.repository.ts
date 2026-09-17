import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { PlayerAuthProviderLink } from '../../domain/player/auth-provider';
import type { PlayerAuthProviderRepository } from '../../application/ports/player-auth-provider.repository';
import { PG_POOL } from '../database/database.module';

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

  async save(link: PlayerAuthProviderLink): Promise<void> {
    await this.pool.query(
      'INSERT INTO player_auth_providers (player_id, provider, provider_user_id, email) VALUES ($1, $2, $3, $4)',
      [link.playerId, link.provider, link.providerUserId, link.email],
    );
  }
}
