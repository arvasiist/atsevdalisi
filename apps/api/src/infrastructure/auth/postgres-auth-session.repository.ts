import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  AuthSessionRepository,
  RotateResult,
  SessionRevokeReason,
  StoredSession,
} from '../../application/ports/auth-session.repository';
import type { SessionAuthorizationState } from '../../domain/auth/session';
import { PG_POOL, withTransaction } from '../database/database.module';

interface SessionRow {
  id: string;
  user_agent: string | null;
  created_at: Date;
  last_used_at: Date;
  expires_at: Date;
}

/** `auth_sessions` (migration 0057) — port doc yorumu okunmalıdır. */
@Injectable()
export class PostgresAuthSessionRepository implements AuthSessionRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: {
    playerId: string;
    refreshHash: string;
    userAgent: string | null;
    expiresAt: Date;
    now: Date;
    maxActive: number;
  }): Promise<string> {
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO auth_sessions (player_id, refresh_token_hash, user_agent, created_at, last_used_at, expires_at)
         VALUES ($1, $2, $3, $4, $4, $5) RETURNING id`,
        [input.playerId, input.refreshHash, input.userAgent, input.now, input.expiresAt],
      );
      // Sınır aşıldıysa en eski aktif oturumlar kapanır (yeni açılan en
      // yenidir, OFFSET onu korur).
      await client.query(
        `UPDATE auth_sessions SET revoked_at = $3, revoke_reason = 'revoked'
         WHERE id IN (
           SELECT id FROM auth_sessions
           WHERE player_id = $1 AND revoked_at IS NULL AND expires_at > $3
           ORDER BY created_at DESC, id DESC
           OFFSET $2
         )`,
        [input.playerId, input.maxActive, input.now],
      );
      return inserted.rows[0]!.id;
    });
  }

  async rotate(input: {
    refreshHash: string;
    newRefreshHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<RotateResult> {
    return withTransaction(this.pool, async (client) => {
      const current = await client.query<{ id: string; player_id: string; revoked_at: Date | null; expires_at: Date }>(
        `SELECT id, player_id, revoked_at, expires_at FROM auth_sessions
         WHERE refresh_token_hash = $1 FOR UPDATE`,
        [input.refreshHash],
      );
      const row = current.rows[0];
      if (row !== undefined) {
        if (row.revoked_at !== null || row.expires_at.getTime() <= input.now.getTime()) {
          return { kind: 'invalid' };
        }
        await client.query(
          `UPDATE auth_sessions
           SET previous_refresh_hash = refresh_token_hash, refresh_token_hash = $2,
               last_used_at = $3, expires_at = $4
           WHERE id = $1`,
          [row.id, input.newRefreshHash, input.now, input.expiresAt],
        );
        return { kind: 'rotated', sessionId: row.id, playerId: row.player_id };
      }
      // Güncel değil ama bir önceki token: ya çalındı ya da bir istemci
      // eski kopyayı kullandı — hangisi olduğu bilinemez, oturum kapanır.
      const reused = await client.query<{ id: string }>(
        `UPDATE auth_sessions SET revoked_at = $2, revoke_reason = 'reuse_detected'
         WHERE previous_refresh_hash = $1 AND revoked_at IS NULL RETURNING id`,
        [input.refreshHash, input.now],
      );
      return (reused.rowCount ?? 0) > 0 ? { kind: 'reuse_detected' } : { kind: 'invalid' };
    });
  }

  async authorizationState(playerId: string, sessionId: string | null): Promise<SessionAuthorizationState> {
    const result = await this.pool.query<{
      tokens_valid_after: Date | null;
      session_id: string | null;
      revoked_at: Date | null;
      expires_at: Date | null;
    }>(
      `SELECT p.tokens_valid_after, s.id AS session_id, s.revoked_at, s.expires_at
       FROM players p
       LEFT JOIN auth_sessions s ON s.id = $2::uuid AND s.player_id = p.id
       WHERE p.id = $1`,
      [playerId, sessionId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return { playerExists: false, tokensValidAfter: null, session: null };
    }
    return {
      playerExists: true,
      tokensValidAfter: row.tokens_valid_after,
      session:
        row.session_id === null || row.expires_at === null
          ? null
          : { revokedAt: row.revoked_at, expiresAt: row.expires_at },
    };
  }

  async listActive(playerId: string, now: Date): Promise<StoredSession[]> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, user_agent, created_at, last_used_at, expires_at FROM auth_sessions
       WHERE player_id = $1 AND revoked_at IS NULL AND expires_at > $2
       ORDER BY last_used_at DESC, id DESC`,
      [playerId, now],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
    }));
  }

  async revoke(playerId: string, sessionId: string, reason: SessionRevokeReason, now: Date): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE auth_sessions SET revoked_at = $4, revoke_reason = $3
       WHERE id = $2 AND player_id = $1 AND revoked_at IS NULL`,
      [playerId, sessionId, reason, now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revokeAll(playerId: string, reason: SessionRevokeReason, now: Date): Promise<void> {
    await withTransaction(this.pool, (client) => revokeAllInTransaction(client, playerId, reason, now));
  }

  async invalidateLegacyTokens(playerId: string, now: Date): Promise<void> {
    await this.pool.query('UPDATE players SET tokens_valid_after = $2 WHERE id = $1', [playerId, now]);
  }
}

/**
 * Tüm oturumları kapatır + eski token'ları keser. Başka bir transaction'ın
 * içinden çağrılabilir (şifre sıfırlama, hesap silme) — kapanış, onu
 * gerektiren değişiklikle AYNI anda kalıcı olur.
 */
export async function revokeAllInTransaction(
  client: PoolClient,
  playerId: string,
  reason: SessionRevokeReason,
  now: Date,
): Promise<void> {
  await client.query(
    `UPDATE auth_sessions SET revoked_at = $3, revoke_reason = $2
     WHERE player_id = $1 AND revoked_at IS NULL`,
    [playerId, reason, now],
  );
  await client.query('UPDATE players SET tokens_valid_after = $2 WHERE id = $1', [playerId, now]);
}
