import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  NewProfilePhoto,
  ProfilePhotoRepository,
  StoredProfilePhoto,
} from '../../application/ports/profile-photo.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

interface PhotoRow {
  player_id: string;
  photo_id: string;
  storage_key: string;
  content_type: string;
  width: number;
  height: number;
  byte_size: number;
  updated_at: Date;
}

const COLUMNS = 'pp.player_id, pp.photo_id, pp.storage_key, pp.content_type, pp.width, pp.height, pp.byte_size, pp.updated_at';

function toPhoto(row: PhotoRow): StoredProfilePhoto {
  return {
    playerId: row.player_id,
    photoId: row.photo_id,
    storageKey: row.storage_key,
    contentType: row.content_type,
    width: Number(row.width),
    height: Number(row.height),
    byteSize: Number(row.byte_size),
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class PostgresProfilePhotoRepository implements ProfilePhotoRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByPlayer(playerId: string): Promise<StoredProfilePhoto | null> {
    const result = await this.pool.query<PhotoRow>(`SELECT ${COLUMNS} FROM player_photos pp WHERE pp.player_id = $1`, [
      playerId,
    ]);
    return result.rows[0] ? toPhoto(result.rows[0]) : null;
  }

  async findByPhotoId(photoId: string): Promise<StoredProfilePhoto | null> {
    const result = await this.pool.query<PhotoRow>(
      `SELECT ${COLUMNS}
         FROM player_photos pp
         JOIN players p ON p.id = pp.player_id AND p.deleted_at IS NULL
        WHERE pp.photo_id = $1`,
      [photoId],
    );
    return result.rows[0] ? toPhoto(result.rows[0]) : null;
  }

  async replace(photo: NewProfilePhoto, now: Date): Promise<{ previousStorageKey: string | null }> {
    return withTransaction(this.pool, async (client) => {
      const previous = await this.lockKey(client, photo.playerId);
      await client.query(
        `INSERT INTO player_photos (player_id, photo_id, storage_key, content_type, width, height, byte_size, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (player_id) DO UPDATE SET
           photo_id = EXCLUDED.photo_id, storage_key = EXCLUDED.storage_key,
           content_type = EXCLUDED.content_type, width = EXCLUDED.width, height = EXCLUDED.height,
           byte_size = EXCLUDED.byte_size, updated_at = EXCLUDED.updated_at`,
        [photo.playerId, photo.photoId, photo.storageKey, photo.contentType, photo.width, photo.height, photo.byteSize, now],
      );
      return { previousStorageKey: previous };
    });
  }

  async remove(playerId: string): Promise<string | null> {
    const result = await this.pool.query<{ storage_key: string }>(
      'DELETE FROM player_photos WHERE player_id = $1 RETURNING storage_key',
      [playerId],
    );
    return result.rows[0]?.storage_key ?? null;
  }

  async removeByStaff(input: { actorId: string; playerId: string; reason: string }): Promise<string | null> {
    return withTransaction(this.pool, async (client) => {
      const removed = await client.query<{ storage_key: string; photo_id: string }>(
        'DELETE FROM player_photos WHERE player_id = $1 RETURNING storage_key, photo_id',
        [input.playerId],
      );
      const row = removed.rows[0];
      if (!row) return null;
      // Denetim kaydı kaldırmayla AYNI transaction'da (CLAUDE.md: ayrı bir
      // INSERT geri alınmış bir kaldırmanın kaydını bırakırdı).
      await client.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, 'player.photo_removed', 'player', $2, $3::jsonb)`,
        [input.actorId, input.playerId, JSON.stringify({ reason: input.reason, photoId: row.photo_id })],
      );
      return row.storage_key;
    });
  }

  private async lockKey(client: PoolClient, playerId: string): Promise<string | null> {
    const result = await client.query<{ storage_key: string }>(
      'SELECT storage_key FROM player_photos WHERE player_id = $1 FOR UPDATE',
      [playerId],
    );
    return result.rows[0]?.storage_key ?? null;
  }
}
