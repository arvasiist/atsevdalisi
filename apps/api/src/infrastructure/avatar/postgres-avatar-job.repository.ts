import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AdminAvatarJobView, AvatarJobStatus } from '@at-sevdalisi/shared-types';
import type {
  AiAvatarRecord,
  AvatarJobMutation,
  AvatarJobMutationResult,
  AvatarJobRecord,
  AvatarJobRepository,
} from '../../application/ports/avatar-job.repository';
import { assertAvatarJobTransition, isTerminalAvatarJob } from '../../domain/avatar/generation-job';
import { PG_POOL, withTransaction } from '../database/database.module';

interface JobRow {
  id: string;
  player_id: string;
  status: AvatarJobStatus;
  provider: string;
  provider_job_id: string | null;
  selfie_key: string | null;
  error_code: string | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
}

const JOB_COLUMNS =
  'id, player_id, status, provider, provider_job_id, selfie_key, error_code, created_at, updated_at, finished_at';
const ACTIVE = `status IN ('requested', 'analyzing', 'generating', 'processing')`;

function toJob(row: JobRow): AvatarJobRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    status: row.status,
    provider: row.provider,
    providerJobId: row.provider_job_id,
    selfieKey: row.selfie_key,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

interface AiRow {
  player_id: string;
  job_id: string;
  model_key: string;
  thumbnail_key: string | null;
  updated_at: Date;
}

