import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  RaceTribuneGiftFacts,
  SendTribuneGiftInput,
  SendTribuneGiftOutcome,
  TribuneGiftRepository,
} from '../../application/ports/tribune-gift.repository';
import { credit, debit } from '../../domain/economy/wallet';
import {
  isRaceOpenForTribuneGifts,
  TribuneGiftDailyLimitError,
  TribuneGiftNotAllowedError,
} from '../../domain/grandstand/tribune-gift';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { RaceNotFoundError } from '../../domain/race/errors';
import { assertNoBlock } from '../../domain/social/moderation';
import { PG_POOL, withTransaction } from '../database/database.module';
import { writeLedgerEntries } from '../player/player-row';

interface PlayerRow {
  id: string;
  money: string;
  display_name: string;
  deleted_at: Date | null;
}

@Injectable()
export class PostgresTribuneGiftRepository implements TribuneGiftRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async send(input: SendTribuneGiftInput): Promise<SendTribuneGiftOutcome> {
    return withTransaction(this.pool, async (client) => {
      // Yarış FOR SHARE: iptal ile hediye yarışmasın (iptal satırı FOR UPDATE alır).
      const race = await client.query<{ name: string; status: string; start_time: Date }>(
        'SELECT name, status, start_time FROM races WHERE id = $1 FOR SHARE',
        [input.raceId],
      );
      const raceRow = race.rows[0];
      if (!raceRow) throw new RaceNotFoundError(input.raceId);
      if (!isRaceOpenForTribuneGifts(raceRow.status, raceRow.start_time, input.now, input.giftWindowHours)) {
        throw new TribuneGiftNotAllowedError('race_closed');
      }

      // ALICI = atı bu yarışta KOŞTURAN oyuncu (`e.player_id`), atın şimdiki
      // sahibi DEĞİL (CLAUDE.md (55)). Ayrılan katılım (`cancelled`) koşmaz.
      const entry = await client.query<{ player_id: string | null; horse_name: string }>(
        `SELECT e.player_id, h.name AS horse_name
           FROM race_entries e JOIN horses h ON h.id = e.horse_id
          WHERE e.race_id = $1 AND e.horse_id = $2 AND e.status IS DISTINCT FROM 'cancelled'
          LIMIT 1`,
        [input.raceId, input.horseId],
      );
      const entryRow = entry.rows[0];
      if (!entryRow) throw new TribuneGiftNotAllowedError('horse_not_in_race');
      const recipientId = entryRow.player_id;
      if (recipientId === null) throw new TribuneGiftNotAllowedError('no_owner');
      if (recipientId === input.senderId) throw new TribuneGiftNotAllowedError('self');

      // İki oyuncu id SIRASIYLA kilitlenir (hediye/pazar ile aynı global sıra).
      const players = new Map<string, PlayerRow>();
      for (const id of [input.senderId, recipientId].sort()) {
        const result = await client.query<PlayerRow>(
          'SELECT id, money, display_name, deleted_at FROM players WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (result.rows[0]) players.set(id, result.rows[0]);
      }
      const sender = players.get(input.senderId);
      if (!sender || sender.deleted_at !== null) throw new PlayerNotFoundError(input.senderId);
      const recipient = players.get(recipientId);
      if (!recipient || recipient.deleted_at !== null) throw new TribuneGiftNotAllowedError('no_owner');

      const blocked = await client.query(
        `SELECT 1 FROM player_blocks
          WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
          LIMIT 1`,
        [input.senderId, recipientId],
      );
      assertNoBlock((blocked.rowCount ?? 0) > 0);

      // Günlük sınır gönderenin KİLİDİ ALTINDA sayılır (eşzamanlı istekler aşamaz).
      const sentToday = await client.query<{ count: string }>(
        'SELECT COUNT(*)::bigint AS count FROM tribune_gifts WHERE sender_id = $1 AND created_at >= $2',
        [input.senderId, input.dayStart],
      );
      if (Number(sentToday.rows[0]?.count ?? 0) >= input.dailyLimit) {
        throw new TribuneGiftDailyLimitError(input.dailyLimit);
      }

      const senderBefore = Number(sender.money);
      const senderAfter = debit({ money: senderBefore, gems: 0 }, input.price, 'money').money;
      const recipientBefore = Number(recipient.money);
      const recipientAfter = credit({ money: recipientBefore, gems: 0 }, input.ownerAmount, 'money').money;

      const inserted = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO tribune_gifts (race_id, horse_id, sender_id, recipient_id, gift_key, price, owner_amount, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [input.raceId, input.horseId, input.senderId, recipientId, input.giftKey, input.price, input.ownerAmount, input.now],
      );
      const gift = inserted.rows[0]!;

      await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
        input.senderId,
        senderAfter,
        input.now,
      ]);
      await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
        recipientId,
        recipientAfter,
        input.now,
      ]);
      await writeLedgerEntries(client, [
        {
          playerId: input.senderId,
          type: 'tribune_gift_debit',
          amount: -input.price,
          currency: 'money',
          referenceType: 'tribune_gifts',
          referenceId: gift.id,
          balanceBefore: senderBefore,
          balanceAfter: senderAfter,
          idempotencyKey: input.idempotencyKey,
        },
        {
          playerId: recipientId,
          type: 'tribune_gift_credit',
          amount: input.ownerAmount,
          currency: 'money',
          referenceType: 'tribune_gifts',
          referenceId: gift.id,
          balanceBefore: recipientBefore,
          balanceAfter: recipientAfter,
          idempotencyKey: null,
        },
      ]);

      // Bildirim para hareketiyle AYNI transaction'da (geri alınan hediyenin haberi kalmasın).
      await client.query('INSERT INTO notifications (player_id, type, payload) VALUES ($1, $2, $3::jsonb)', [
        recipientId,
        'tribune_gift_received',
        JSON.stringify({
          tribuneGiftId: gift.id,
          raceId: input.raceId,
          raceName: raceRow.name,
          horseId: input.horseId,
          horseName: entryRow.horse_name,
          giftKey: input.giftKey,
          playerId: input.senderId,
          displayName: sender.display_name,
          amount: input.ownerAmount,
        }),
      ]);

      return {
        tribuneGiftId: gift.id,
        horseName: entryRow.horse_name,
        senderDisplayName: sender.display_name,
        senderBalanceAfter: senderAfter,
        createdAt: gift.created_at,
      };
    });
  }

  async findForRace(
    raceId: string,
    viewerId: string,
    dayStart: Date,
    recentLimit: number,
  ): Promise<RaceTribuneGiftFacts | null> {
    const race = await this.pool.query<{ status: string; start_time: Date }>(
      'SELECT status, start_time FROM races WHERE id = $1',
      [raceId],
    );
    const raceRow = race.rows[0];
    if (!raceRow) return null;
    const [recipients, perHorse, recent, sentToday] = await Promise.all([
      // Alıcı olabilecek atlar: KOŞTURAN oyuncusu olan (bot değil), ayrılmamış
      // katılımlar; çağıranın kendi atı hariç (kendine hediye yok).
      this.pool.query<{ horse_id: string; horse_name: string; display_name: string }>(
        `SELECT e.horse_id, h.name AS horse_name, p.display_name
           FROM race_entries e
           JOIN horses h ON h.id = e.horse_id
           JOIN players p ON p.id = e.player_id
          WHERE e.race_id = $1 AND e.status IS DISTINCT FROM 'cancelled'
            AND e.player_id <> $2 AND p.deleted_at IS NULL
          ORDER BY e.gate_position NULLS LAST, h.name`,
        [raceId, viewerId],
      ),
      this.pool.query<{ horse_id: string; gift_key: string; count: string }>(
        `SELECT horse_id, gift_key, COUNT(*)::bigint AS count FROM tribune_gifts
          WHERE race_id = $1 GROUP BY horse_id, gift_key ORDER BY horse_id, gift_key`,
        [raceId],
      ),
      this.pool.query<{
        id: string;
        gift_key: string;
        horse_id: string;
        horse_name: string;
        display_name: string;
        created_at: Date;
      }>(
        `SELECT g.id, g.gift_key, g.horse_id, h.name AS horse_name, p.display_name, g.created_at
           FROM tribune_gifts g
           JOIN horses h ON h.id = g.horse_id
           JOIN players p ON p.id = g.sender_id
          WHERE g.race_id = $1
          ORDER BY g.created_at DESC, g.id DESC LIMIT $2`,
        [raceId, recentLimit],
      ),
      this.pool.query<{ count: string }>(
        'SELECT COUNT(*)::bigint AS count FROM tribune_gifts WHERE sender_id = $1 AND created_at >= $2',
        [viewerId, dayStart],
      ),
    ]);
    return {
      status: raceRow.status,
      startTime: raceRow.start_time,
      recipients: recipients.rows.map((row) => ({
        horseId: row.horse_id,
        horseName: row.horse_name,
        ownerDisplayName: row.display_name,
      })),
      // BIGINT metin döner (CLAUDE.md) — `Number(...)` şart.
      perHorse: perHorse.rows.map((row) => ({ horseId: row.horse_id, giftKey: row.gift_key, count: Number(row.count) })),
      recent: recent.rows.map((row) => ({
        tribuneGiftId: row.id,
        giftKey: row.gift_key,
        horseId: row.horse_id,
        horseName: row.horse_name,
        senderDisplayName: row.display_name,
        createdAt: row.created_at.toISOString(),
      })),
      sentToday: Number(sentToday.rows[0]?.count ?? 0),
    };
  }
}
