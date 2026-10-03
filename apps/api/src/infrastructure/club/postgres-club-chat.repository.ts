import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ClubChatMessageView } from '@at-sevdalisi/shared-types';
import type { ClubChatRepository } from '../../application/ports/club-chat.repository';
import { PG_POOL } from '../database/database.module';

interface Row {
  id: string;
  player_id: string;
  username: string;
  display_name: string;
  body: string;
  created_at: Date;
}

function toView(row: Row): ClubChatMessageView {
  return {
    id: row.id,
    playerId: row.player_id,
    username: row.username,
    displayName: row.display_name,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class PostgresClubChatRepository implements ClubChatRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async isMember(playerId: string, clubId: string): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 FROM club_members WHERE player_id = $1 AND club_id = $2', [
      playerId,
      clubId,
    ]);
    return result.rows.length > 0;
  }

  async list(clubId: string, limit: number): Promise<ClubChatMessageView[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM (
         SELECT m.id, m.player_id, p.username, p.display_name, m.body, m.created_at
           FROM club_messages m JOIN players p ON p.id = m.player_id
          WHERE m.club_id = $1
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT $2
       ) recent ORDER BY created_at ASC, id ASC`,
      [clubId, limit],
    );
    return result.rows.map(toView);
  }

  async insert(input: { clubId: string; playerId: string; body: string }): Promise<ClubChatMessageView> {
    // Üyelik yazma ANINDA da şarttır (kontrol ile yazma arasında çıkarılan
    // üye yazamasın): INSERT … SELECT üyelik satırı yoksa hiç satır eklemez.
    const result = await this.pool.query<Row>(
      `WITH inserted AS (
         INSERT INTO club_messages (club_id, player_id, body)
         SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM club_members WHERE club_id = $1 AND player_id = $2)
         RETURNING id, player_id, body, created_at
       )
       SELECT i.id, i.player_id, p.username, p.display_name, i.body, i.created_at
         FROM inserted i JOIN players p ON p.id = i.player_id`,
      [input.clubId, input.playerId, input.body],
    );
    const row = result.rows[0];
    if (!row) throw new Error('NOT_MEMBER');
    return toView(row);
  }
}