function toAi(row: AiRow): AiAvatarRecord {
  return {
    playerId: row.player_id,
    jobId: row.job_id,
    modelKey: row.model_key,
    thumbnailKey: row.thumbnail_key,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class PostgresAvatarJobRepository implements AvatarJobRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: {
    id: string;
    playerId: string;
    provider: string;
    consentVersion: string;
    selfieKey: string;
    now: Date;
  }): Promise<AvatarJobRecord | 'active_exists'> {
    const result = await this.pool.query<JobRow>(
      `INSERT INTO avatar_generation_jobs
         (id, player_id, status, provider, consent_version, consented_at, selfie_key, created_at, updated_at)
       VALUES ($1, $2, 'requested', $3, $4, $5, $6, $5, $5)
       ON CONFLICT (player_id) WHERE ${ACTIVE} DO NOTHING
       RETURNING ${JOB_COLUMNS}`,
      [input.id, input.playerId, input.provider, input.consentVersion, input.now, input.selfieKey],
    );
    const row = result.rows[0];
    return row ? toJob(row) : 'active_exists';
  }

  async findLatestForPlayer(playerId: string): Promise<AvatarJobRecord | null> {
    const result = await this.pool.query<JobRow>(
      `SELECT ${JOB_COLUMNS} FROM avatar_generation_jobs WHERE player_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [playerId],
    );
    return result.rows[0] ? toJob(result.rows[0]) : null;
  }

  async findForPlayer(playerId: string, jobId: string): Promise<AvatarJobRecord | null> {
    const result = await this.pool.query<JobRow>(
      `SELECT ${JOB_COLUMNS} FROM avatar_generation_jobs WHERE id = $1 AND player_id = $2`,
      [jobId, playerId],
    );
    return result.rows[0] ? toJob(result.rows[0]) : null;
  }

  async findActive(limit: number): Promise<AvatarJobRecord[]> {
    const result = await this.pool.query<JobRow>(
      `SELECT ${JOB_COLUMNS} FROM avatar_generation_jobs WHERE ${ACTIVE} ORDER BY updated_at ASC, id ASC LIMIT $1`,
      [limit],
    );
    return result.rows.map(toJob);
  }

  async mutate(
    jobId: string,
    now: Date,
    decide: (job: AvatarJobRecord) => AvatarJobMutation,
  ): Promise<AvatarJobMutationResult | null> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query<JobRow>(
        `SELECT ${JOB_COLUMNS} FROM avatar_generation_jobs WHERE id = $1 FOR UPDATE`,
        [jobId],
      );
      const row = locked.rows[0];
      if (!row) return null;
      const current = toJob(row);
      const decision = decide(current);
      if (decision.kind === 'skip') return { job: current, replaced: null };
      // Geçiş kuralı KİLİT ALTINDA (zamanlayıcı ile oyuncunun iptali yarışırsa biri kaybeder).
      assertAvatarJobTransition(current.status, decision.status);
      const terminal = isTerminalAvatarJob(decision.status);
      const updated = await client.query<JobRow>(
        `UPDATE avatar_generation_jobs
            SET status = $2,
                provider_job_id = COALESCE($3::text, provider_job_id),
                error_code = $4::text,
                selfie_key = CASE WHEN $5::boolean THEN NULL ELSE selfie_key END,
                updated_at = $6::timestamptz,
                finished_at = CASE WHEN $7::boolean THEN $6::timestamptz ELSE NULL END
          WHERE id = $1
          RETURNING ${JOB_COLUMNS}`,
        [
          jobId,
          decision.status,
          decision.providerJobId ?? null,
          decision.errorCode ?? null,
          decision.clearSelfie === true,
          now,
          terminal,
        ],
      );
      let replaced: AiAvatarRecord | null = null;
      if (decision.aiAvatar) {
        const previous = await client.query<AiRow>(
          'SELECT player_id, job_id, model_key, thumbnail_key, updated_at FROM player_ai_avatars WHERE player_id = $1 FOR UPDATE',
          [current.playerId],
        );
        replaced = previous.rows[0] ? toAi(previous.rows[0]) : null;
        await client.query(
          `INSERT INTO player_ai_avatars (player_id, job_id, model_key, thumbnail_key, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (player_id) DO UPDATE
             SET job_id = EXCLUDED.job_id, model_key = EXCLUDED.model_key,
                 thumbnail_key = EXCLUDED.thumbnail_key, updated_at = EXCLUDED.updated_at`,
          [current.playerId, jobId, decision.aiAvatar.modelKey, decision.aiAvatar.thumbnailKey, now],
        );
      }
      return { job: toJob(updated.rows[0]!), replaced };
    });
  }

  async findAiAvatar(playerId: string): Promise<AiAvatarRecord | null> {
    const result = await this.pool.query<AiRow>(
      'SELECT player_id, job_id, model_key, thumbnail_key, updated_at FROM player_ai_avatars WHERE player_id = $1',
      [playerId],
    );
    return result.rows[0] ? toAi(result.rows[0]) : null;
  }

  async purgeForPlayer(playerId: string): Promise<string[]> {
    return withTransaction(this.pool, async (client) => {
      const ai = await client.query<{ model_key: string; thumbnail_key: string | null }>(
        'DELETE FROM player_ai_avatars WHERE player_id = $1 RETURNING model_key, thumbnail_key',
        [playerId],
      );
      const jobs = await client.query<{ selfie_key: string | null }>(
        'DELETE FROM avatar_generation_jobs WHERE player_id = $1 RETURNING selfie_key',
        [playerId],
      );
      return [
        ...ai.rows.flatMap((row) => [row.model_key, row.thumbnail_key]),
        ...jobs.rows.map((row) => row.selfie_key),
      ].filter((key): key is string => key !== null);
    });
  }

  async listForAdmin(limit: number): Promise<AdminAvatarJobView[]> {
    const result = await this.pool.query<JobRow & { username: string }>(
      `SELECT j.id, j.player_id, j.status, j.provider, j.provider_job_id, j.selfie_key, j.error_code,
              j.created_at, j.updated_at, j.finished_at, p.username
         FROM avatar_generation_jobs j JOIN players p ON p.id = j.player_id
        ORDER BY j.created_at DESC, j.id DESC LIMIT $1`,
      [limit],
    );
    // Depo anahtarları ve sağlayıcı iş kimliği YÖNETİCİYE DE gösterilmez (selfie'ye giden yol).
    return result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      errorCode: row.error_code,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      finishedAt: row.finished_at?.toISOString() ?? null,
      playerId: row.player_id,
      username: row.username,
      provider: row.provider,
    }));
  }
}
