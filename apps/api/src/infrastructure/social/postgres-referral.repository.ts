import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { ReferralConfig } from '@at-sevdalisi/game-config';
import type {
  ReferralClaimOutcome,
  ReferralOverviewFacts,
  ReferralRepository,
  ReferralRowFacts,
} from '../../application/ports/referral.repository';
import type { SocialPlayerFacts } from '../../application/ports/social.repository';
import { credit } from '../../domain/economy/wallet';
import { PlayerNotFoundError } from '../../domain/player/errors';
import {
  ReferralAlreadyAttachedError,
  ReferralAttachWindowClosedError,
  ReferralCodeNotFoundError,
  ReferralSelfError,
} from '../../domain/social/errors';
import { assertNoBlock } from '../../domain/social/moderation';
import { canAttachReferral, qualifyReferral, referralRewardAllowance } from '../../domain/social/referral';
import { PG_POOL, withTransaction } from '../database/database.module';
import { writeLedgerEntries } from '../player/player-row';

const CODE_CREATE_ATTEMPTS = 5;

interface ReferralRowDb {
  id: string;
  invitee_id: string;
  created_at: Date;
  rewarded_at: Date | null;
  inviter_reward: string | null;
  username: string;
  display_name: string;
  level: number;
  deleted: boolean;
  email_verified: boolean;
  finished_races: number;
  blocked: boolean;
}

/**
 * Davet satırı + davetlinin ilerlemesi (e-posta doğrulaması, bitmiş yarış
 * sayısı, engel). Koşturan oyuncu `e.player_id`dir (CLAUDE.md (55)); iptal
 * edilmemiş katılım (`IS DISTINCT FROM` — NULL'lı pratik satırları da sayar).
 */
const ROW_SELECT = `
  SELECT r.id, r.invitee_id, r.created_at, r.rewarded_at, r.inviter_reward,
         p.username, p.display_name, p.level, (p.deleted_at IS NOT NULL) AS deleted,
         (c.email_verified_at IS NOT NULL) AS email_verified,
         (SELECT COUNT(*) FROM race_entries e JOIN races ra ON ra.id = e.race_id
           WHERE e.player_id = r.invitee_id AND ra.status = 'finished'
             AND e.status IS DISTINCT FROM 'cancelled')::int AS finished_races,
         EXISTS (SELECT 1 FROM player_blocks b
                  WHERE (b.blocker_id = r.inviter_id AND b.blocked_id = r.invitee_id)
                     OR (b.blocker_id = r.invitee_id AND b.blocked_id = r.inviter_id)) AS blocked
    FROM referrals r
    JOIN players p ON p.id = r.invitee_id
    LEFT JOIN player_credentials c ON c.player_id = r.invitee_id`;

function toRowFacts(row: ReferralRowDb): ReferralRowFacts {
  return {
    referralId: row.id,
    invitee: { playerId: row.invitee_id, username: row.username, displayName: row.display_name, level: row.level },
    joinedAt: row.created_at,
    rewardedAt: row.rewarded_at,
    inviterReward: row.inviter_reward === null ? null : Number(row.inviter_reward),
    emailVerified: row.email_verified,
    finishedRaces: row.finished_races,
    inviteeDeleted: row.deleted,
    blockedBetween: row.blocked,
  };
}

async function rewardedCounts(
  client: Pick<PoolClient, 'query'>,
  inviterId: string,
  dayStart: Date,
): Promise<{ lifetime: number; today: number }> {
  const result = await client.query<{ lifetime: number; today: number }>(
    `SELECT COUNT(*)::int AS lifetime, COUNT(*) FILTER (WHERE rewarded_at >= $2)::int AS today
       FROM referrals WHERE inviter_id = $1 AND rewarded_at IS NOT NULL`,
    [inviterId, dayStart],
  );
  return { lifetime: result.rows[0]?.lifetime ?? 0, today: result.rows[0]?.today ?? 0 };
}

