import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { CredentialsAlreadySetError, EmailAlreadyRegisteredError } from '../../domain/auth/errors';
import type { PlayerCredentialsRepository } from '../../application/ports/player-credentials.repository';
import { PG_POOL, withTransaction } from '../database/database.module';
import { revokeAllInTransaction } from './postgres-auth-session.repository';

const UNIQUE_VIOLATION = '23505';
const EMAIL_INDEX = 'player_credentials_email_uq';
const PRIMARY_KEY = 'player_credentials_pkey';

/** Benzersizlik ihlalinde çiğnenen kısıtın ADI; başka hatada `null`. */
export function uniqueConstraintOf(error: unknown): string | null {
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

  async findLatestResetRequestAt(playerId: string): Promise<Date | null> {
    const result = await this.pool.query<{ created_at: Date }>(
      'SELECT created_at FROM password_reset_tokens WHERE player_id = $1 ORDER BY created_at DESC LIMIT 1',
      [playerId],
    );
    return result.rows[0]?.created_at ?? null;
  }

  async createResetToken(input: { playerId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.pool.query('INSERT INTO password_reset_tokens (player_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
      input.playerId,
      input.tokenHash,
      input.expiresAt,
    ]);
  }

  async consumeResetToken(input: { tokenHash: string; now: Date; passwordHash: string }): Promise<string | null> {
    return withTransaction(this.pool, async (client) => {
      // Satır KİLİTLİ: aynı bağlantıyla eşzamanlı iki onay iki kez şifre
      // yazamaz — ikincisi kilit altında `used_at`ı dolu görür.
      const found = await client.query<{ player_id: string }>(
        `SELECT player_id FROM password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2
         FOR UPDATE`,
        [input.tokenHash, input.now],
      );
      const playerId = found.rows[0]?.player_id;
      if (playerId === undefined) {
        return null;
      }
      const updated = await client.query(
        'UPDATE player_credentials SET password_hash = $2, updated_at = $3 WHERE player_id = $1',
        [playerId, input.passwordHash, input.now],
      );
      if ((updated.rowCount ?? 0) === 0) {
        return null;
      }
      await client.query(
        'UPDATE password_reset_tokens SET used_at = $2 WHERE player_id = $1 AND used_at IS NULL',
        [playerId, input.now],
      );
      // 02.10.2026 (migration 0057) — şifre sıfırlandıysa hesap ele geçirilmiş
      // olabilir: TÜM oturumlar ve eski token'lar AYNI transaction'da kapanır.
      await revokeAllInTransaction(client, playerId, 'password_reset', input.now);
      return playerId;
    });
  }
}
