import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { BreedingAttemptView, PregnancyView } from '@at-sevdalisi/shared-types';
import type {
  BreedingRepository,
  OwnBreedingInput,
  StudCandidate,
  StudSearchInput,
} from '../../application/ports/breeding.repository';
import { nextCheckupAvailableAt } from '../../domain/breeding/breeding-center';
import {
  BreedingRequiresAgreementError,
  PregnancyCheckupTooSoonError,
  PregnancyNotFoundError,
} from '../../domain/breeding/errors';
import { debit } from '../../domain/economy/wallet';
import { AppConfigService } from '../config/config.service';
import { PG_POOL, withTransaction } from '../database/database.module';
import { writeLedgerEntries } from '../player/player-row';
import { conceiveInTransaction, lockPlayers, type ConceptionConfigs } from './conception';
import {
  deliverPregnancyInTransaction,
  PREGNANCY_SELECT,
  readPregnancyCare,
  toPregnancyView,
  type PregnancyRow,
} from './pregnancy';

/**
 * Çiftleştirme (kendi çifti) + damızlık listesi + gebelik + doğum (brief
 * §4–§5). **PARA YOLU** — bkz. `BreedingRepository` port doc yorumu.
 *
 * 16.10.2026'dan beri tay ANINDA doğmaz: döllenme zarı tutarsa gebelik
 * başlar (`conception.ts`), doğumu zamanlayıcı yapar (`pregnancy.ts`).
 * Başkasının aygırı yalnızca kabul edilmiş teklifle (`PostgresBreedingOfferRepository`).
 */
@Injectable()
export class PostgresBreedingRepository implements BreedingRepository {
  private readonly logger = new Logger(PostgresBreedingRepository.name);

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

  async attemptOwnBreeding(input: OwnBreedingInput): Promise<BreedingAttemptView> {
    return withTransaction(this.pool, async (client) => {
      const result = await conceiveInTransaction(
        client,
        {
          mareId: input.mareId,
          stallionId: input.stallionId,
          mareOwnerId: input.playerId,
          stallionOwnerId: input.playerId,
          onStallionOwnerMismatch: () => new BreedingRequiresAgreementError(),
          foalName: input.foalName,
          fee: 0,
          offerId: null,
          now: input.now,
          random: input.random,
          birthHealthRiskMultiplier: input.birthHealthRiskMultiplier,
        },
        this.configs,
      );
      const pregnancy = result.pregnancyId ? await this.readPregnancyView(client, result.pregnancyId, input.now) : null;
      return {
        attemptId: result.attemptId,
        outcome: result.conceived ? 'conceived' : 'not_conceived',
        conceptionChance: result.chance,
        pregnancy,
        mareRestEndsAt: result.mareRestEndsAt?.toISOString() ?? null,
      };
    });
  }