@Injectable()
export class PostgresReferralRepository implements ReferralRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getOrCreateCode(playerId: string, makeCode: () => string): Promise<string> {
    for (let attempt = 0; attempt < CODE_CREATE_ATTEMPTS; attempt += 1) {
      const existing = await this.pool.query<{ code: string }>(
        'SELECT code FROM player_referral_codes WHERE player_id = $1',
        [playerId],
      );
      if (existing.rows[0]) return existing.rows[0].code;
      // PK (oyuncu) ve UNIQUE (kod) çakışması ikisi de DO NOTHING → yeniden oku/dene.
      await this.pool.query(
        `INSERT INTO player_referral_codes (player_id, code)
         SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM players WHERE id = $1 AND deleted_at IS NULL)
         ON CONFLICT DO NOTHING`,
        [playerId, makeCode()],
      );
    }
    const final = await this.pool.query<{ code: string }>('SELECT code FROM player_referral_codes WHERE player_id = $1', [
      playerId,
    ]);
    if (!final.rows[0]) throw new PlayerNotFoundError(playerId);
    return final.rows[0].code;
  }

  async findOverview(playerId: string, config: ReferralConfig, _now: Date, dayStart: Date): Promise<ReferralOverviewFacts | null> {
    const player = await this.pool.query<{ created_at: Date; code: string | null }>(
      `SELECT p.created_at, c.code FROM players p LEFT JOIN player_referral_codes c ON c.player_id = p.id
        WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [playerId],
    );
    const me = player.rows[0];
    if (!me || me.code === null) return null;
    const [rows, counts, invitedBy] = await Promise.all([
      this.pool.query<ReferralRowDb>(`${ROW_SELECT} WHERE r.inviter_id = $1 ORDER BY r.created_at DESC LIMIT $2`, [
        playerId,
        config.historyLimit,
      ]),
      rewardedCounts(this.pool, playerId, dayStart),
      this.pool.query<{ id: string; username: string; display_name: string; level: number; rewarded: boolean }>(
        `SELECT p.id, p.username, p.display_name, p.level, (r.rewarded_at IS NOT NULL) AS rewarded
           FROM referrals r JOIN players p ON p.id = r.inviter_id WHERE r.invitee_id = $1`,
        [playerId],
      ),
    ]);
    const inviter = invitedBy.rows[0];
    return {
      code: me.code,
      accountCreatedAt: me.created_at,
      rows: rows.rows.map(toRowFacts),
      rewardedCount: counts.lifetime,
      rewardedToday: counts.today,
      invitedBy: inviter
        ? {
            playerId: inviter.id,
            username: inviter.username,
            displayName: inviter.display_name,
            level: inviter.level,
            rewarded: inviter.rewarded,
          }
        : null,
    };
  }

  async attach(input: { inviteeId: string; code: string; now: Date; attachWindowHours: number }): Promise<SocialPlayerFacts> {
    return withTransaction(this.pool, async (client) => {
      const invitee = await client.query<{ created_at: Date }>(
        'SELECT created_at FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.inviteeId],
      );
      const inviteeRow = invitee.rows[0];
      if (!inviteeRow) throw new PlayerNotFoundError(input.inviteeId);

      const owner = await client.query<{ player_id: string; username: string; display_name: string; level: number }>(
        `SELECT c.player_id, p.username, p.display_name, p.level
           FROM player_referral_codes c JOIN players p ON p.id = c.player_id AND p.deleted_at IS NULL
          WHERE c.code = $1`,
        [input.code],
      );
      const inviter = owner.rows[0];
      if (!inviter) throw new ReferralCodeNotFoundError();
      if (inviter.player_id === input.inviteeId) throw new ReferralSelfError();

      const existing = await client.query<{ inviter_id: string }>(
        'SELECT inviter_id FROM referrals WHERE invitee_id = $1 OR (invitee_id = $2 AND inviter_id = $1)',
        [input.inviteeId, inviter.player_id],
      );
      if (existing.rows.some((row) => row.inviter_id === input.inviteeId)) {
        // Karşılıklı davet (A→B ve B→A) aynı çifte iki kez ödül verirdi.
        throw new ReferralSelfError('Seni davet ettiğin oyuncunun koduna bağlanamazsın.');
      }
      if (existing.rows.length > 0) throw new ReferralAlreadyAttachedError();
      if (!canAttachReferral(inviteeRow.created_at, input.now, input.attachWindowHours)) {
        throw new ReferralAttachWindowClosedError(input.attachWindowHours);
      }
      const blocked = await client.query(
        `SELECT 1 FROM player_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
        [input.inviteeId, inviter.player_id],
      );
      assertNoBlock((blocked.rowCount ?? 0) > 0);

      const inserted = await client.query(
        `INSERT INTO referrals (invitee_id, inviter_id, code, created_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (invitee_id) DO NOTHING RETURNING id`,
        [input.inviteeId, inviter.player_id, input.code, input.now],
      );
      if (inserted.rowCount === 0) throw new ReferralAlreadyAttachedError();
      return {
        playerId: inviter.player_id,
        username: inviter.username,
        displayName: inviter.display_name,
        level: inviter.level,
      };
    });
  }

  async claimRewards(input: { inviterId: string; config: ReferralConfig; now: Date; dayStart: Date }): Promise<ReferralClaimOutcome> {
    const { config } = input;
    return withTransaction(this.pool, async (client) => {
      // Kilit sırası: davet satırları → oyuncular (kimlik sırasıyla). Eşzamanlı
      // ikinci istek aynı satırlarda bekler ve uyanınca `rewarded_at IS NULL`
      // süzgecini YENİDEN değerlendirir → aynı ödül ikinci kez ödenmez.
      const pending = await client.query<{ id: string; invitee_id: string }>(
        `SELECT id, invitee_id FROM referrals WHERE inviter_id = $1 AND rewarded_at IS NULL
          ORDER BY created_at, id FOR UPDATE`,
        [input.inviterId],
      );
      const playerIds = [input.inviterId, ...pending.rows.map((row) => row.invitee_id)].sort();
      const locked = await client.query<{ id: string; money: string; display_name: string; deleted_at: Date | null }>(
        'SELECT id, money, display_name, deleted_at FROM players WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [playerIds],
      );
      const byId = new Map(locked.rows.map((row) => [row.id, row]));
      const inviterRow = byId.get(input.inviterId);
      if (!inviterRow || inviterRow.deleted_at !== null) throw new PlayerNotFoundError(input.inviterId);
      let inviterBalance = Number(inviterRow.money);
      if (pending.rows.length === 0) return { claimed: 0, amount: 0, balanceAfter: inviterBalance, capped: 0 };

      const facts = await client.query<ReferralRowDb>(`${ROW_SELECT} WHERE r.id = ANY($1::uuid[])`, [
        pending.rows.map((row) => row.id),
      ]);
      const factsById = new Map(facts.rows.map((row) => [row.id, toRowFacts(row)]));
      const counts = await rewardedCounts(client, input.inviterId, input.dayStart);
      let allowance = referralRewardAllowance(config, counts.lifetime, counts.today);

      let claimed = 0;
      let amount = 0;
      let capped = 0;
      for (const referral of pending.rows) {
        const row = factsById.get(referral.id);
        if (!row || !qualifyReferral(row, config.conditions).qualified) continue;
        if (allowance <= 0) {
          capped += 1;
          continue;
        }
        allowance -= 1;
        const invitee = byId.get(referral.invitee_id);
        if (!invitee) continue;
        const inviterAfter = credit({ money: inviterBalance, gems: 0 }, Math.max(config.rewards.inviter, 0), 'money').money;
        const inviteeBefore = Number(invitee.money);
        const inviteeAfter = inviteeBefore + config.rewards.invitee;

        await client.query(
          'UPDATE referrals SET rewarded_at = $2, inviter_reward = $3, invitee_reward = $4 WHERE id = $1',
          [referral.id, input.now, config.rewards.inviter, config.rewards.invitee],
        );
        if (config.rewards.invitee > 0) {
          await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
            referral.invitee_id,
            inviteeAfter,
            input.now,
          ]);
          invitee.money = String(inviteeAfter);
        }
        const entries = [
          ...(config.rewards.inviter > 0
            ? [
                {
                  playerId: input.inviterId,
                  type: 'referral_reward' as const,
                  amount: config.rewards.inviter,
                  currency: 'money' as const,
                  referenceType: 'referral',
                  referenceId: referral.id,
                  balanceBefore: inviterBalance,
                  balanceAfter: inviterAfter,
                  idempotencyKey: null,
                },
              ]
            : []),
          ...(config.rewards.invitee > 0
            ? [
                {
                  playerId: referral.invitee_id,
                  type: 'referral_welcome_reward' as const,
                  amount: config.rewards.invitee,
                  currency: 'money' as const,
                  referenceType: 'referral',
                  referenceId: referral.id,
                  balanceBefore: inviteeBefore,
                  balanceAfter: inviteeAfter,
                  idempotencyKey: null,
                },
              ]
            : []),
        ];
        await writeLedgerEntries(client, entries);
        // Bildirimler para hareketiyle AYNI transaction'da (geri alınan ödülün haberi kalmaz).
        await client.query(
          `INSERT INTO notifications (player_id, type, payload) VALUES
             ($1, 'referral_reward', $3::jsonb), ($2, 'referral_reward', $4::jsonb)`,
          [
            input.inviterId,
            referral.invitee_id,
            JSON.stringify({ referralId: referral.id, role: 'inviter', otherName: row.invitee.displayName, amount: config.rewards.inviter }),
            JSON.stringify({ referralId: referral.id, role: 'invitee', otherName: inviterRow.display_name, amount: config.rewards.invitee }),
          ],
        );
        inviterBalance = inviterAfter;
        claimed += 1;
        amount += config.rewards.inviter;
      }
      if (claimed > 0) {
        await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
          input.inviterId,
          inviterBalance,
          input.now,
        ]);
      }
      return { claimed, amount, balanceAfter: inviterBalance, capped };
    });
  }

  async areReferralPair(aId: string, bId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM referrals
        WHERE (invitee_id = $1 AND inviter_id = $2) OR (invitee_id = $2 AND inviter_id = $1) LIMIT 1`,
      [aId, bId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
