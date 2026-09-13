import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { MatchmakingTicket } from '@at-sevdalisi/shared-types';
import type { MatchmakingTicketRepository } from '../../application/ports/matchmaking-ticket.repository';
import { PG_POOL } from '../database/database.module';

/** `matchmaking_tickets` satır şekli (snake_case, `database/migrations/0018_add_pvp_matchmaking.up.sql`). */
interface MatchmakingTicketRow {
  player_id: string;
  horse_id: string;
  rating: number;
  queued_at: Date;
}

function rowToTicket(row: MatchmakingTicketRow): MatchmakingTicket {
  return {
    playerId: row.player_id,
    horseId: row.horse_id,
    rating: row.rating,
    queuedAt: row.queued_at.toISOString(),
  };
}

/**
 * FAZ 1 wiring, on dördüncü dilim (bu oturum) — PvP Eşleştirme (brief
 * §41). `PostgresPlayerRepository`/`PostgresMarketListingRepository` ile
 * AYNI desen (docs/ARCHITECTURE.md §4).
 */
@Injectable()
export class PostgresMatchmakingTicketRepository implements MatchmakingTicketRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<MatchmakingTicket[]> {
    const result = await this.pool.query<MatchmakingTicketRow>('SELECT * FROM matchmaking_tickets');
    return result.rows.map(rowToTicket);
  }

  async findByPlayerId(playerId: string): Promise<MatchmakingTicket | null> {
    const result = await this.pool.query<MatchmakingTicketRow>(
      'SELECT * FROM matchmaking_tickets WHERE player_id = $1 LIMIT 1',
      [playerId],
    );
    return result.rows[0] ? rowToTicket(result.rows[0]) : null;
  }

  async save(ticket: MatchmakingTicket): Promise<void> {
    await this.pool.query(
      `INSERT INTO matchmaking_tickets (player_id, horse_id, rating, queued_at)
       VALUES ($1, $2, $3, $4)`,
      [ticket.playerId, ticket.horseId, ticket.rating, new Date(ticket.queuedAt)],
    );
  }

  /** `DELETE ... RETURNING` — bkz. port'taki "claim" deseni doc yorumu. */
  async deleteByPlayerId(playerId: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM matchmaking_tickets WHERE player_id = $1 RETURNING player_id', [
      playerId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }
}
