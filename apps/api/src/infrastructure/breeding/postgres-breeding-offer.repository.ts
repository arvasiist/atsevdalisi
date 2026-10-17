import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { BreedingOfferView, MyStudView, NotificationPayloadByType } from '@at-sevdalisi/shared-types';
import type {
  AcceptOfferInput,
  BreedingOfferRepository,
  CreateOfferInput,
} from '../../application/ports/breeding.repository';
import { ForbiddenError } from '../../domain/auth/errors';
import { isWithinBreedingAge, lifetimeFoalLimitFor, studFeeOwnerShare } from '../../domain/breeding/breeding';
import {
  failedConceptionRefund,
  isStudFeeWithinBounds,
  offerExpiresAt,
  studFeeBounds,
} from '../../domain/breeding/breeding-center';
import {
  BreedingHorseListedError,
  BreedingOfferExpiredError,
  BreedingOfferNotFoundError,
  BreedingOfferNotPendingError,
  BreedingOfferOwnStallionError,
  MareNotOwnedError,
  NotEligibleForBreedingError,
  StudFeeOutOfBoundsError,
  StudListingNotFoundError,
  type BreedingIneligibilityReason,
} from '../../domain/breeding/errors';
import { credit, debit } from '../../domain/economy/wallet';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { computeHorseAgeMonths } from '../../domain/horse/age-curve';
import { assertCanAddHorseToStable, getStableCapacity } from '../../domain/stable/stable';
import type { EconomyLedgerEntryInput } from '../../application/ports/economy-ledger';
import { AppConfigService } from '../config/config.service';
import { PG_POOL, withTransaction } from '../database/database.module';
import { writeLedgerEntries } from '../player/player-row';
import {
  assertConceptionAllowed,
  assertCrossOwnerAllowed,
  conceiveInTransaction,
  countStableOccupancy,
  lockBreedingHorses,
  lockPlayers,
  type ConceptionConfigs,
  type LockedPlayerRow,
} from './conception';

/**
 * 16.10.2026 — ÇİFTLEŞTİRME MERKEZİ: aygır ilanı + teklif (brief §4).
 * **PARA YOLU.** Teklif ücreti teklif anında EMANETE alınır; ret, iptal,
 * ilanın geri çekilmesi ve süre dolumu TAM iade eder; kabulde döllenme
 * tutarsa aygır sahibine pay (`studFeeOwnerSharePercent`) geçer, kalan
 * ekonomiden çıkar; tutmazsa `failedConceptionRefundPercent` iade edilir.
 *
 * Kilit sırası (deadlock olmasın diye HER yolda aynı): atlar (id sırası) →
 * ilan → teklif → oyuncular (id sırası). Kabul bu yüzden teklifi önce
 * KİLİTSİZ okur, atları kilitler, sonra teklifi kilitleyip yeniden denetler.
 * Çift kabul/çift ödeme `pending` geçişinin kendisiyle engellenir.
 */

interface OfferRow {
  id: string;
  mare_id: string;
  mare_name: string;
  mare_fertility: number;
  stallion_id: string;
  stallion_name: string;
  mare_owner_id: string;
  mare_owner_username: string | null;
  mare_owner_name: string;
  stallion_owner_id: string;
  stallion_owner_username: string | null;
  fee: string;
  foal_name: string;
  status: BreedingOfferView['status'];
  outcome: BreedingOfferView['outcome'];
  refunded_amount: string;
  pregnancy_id: string | null;
  created_at: Date;
  expires_at: Date;
  responded_at: Date | null;
}

const OFFER_SELECT = `
  SELECT o.id, o.mare_id, m.name AS mare_name, m.fertility AS mare_fertility, o.stallion_id, s.name AS stallion_name,
         o.mare_owner_id, mo.username AS mare_owner_username, mo.display_name AS mare_owner_name,
         o.stallion_owner_id, so.username AS stallion_owner_username,
         o.fee, o.foal_name, o.status, o.outcome, o.refunded_amount, o.pregnancy_id,
         o.created_at, o.expires_at, o.responded_at
  FROM breeding_offers o
  JOIN horses m ON m.id = o.mare_id
  JOIN horses s ON s.id = o.stallion_id
  JOIN players mo ON mo.id = o.mare_owner_id
  JOIN players so ON so.id = o.stallion_owner_id`;

