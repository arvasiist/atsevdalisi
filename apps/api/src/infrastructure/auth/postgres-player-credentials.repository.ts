import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { CredentialsAlreadySetError, EmailAlreadyRegisteredError } from '../../domain/auth/errors';
import type { PlayerCredentialsRepository } from '../../application/ports/player-credentials.repository';
import { PG_POOL } from '../database/database.module';

const UNIQUE_VIOLATION = '23505';
const EMAIL_INDEX = 'player_credentials_email_uq';
const PRIMARY_KEY = 'player_credentials_pkey';

function uniqueConstraintOf(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION &&
    typeof (error as { constraint?: unknown }).constraint === 'string'
  ) {
    return (error as { constraint: string }).constraint;
  }
  return null;
}

/** `player_credentials` (migration 0046) — port doc yorumu okunmalıdır. */
@Injectable()
export class PostgresPlayerCredentialsRepository implements PlayerCredentialsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<{ playerId: string; passwordHash: string } | null> {
    const result = await this.pool.query<{ player_id: string; password_hash: string }>(
      'SELECT player_id, password_hash FROM player_credentials WHERE lower(email) = lower($1)',
      [email],
    );
    const row = result.rows[0];
    return row === undefined ? null : { playerId: row.player_id, passwordHash: row.password_hash };
  }

  async findEmailByPlayerId(playerId: string): Promise<string | null> {
    const result = await this.pool.query<{ email: string }>(
      'SELECT email FROM player_credentials WHERE player_id = $1',
      [playerId],
    );
    return result.rows[0]?.email ?? null;
  }

  async create(input: { playerId: string; email: string; passwordHash: string }): Promise<void> {
    try {
      await this.pool.query('INSERT INTO player_credentials (player_id, email, password_hash) VALUES ($1, $2, $3)', [
        input.playerId,
        input.email,
        input.passwordHash,
      ]);
    } catch (error) {
      // Ön kontrolü eşzamanlı olarak geçen ikinci kayıt buraya düşer:
      // kısıtın ADI hangi kuralın çiğnendiğini söyler.
      const constraint = uniqueConstraintOf(error);
      if (constraint === EMAIL_INDEX) {
        throw new EmailAlreadyRegisteredError();
      }
      if (constraint === PRIMARY_KEY) {
        throw new CredentialsAlreadySetError();
      }
      throw error;
    }
  }
}