  async listStudCandidates(input: StudSearchInput): Promise<StudCandidate[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      breed: string;
      owner_id: string;
      username: string | null;
      birth_date: Date;
      aging_started_at: Date;
      level: number;
      quality: string;
      potential: string;
      fertility: number;
      fee: string;
      foal_count: string;
      sire_name: string | null;
      dam_name: string | null;
    }>(
      // İlan geçerliyse: aygırın şimdiki sahibi ilanı veren, emekli, pazarda
      // değil; sahibi silinmemiş ve aramızda engel yok; tay sınırı (doğmuş +
      // taşınan) dolmamış. Yaş uygunluğu use-case'te (oyun yaşı) süzülür.
      `SELECT h.id, h.name, h.breed, h.owner_id, p.username, h.birth_date, h.aging_started_at, h.level,
              h.quality, h.potential, h.fertility, sl.fee, fc.foal_count,
              sire.name AS sire_name, dam.name AS dam_name
       FROM stud_listings sl
       JOIN horses h ON h.id = sl.stallion_id AND h.owner_id = sl.owner_id
       JOIN players p ON p.id = h.owner_id
       LEFT JOIN horses sire ON sire.id = h.sire_id
       LEFT JOIN horses dam ON dam.id = h.dam_id
       CROSS JOIN LATERAL (
         SELECT (SELECT COUNT(*) FROM breeding_pairs bp WHERE bp.stallion_id = h.id AND bp.foal_id IS NOT NULL)
              + (SELECT COUNT(*) FROM pregnancies pr WHERE pr.stallion_id = h.id AND pr.status = 'gestating') AS foal_count
       ) fc
       WHERE sl.status = 'active'
         AND h.status = 'retired' AND h.gender = 'stallion'
         AND h.owner_id <> $1
         AND p.deleted_at IS NULL
         AND fc.foal_count < $2
         AND ($4::text IS NULL OR h.breed = $4::text)
         AND ($5::bigint IS NULL OR sl.fee <= $5::bigint)
         AND NOT EXISTS (SELECT 1 FROM market_listings ml WHERE ml.horse_id = h.id AND ml.status = 'active')
         AND NOT EXISTS (
           SELECT 1 FROM player_blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = h.owner_id)
              OR (b.blocker_id = h.owner_id AND b.blocked_id = $1)
         )
       ORDER BY h.quality DESC, sl.fee ASC, h.id
       LIMIT $3`,
      [input.viewerId, input.foalLimit, input.scanLimit, input.breed, input.maxFee],
    );
    return result.rows.map((row) => ({
      horseId: row.id,
      name: row.name,
      breed: row.breed,
      ownerId: row.owner_id,
      ownerUsername: row.username,
      birthDate: row.birth_date,
      agingStartedAt: row.aging_started_at,
      level: row.level,
      quality: Number(row.quality),
      potential: Number(row.potential),
      fertility: row.fertility,
      fee: Number(row.fee),
      foalCount: Number(row.foal_count),
      sireName: row.sire_name,
      damName: row.dam_name,
    }));
  }

  async listPregnancies(ownerId: string, limit: number, now: Date): Promise<PregnancyView[]> {
    // Taşınanlar önce (doğuma en yakın), sonra son doğanlar.
    const result = await this.pool.query<PregnancyRow>(
      `${PREGNANCY_SELECT}
       WHERE pr.owner_id = $1
       ORDER BY (pr.status = 'gestating') DESC, pr.expected_birth_at ASC, pr.born_at DESC NULLS LAST
       LIMIT $2`,
      [ownerId, limit],
    );
    const care = await readPregnancyCare(this.pool, result.rows, now);
    return result.rows.map((row) => toPregnancyView(row, care.get(row.id)!, now, this.config.genetics));
  }

  async performCheckup(input: {
    pregnancyId: string;
    actorId: string;
    now: Date;
    idempotencyKey: string | null;
  }): Promise<PregnancyView> {
    const rules = this.config.genetics.pregnancyCare;
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query<PregnancyRow>(`${PREGNANCY_SELECT} WHERE pr.id = $1 FOR UPDATE OF pr`, [
        input.pregnancyId,
      ]);
      const row = locked.rows[0];
      // Başkasının gebeliği "yok" (IDOR kapısı); doğmuş gebelikte kontrol yok.
      if (!row || row.owner_id !== input.actorId || row.status !== 'gestating') {
        throw new PregnancyNotFoundError(input.pregnancyId);
      }
      const last = await client.query<{ last: Date | null }>(
        'SELECT MAX(created_at) AS last FROM pregnancy_checkups WHERE pregnancy_id = $1',
        [row.id],
      );
      const availableAt = nextCheckupAvailableAt(last.rows[0]?.last ?? null, input.now, this.config.genetics);
      if (availableAt !== null) {
        throw new PregnancyCheckupTooSoonError(availableAt);
      }
      const player = (await lockPlayers(client, [input.actorId])).get(input.actorId)!;
      const before = { money: Number(player.money), gems: Number(player.gems) };
      const cost = rules.checkupCost;
      const after = cost > 0 ? debit(before, cost, 'money') : before;
      if (cost > 0) {
        await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
          input.actorId,
          after.money,
          input.now,
        ]);
      }
      const checkup = await client.query<{ id: string }>(
        'INSERT INTO pregnancy_checkups (pregnancy_id, performed_by, cost, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [row.id, input.actorId, cost, input.now],
      );
      if (cost > 0) {
        await writeLedgerEntries(client, [
          {
            playerId: input.actorId,
            type: 'pregnancy_vet_check',
            amount: -cost,
            currency: 'money',
            referenceType: 'pregnancy',
            referenceId: row.id,
            balanceBefore: before.money,
            balanceAfter: after.money,
            idempotencyKey: input.idempotencyKey,
          },
        ]);
      }
      if (!checkup.rows[0]) {
        throw new Error(`Gebelik kontrolü yazılamadı (${row.id}).`);
      }
      return this.readPregnancyView(client, row.id, input.now);
    });
  }

  async deliverDueBirths(now: Date, batchSize: number): Promise<number> {
    const due = await this.pool.query<{ id: string }>(
      `SELECT id FROM pregnancies WHERE status = 'gestating' AND expected_birth_at <= $1
       ORDER BY expected_birth_at, id LIMIT $2`,
      [now, batchSize],
    );
    let delivered = 0;
    for (const { id } of due.rows) {
      try {
        const result = await withTransaction(this.pool, (client) =>
          deliverPregnancyInTransaction(client, id, now, { genetics: this.config.genetics, breeds: this.config.breeds }),
        );
        if (result) delivered += 1;
      } catch (error: unknown) {
        // Bir doğumun hatası diğerlerini durdurmaz; gebelik `gestating` kalır
        // ve bir sonraki turda yeniden denenir (yarım tay yazılmaz: tek tx).
        this.logger.error(`Doğum yazılamadı (gebelik ${id}): ${error instanceof Error ? error.name : 'bilinmeyen'}`);
      }
    }
    return delivered;
  }

  private async readPregnancyView(client: PoolClient, pregnancyId: string, now: Date): Promise<PregnancyView> {
    const result = await client.query<PregnancyRow>(`${PREGNANCY_SELECT} WHERE pr.id = $1`, [pregnancyId]);
    const row = result.rows[0];
    if (!row) throw new PregnancyNotFoundError(pregnancyId);
    const care = await readPregnancyCare(client, [row], now);
    return toPregnancyView(row, care.get(row.id)!, now, this.config.genetics);
  }
}