function toOfferView(row: OfferRow, viewerId: string): BreedingOfferView {
  return {
    offerId: row.id,
    direction: row.mare_owner_id === viewerId ? 'outgoing' : 'incoming',
    mare: { horseId: row.mare_id, name: row.mare_name, fertility: row.mare_fertility },
    stallion: { horseId: row.stallion_id, name: row.stallion_name },
    mareOwner: { playerId: row.mare_owner_id, username: row.mare_owner_username },
    stallionOwner: { playerId: row.stallion_owner_id, username: row.stallion_owner_username },
    fee: Number(row.fee),
    foalName: row.foal_name,
    status: row.status,
    outcome: row.outcome,
    refundedAmount: Number(row.refunded_amount),
    pregnancyId: row.pregnancy_id,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    respondedAt: row.responded_at?.toISOString() ?? null,
  };
}

interface StudRow {
  id: string;
  name: string;
  breed: string;
  owner_id: string;
  fertility: number;
  birth_date: Date;
  aging_started_at: Date;
  status: string;
  quality: string;
  potential: string;
  listing_fee: string | null;
  listing_status: 'active' | 'withdrawn' | null;
  foal_count: string;
  pending_offers: string;
  is_listed: boolean;
}

const MY_STUDS_SELECT = `
  SELECT h.id, h.name, h.breed, h.owner_id, h.fertility, h.birth_date, h.aging_started_at, h.status,
         h.quality, h.potential,
         CASE WHEN sl.owner_id = h.owner_id THEN sl.fee END AS listing_fee,
         CASE WHEN sl.owner_id = h.owner_id THEN sl.status END AS listing_status,
         (SELECT COUNT(*) FROM breeding_pairs bp WHERE bp.stallion_id = h.id AND bp.foal_id IS NOT NULL)
           + (SELECT COUNT(*) FROM pregnancies pr WHERE pr.stallion_id = h.id AND pr.status = 'gestating') AS foal_count,
         (SELECT COUNT(*) FROM breeding_offers o WHERE o.stallion_id = h.id AND o.status = 'pending') AS pending_offers,
         EXISTS (SELECT 1 FROM market_listings ml WHERE ml.horse_id = h.id AND ml.status = 'active') AS is_listed
  FROM horses h
  LEFT JOIN stud_listings sl ON sl.stallion_id = h.id`;

@Injectable()
export class PostgresBreedingOfferRepository implements BreedingOfferRepository {
  private readonly logger = new Logger(PostgresBreedingOfferRepository.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private get configs(): ConceptionConfigs {
    return {
      genetics: this.config.genetics,
      horseGrowth: this.config.horseGrowth,
      stable: this.config.stable,
      breeds: this.config.breeds,
      horseAppearance: this.config.horseAppearance,
    };
  }

  // -------------------------------------------------------------------------
  // İlan
  // -------------------------------------------------------------------------

  async findMyStuds(ownerId: string, now: Date): Promise<MyStudView[]> {
    const result = await this.pool.query<StudRow>(
      `${MY_STUDS_SELECT}
       WHERE h.owner_id = $1 AND h.gender = 'stallion'
       ORDER BY (h.status = 'retired') DESC, h.quality DESC, h.id`,
      [ownerId],
    );
    return result.rows.map((row) => this.toMyStud(row, now));
  }

  async upsertStudListing(input: { ownerId: string; stallionId: string; fee: unknown; now: Date }): Promise<MyStudView> {
    return withTransaction(this.pool, async (client) => {
      const row = await this.lockStud(client, input.stallionId);
      if (row.owner_id !== input.ownerId) throw new ForbiddenError('Bu at size ait değil.');
      const reason = this.studIneligibility(row, input.now);
      if (reason === 'LISTED_IN_MARKET') throw new BreedingHorseListedError(row.id);
      if (reason !== null) throw new NotEligibleForBreedingError(reason);
      const bounds = studFeeBounds({ quality: Number(row.quality), potential: Number(row.potential) }, this.config.genetics);
      if (!isStudFeeWithinBounds(input.fee, bounds)) throw new StudFeeOutOfBoundsError(bounds.min, bounds.max);
      await client.query(
        `INSERT INTO stud_listings (stallion_id, owner_id, fee, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', $4, $4)
         ON CONFLICT (stallion_id) DO UPDATE
           SET owner_id = EXCLUDED.owner_id, fee = EXCLUDED.fee, status = 'active', updated_at = EXCLUDED.updated_at`,
        [row.id, input.ownerId, input.fee, input.now],
      );
      const fresh = await client.query<StudRow>(`${MY_STUDS_SELECT} WHERE h.id = $1`, [row.id]);
      return this.toMyStud(fresh.rows[0]!, input.now);
    });
  }

  async withdrawStudListing(input: { ownerId: string; stallionId: string; now: Date }): Promise<{ cancelledOffers: number }> {
    return withTransaction(this.pool, async (client) => {
      await client.query('SELECT id FROM horses WHERE id = $1 FOR UPDATE', [input.stallionId]);
      const listing = await client.query<{ owner_id: string; status: string }>(
        'SELECT owner_id, status FROM stud_listings WHERE stallion_id = $1 FOR UPDATE',
        [input.stallionId],
      );
      const current = listing.rows[0];
      if (!current || current.owner_id !== input.ownerId || current.status !== 'active') {
        throw new StudListingNotFoundError(input.stallionId);
      }
      await client.query("UPDATE stud_listings SET status = 'withdrawn', updated_at = $2 WHERE stallion_id = $1", [
        input.stallionId,
        input.now,
      ]);
      const pending = await client.query<OfferRow>(
        `${OFFER_SELECT} WHERE o.stallion_id = $1 AND o.status = 'pending' ORDER BY o.id FOR UPDATE OF o`,
        [input.stallionId],
      );
      if (pending.rows.length === 0) return { cancelledOffers: 0 };
      const players = await lockPlayers(
        client,
        pending.rows.map((offer) => offer.mare_owner_id),
      );
      for (const offer of pending.rows) {
        await this.closeWithFullRefund(client, offer, players, 'cancelled', input.now, true);
      }
      return { cancelledOffers: pending.rows.length };
    });
  }

  // -------------------------------------------------------------------------
  // Teklif
  // -------------------------------------------------------------------------

  async createOffer(input: CreateOfferInput): Promise<BreedingOfferView> {
    return withTransaction(this.pool, async (client) => {
      const rows = await lockBreedingHorses(client, input.mareId, input.stallionId);
      if (rows.mare.owner_id !== input.mareOwnerId) throw new MareNotOwnedError(input.mareId);
      if (rows.stallion.owner_id === input.mareOwnerId) throw new BreedingOfferOwnStallionError();
      const listing = await client.query<{ owner_id: string; status: string; fee: string }>(
        'SELECT owner_id, status, fee FROM stud_listings WHERE stallion_id = $1 FOR SHARE',
        [input.stallionId],
      );
      const stud = listing.rows[0];
      if (!stud || stud.status !== 'active' || stud.owner_id !== rows.stallion.owner_id) {
        throw new StudListingNotFoundError(input.stallionId);
      }
      // Para emanete alınmadan ÖNCE: kabulde uygulanacak kuralın aynısı
      // (bekleyen teklif, yaş, emeklilik, tay sınırı, gebelik, dinlenme, ilan).
      await assertConceptionAllowed(client, rows, input.now, this.configs, null);

      const players = await lockPlayers(client, [input.mareOwnerId, rows.stallion.owner_id]);
      const payer = players.get(input.mareOwnerId)!;
      const stallionOwner = players.get(rows.stallion.owner_id)!;
      await assertCrossOwnerAllowed(client, input.mareOwnerId, stallionOwner, input.stallionId);
      assertCanAddHorseToStable(
        await countStableOccupancy(client, input.mareOwnerId),
        getStableCapacity(payer.stable_level, this.config.stable),
      );

      const fee = Number(stud.fee);
      const before = { money: Number(payer.money), gems: Number(payer.gems) };
      const after = fee > 0 ? debit(before, fee, 'money') : before;
      if (fee > 0) {
        await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
          input.mareOwnerId,
          after.money,
          input.now,
        ]);
      }
      await client.query(
        `INSERT INTO breeding_offers (id, mare_id, stallion_id, mare_owner_id, stallion_owner_id, fee, foal_name,
                                      status, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)`,
        [
          input.offerId,
          input.mareId,
          input.stallionId,
          input.mareOwnerId,
          rows.stallion.owner_id,
          fee,
          input.foalName,
          input.now,
          offerExpiresAt(input.now, this.config.genetics),
        ],
      );
      if (fee > 0) {
        await writeLedgerEntries(client, [
          {
            playerId: input.mareOwnerId,
            type: 'breeding_offer_hold',
            amount: -fee,
            currency: 'money',
            referenceType: 'breeding_offer',
            referenceId: input.offerId,
            balanceBefore: before.money,
            balanceAfter: after.money,
            idempotencyKey: input.idempotencyKey,
          },
        ]);
      }
      const offer = await this.readOffer(client, input.offerId);
      const payload: NotificationPayloadByType['breeding_offer_received'] = {
        offerId: offer.id,
        stallionId: offer.stallion_id,
        stallionName: offer.stallion_name,
        mareName: offer.mare_name,
        fromName: offer.mare_owner_name,
        fee,
      };
      await this.notify(client, offer.stallion_owner_id, 'breeding_offer_received', payload);
      return toOfferView(offer, input.mareOwnerId);
    });
  }

  async findOfferMareOwner(offerId: string): Promise<string | null> {
    const result = await this.pool.query<{ mare_owner_id: string }>(
      'SELECT mare_owner_id FROM breeding_offers WHERE id = $1',
      [offerId],
    );
    return result.rows[0]?.mare_owner_id ?? null;
  }

  async acceptOffer(input: AcceptOfferInput): Promise<BreedingOfferView> {
    return withTransaction(this.pool, async (client) => {
      const peek = await this.peekOffer(client, input.offerId);
      if (!peek || peek.stallion_owner_id !== input.actorId) throw new BreedingOfferNotFoundError(input.offerId);
      await lockBreedingHorses(client, peek.mare_id, peek.stallion_id);
      const offer = await this.lockOffer(client, input.offerId);
      if (offer.status !== 'pending') throw new BreedingOfferNotPendingError(offer.status);
      if (offer.expires_at.getTime() <= input.now.getTime()) throw new BreedingOfferExpiredError();

      const fee = Number(offer.fee);
      const result = await conceiveInTransaction(
        client,
        {
          mareId: offer.mare_id,
          stallionId: offer.stallion_id,
          mareOwnerId: offer.mare_owner_id,
          stallionOwnerId: offer.stallion_owner_id,
          // İlan sonrası aygır el değiştirdiyse anlaşma geçersizdir.
          onStallionOwnerMismatch: () => new StudListingNotFoundError(offer.stallion_id),
          foalName: offer.foal_name,
          fee,
          offerId: offer.id,
          now: input.now,
          random: input.random,
          birthHealthRiskMultiplier: input.birthHealthRiskMultiplier,
        },
        this.configs,
      );

      const refund = result.conceived ? 0 : failedConceptionRefund(fee, this.config.genetics);
      const retained = fee - refund;
      const ownerShare = retained > 0 ? studFeeOwnerShare(retained, this.config.genetics) : 0;
      const entries: EconomyLedgerEntryInput[] = [];
      if (refund > 0) {
        entries.push(await this.creditPlayer(client, result.mareOwner, refund, 'breeding_offer_refund', offer.id, input.now));
      }
      if (ownerShare > 0) {
        entries.push(
          await this.creditPlayer(client, result.stallionOwner, ownerShare, 'breeding_stud_fee_credit', offer.id, input.now),
        );
      }
      await writeLedgerEntries(client, entries);
      await client.query(
        `UPDATE breeding_offers SET status = 'accepted', outcome = $2, refunded_amount = $3, pregnancy_id = $4,
                                    responded_at = $5
         WHERE id = $1`,
        [offer.id, result.conceived ? 'conceived' : 'not_conceived', refund, result.pregnancyId, input.now],
      );

      if (result.conceived) {
        const stud: NotificationPayloadByType['stud_service'] = {
          pairId: result.pregnancyId!,
          stallionId: offer.stallion_id,
          stallionName: offer.stallion_name,
          foalId: result.foalId!,
          amount: ownerShare,
        };
        await this.notify(client, offer.stallion_owner_id, 'stud_service', stud);
      }
      const answered: NotificationPayloadByType['breeding_offer_answered'] = {
        offerId: offer.id,
        stallionName: offer.stallion_name,
        mareName: offer.mare_name,
        status: 'accepted',
        outcome: result.conceived ? 'conceived' : 'not_conceived',
        refundedAmount: refund,
      };
      await this.notify(client, offer.mare_owner_id, 'breeding_offer_answered', answered);
      return toOfferView(await this.readOffer(client, offer.id), input.actorId);
    });
  }

  async rejectOffer(input: { offerId: string; actorId: string; now: Date }): Promise<BreedingOfferView> {
    return this.closeByParticipant(input, 'stallion', 'rejected');
  }

  async cancelOffer(input: { offerId: string; actorId: string; now: Date }): Promise<BreedingOfferView> {
    return this.closeByParticipant(input, 'mare', 'cancelled');
  }

  async listOffers(playerId: string, limit: number): Promise<BreedingOfferView[]> {
    const result = await this.pool.query<OfferRow>(
      `${OFFER_SELECT}
       WHERE o.mare_owner_id = $1 OR o.stallion_owner_id = $1
       ORDER BY (o.status = 'pending') DESC, o.created_at DESC, o.id
       LIMIT $2`,
      [playerId, limit],
    );
    return result.rows.map((row) => toOfferView(row, playerId));
  }

  async expireDueOffers(now: Date, batchSize: number): Promise<number> {
    const due = await this.pool.query<{ id: string }>(
      `SELECT id FROM breeding_offers WHERE status = 'pending' AND expires_at <= $1
       ORDER BY expires_at, id LIMIT $2`,
      [now, batchSize],
    );
    let expired = 0;
    for (const { id } of due.rows) {
      try {
        const closed = await withTransaction(this.pool, async (client) => {
          const offer = await this.lockOffer(client, id);
          if (offer.status !== 'pending' || offer.expires_at.getTime() > now.getTime()) return false;
          const players = await lockPlayers(client, [offer.mare_owner_id]);
          await this.closeWithFullRefund(client, offer, players, 'expired', now, true);
          return true;
        });
        if (closed) expired += 1;
      } catch (error: unknown) {
        this.logger.error(`Teklif süresi kapatılamadı (${id}): ${error instanceof Error ? error.name : 'bilinmeyen'}`);
      }
    }
    return expired;
  }

  // -------------------------------------------------------------------------
  // Yardımcılar
  // -------------------------------------------------------------------------

  private async closeByParticipant(
    input: { offerId: string; actorId: string; now: Date },
    side: 'mare' | 'stallion',
    status: 'rejected' | 'cancelled',
  ): Promise<BreedingOfferView> {
    return withTransaction(this.pool, async (client) => {
      const offer = await this.lockOffer(client, input.offerId).catch(() => null);
      const participant = offer && (side === 'mare' ? offer.mare_owner_id : offer.stallion_owner_id);
      if (!offer || participant !== input.actorId) throw new BreedingOfferNotFoundError(input.offerId);
      if (offer.status !== 'pending') throw new BreedingOfferNotPendingError(offer.status);
      const players = await lockPlayers(client, [offer.mare_owner_id]);
      // Kısrak sahibi kendi teklifini iptal edince kendine bildirim gitmez.
      await this.closeWithFullRefund(client, offer, players, status, input.now, side === 'stallion');
      return toOfferView(await this.readOffer(client, offer.id), input.actorId);
    });
  }

  /** Bekleyen teklifi kapatır ve emanetin TAMAMINI kısrak sahibine iade eder. */
  private async closeWithFullRefund(
    client: PoolClient,
    offer: OfferRow,
    players: Map<string, LockedPlayerRow>,
    status: 'rejected' | 'cancelled' | 'expired',
    now: Date,
    notifyMareOwner: boolean,
  ): Promise<void> {
    const fee = Number(offer.fee);
    if (fee > 0) {
      const payer = players.get(offer.mare_owner_id)!;
      const entry = await this.creditPlayer(client, payer, fee, 'breeding_offer_refund', offer.id, now);
      // Aynı turda aynı oyuncuya ikinci iade doğru bakiyeden başlasın.
      payer.money = String(entry.balanceAfter);
      await writeLedgerEntries(client, [entry]);
    }
    await client.query(
      'UPDATE breeding_offers SET status = $2, refunded_amount = $3, responded_at = $4 WHERE id = $1',
      [offer.id, status, fee, now],
    );
    if (notifyMareOwner) {
      const payload: NotificationPayloadByType['breeding_offer_answered'] = {
        offerId: offer.id,
        stallionName: offer.stallion_name,
        mareName: offer.mare_name,
        status,
        outcome: null,
        refundedAmount: fee,
      };
      await this.notify(client, offer.mare_owner_id, 'breeding_offer_answered', payload);
    }
  }

  /** Bakiyeye ekler (satır KİLİTLİ olmalı) ve yazılacak defter satırını döner. */
  private async creditPlayer(
    client: PoolClient,
    player: LockedPlayerRow,
    amount: number,
    type: 'breeding_offer_refund' | 'breeding_stud_fee_credit',
    offerId: string,
    now: Date,
  ): Promise<EconomyLedgerEntryInput> {
    const before = { money: Number(player.money), gems: Number(player.gems) };
    const after = credit(before, amount, 'money');
    await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [player.id, after.money, now]);
    return {
      playerId: player.id,
      type,
      amount,
      currency: 'money',
      referenceType: 'breeding_offer',
      referenceId: offerId,
      balanceBefore: before.money,
      balanceAfter: after.money,
      idempotencyKey: null,
    };
  }

  private async peekOffer(client: PoolClient, offerId: string): Promise<OfferRow | null> {
    const result = await client.query<OfferRow>(`${OFFER_SELECT} WHERE o.id = $1`, [offerId]);
    return result.rows[0] ?? null;
  }

  private async lockOffer(client: PoolClient, offerId: string): Promise<OfferRow> {
    const result = await client.query<OfferRow>(`${OFFER_SELECT} WHERE o.id = $1 FOR UPDATE OF o`, [offerId]);
    if (!result.rows[0]) throw new BreedingOfferNotFoundError(offerId);
    return result.rows[0];
  }

  private async readOffer(client: PoolClient, offerId: string): Promise<OfferRow> {
    const row = await this.peekOffer(client, offerId);
    if (!row) throw new BreedingOfferNotFoundError(offerId);
    return row;
  }

  private async lockStud(client: PoolClient, stallionId: string): Promise<StudRow> {
    await client.query('SELECT id FROM horses WHERE id = $1 FOR UPDATE', [stallionId]);
    const result = await client.query<StudRow>(`${MY_STUDS_SELECT} WHERE h.id = $1`, [stallionId]);
    if (!result.rows[0]) throw new HorseNotFoundError(stallionId);
    return result.rows[0];
  }

  private async notify<K extends keyof NotificationPayloadByType>(
    client: PoolClient,
    playerId: string,
    type: K,
    payload: NotificationPayloadByType[K],
  ): Promise<void> {
    await client.query('INSERT INTO notifications (player_id, type, payload) VALUES ($1, $2, $3::jsonb)', [
      playerId,
      type,
      JSON.stringify(payload),
    ]);
  }

  /** İlan verilebilirlik nedeni (ilan formunda gösterilir; `null` = uygun). */
  private studIneligibility(row: StudRow, now: Date): BreedingIneligibilityReason | 'LISTED_IN_MARKET' | null {
    if (row.status !== 'retired') return 'NOT_RETIRED';
    const ageMonths = computeHorseAgeMonths(
      { birthDate: row.birth_date, agingStartedAt: row.aging_started_at },
      now,
      this.config.horseGrowth,
    );
    if (!isWithinBreedingAge(ageMonths, this.config.genetics)) {
      return ageMonths < this.config.genetics.minBreedingAgeMonths ? 'TOO_YOUNG' : 'TOO_OLD';
    }
    if (Number(row.foal_count) >= lifetimeFoalLimitFor('stallion', this.config.genetics)) return 'FOAL_LIMIT_REACHED';
    if (row.is_listed) return 'LISTED_IN_MARKET';
    return null;
  }

  private toMyStud(row: StudRow, now: Date): MyStudView {
    const reason = this.studIneligibility(row, now);
    return {
      stallionId: row.id,
      name: row.name,
      breed: row.breed,
      fertility: row.fertility,
      ageMonths: computeHorseAgeMonths(
        { birthDate: row.birth_date, agingStartedAt: row.aging_started_at },
        now,
        this.config.horseGrowth,
      ),
      foalCount: Number(row.foal_count),
      foalLimit: lifetimeFoalLimitFor('stallion', this.config.genetics),
      feeBounds: studFeeBounds({ quality: Number(row.quality), potential: Number(row.potential) }, this.config.genetics),
      listing:
        row.listing_fee !== null && row.listing_status !== null
          ? { fee: Number(row.listing_fee), status: row.listing_status }
          : null,
      eligible: reason === null,
      ineligibleReason:
        reason === null
          ? null
          : reason === 'LISTED_IN_MARKET'
            ? 'At pazarda satışta; önce ilanı kaldır.'
            : new NotEligibleForBreedingError(reason).message,
      pendingOfferCount: Number(row.pending_offers),
    };
  }
}
