import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { HorseGrowthConfig } from '@at-sevdalisi/game-config';
import type {
  BreedingResultView,
  Horse,
  HorseCoatColor,
  Pedigree,
  NotificationPayloadByType,
} from '@at-sevdalisi/shared-types';
import type {
  BreedingRepository,
  ExecuteBreedingInput,
  StudCandidate,
} from '../../application/ports/breeding.repository';
import type { EconomyLedgerEntryInput } from '../../application/ports/economy-ledger';
import {
  breedHorses,
  calculateStudFee,
  studFeeOwnerShare,
  type BreedingCandidate,
} from '../../domain/breeding/breeding';
import { BreedingHorseListedError, MareNotOwnedError } from '../../domain/breeding/errors';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { computeHorseAgeMonths } from '../../domain/horse/age-curve';
import { inheritAppearance } from '../../domain/horse/appearance';
import { deriveBreedInitialStats, findBreed, resolveFoalBreed } from '../../domain/horse/breeds';
import { credit, debit } from '../../domain/economy/wallet';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PlayerBlockedError } from '../../domain/social/errors';
import { assertCanAddHorseToStable, getStableCapacity } from '../../domain/stable/stable';
import { AppConfigService } from '../config/config.service';
import { PG_POOL, withTransaction } from '../database/database.module';
import { insertNewHorseTrackStats } from '../horse/horse-row';
import { writeLedgerEntries } from '../player/player-row';

/**
 * `horse_stats`'tan KALITILAN sütunlar. `stride_length`/`stride_frequency`
 * BİLİNÇLİ OLARAK DIŞARIDA: DEFAULT'suz ve `NULL` olabilen sütunlardır
 * (migration 0003), `calculateChildStat` ise 0-100 ölçekli bir sayı bekler.
 * Sıra sabittir ve hem okuma hem yazma sorgusunda AYNI dizi kullanılır.
 */
const INHERITED_STAT_COLUMNS = [
  'speed',
  'acceleration',
  'stamina',
  'strength',
  'agility',
  'balance',
  'start_speed',
  'early_speed',
  'mid_speed',
  'finish_speed',
  'sprint',
  'endurance',
  'cornering',
  'positioning',
  'temperament',
  'focus',
  'courage',
  'competitiveness',
  'stress_resistance',
  'obedience',
] as const;

/** `horses` satırının bu dosyanın ihtiyaç duyduğu sütunları (+ pazarda aktif ilan var mı). */
interface BreedableHorseRow {
  id: string;
  owner_id: string;
  name: string;
  gender: string;
  breed: string;
  birth_date: Date;
  aging_started_at: Date;
  quality: string;
  potential: string;
  health: string;
  weight_kg: string | null;
  status: string;
  is_listed: boolean;
  coat_color: string;
}

/** `pedigrees` satırı (yoksa `null` sütunlarla döner). */
interface PedigreeRow {
  sire_id: string | null;
  dam_id: string | null;
  grand_sire_id: string | null;
  grand_dam_id: string | null;
  bloodline: string | null;
}

interface PlayerRow {
  id: string;
  money: string;
  gems: string;
  stable_level: number;
  /** 15.10.2026 — silinmiş hesabın aygırı hizmete kapalıdır (damızlık listesiyle aynı kural). */
  deleted_at: Date | null;
}

function rowToCandidate(
  row: BreedableHorseRow,
  stats: Record<string, number>,
  now: Date,
  growth: HorseGrowthConfig,
  foalCount: number,
): BreedingCandidate {
  return {
    id: row.id,
    gender: row.gender as BreedingCandidate['gender'],
    status: row.status as BreedingCandidate['status'],
    // 15.10.2026 — OYUN yaşı (1 gerçek gün = `gameMonthsPerRealDay` ay).
    ageMonths: computeHorseAgeMonths({ birthDate: row.birth_date, agingStartedAt: row.aging_started_at }, now, growth),
    health: Number(row.health),
    quality: Number(row.quality),
    potential: Number(row.potential),
    stats,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    foalCount,
  };
}

/**
 * Çiftleştirme YAZMA yolu — soy ağacı veri zincirinin ÜÇÜNCÜ parçası.
 * **BU SINIF BİR PARA YOLUDUR** (bkz. `BreedingRepository` port doc
 * yorumu: kilit sırası, transaction sahipliği ve domain kararının neden
 * transaction İÇİNDE verildiği orada gerekçelendirilmiştir).
 *
 * `PostgresMarketPurchaseRepository`/`PostgresGiftRepository` ile AYNI
 * iki-satırlı şablon; farkı: burada kilitlenen ve YAZILAN tablo sayısı
 * daha fazladır (iki at + tay + soy + istatistik + sağlık + çift kaydı).
 */
@Injectable()
export class PostgresBreedingRepository implements BreedingRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async listStudCandidates(input: { viewerId: string; foalLimit: number; scanLimit: number }): Promise<StudCandidate[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      breed: string;
      owner_id: string;
      username: string | null;
      birth_date: Date;
      aging_started_at: Date;
      quality: string;
      potential: string;
      foal_count: string;
    }>(
      `SELECT h.id, h.name, h.breed, h.owner_id, p.username, h.birth_date, h.aging_started_at,
              h.quality, h.potential, fc.foal_count
       FROM horses h
       JOIN players p ON p.id = h.owner_id
       CROSS JOIN LATERAL (
         SELECT COUNT(*) AS foal_count FROM breeding_pairs bp
         WHERE bp.stallion_id = h.id AND bp.foal_id IS NOT NULL
       ) fc
       WHERE h.status = 'retired' AND h.gender = 'stallion'
         AND h.owner_id <> $1
         AND p.deleted_at IS NULL
         AND fc.foal_count < $2
         AND NOT EXISTS (
           SELECT 1 FROM market_listings ml WHERE ml.horse_id = h.id AND ml.status = 'active'
         )
         AND NOT EXISTS (
           SELECT 1 FROM player_blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = h.owner_id)
              OR (b.blocker_id = h.owner_id AND b.blocked_id = $1)
         )
       ORDER BY h.quality DESC, h.id
       LIMIT $3`,
      [input.viewerId, input.foalLimit, input.scanLimit],
    );
    return result.rows.map((row) => ({
      horseId: row.id,
      name: row.name,
      breed: row.breed,
      ownerId: row.owner_id,
      ownerUsername: row.username,
      birthDate: row.birth_date,
      agingStartedAt: row.aging_started_at,
      quality: Number(row.quality),
      potential: Number(row.potential),
      foalCount: Number(row.foal_count),
    }));
  }

  async breed(input: ExecuteBreedingInput): Promise<BreedingResultView> {
    // `noUncheckedIndexedAccess` altında dizi indekslemeden kaçınmak için
    // `updateTwoWithLock`/`executePurchase` ile AYNI doğrudan karşılaştırma.
    const firstHorseId = input.mareId <= input.stallionId ? input.mareId : input.stallionId;
    const secondHorseId = input.mareId <= input.stallionId ? input.stallionId : input.mareId;

    return withTransaction(this.pool, async (client) => {
      const horsesById = new Map<string, BreedableHorseRow>();
      for (const horseId of [firstHorseId, secondHorseId]) {
        const result = await client.query<BreedableHorseRow>(
          `SELECT h.id, h.owner_id, h.name, h.gender, h.breed, h.birth_date, h.aging_started_at, h.quality, h.potential,
                  h.health, h.weight_kg, h.status, h.coat_color,
                  EXISTS (
                    SELECT 1 FROM market_listings ml
                    WHERE ml.horse_id = h.id AND ml.status = 'active'
                  ) AS is_listed
           FROM horses h
           WHERE h.id = $1
           FOR UPDATE OF h`,
          [horseId],
        );
        const row = result.rows[0];
        if (row) {
          horsesById.set(horseId, row);
        }
      }

      const mareRow = horsesById.get(input.mareId);
      if (!mareRow) {
        throw new HorseNotFoundError(input.mareId);
      }
      const stallionRow = horsesById.get(input.stallionId);
      if (!stallionRow) {
        throw new HorseNotFoundError(input.stallionId);
      }

      // SAHİPLİK — satır KİLİTLİYKEN. Kısrak çağıranın olmalı (tay onun
      // ahırına doğar, ücreti o öder); aygır başkasının olabilir.
      if (mareRow.owner_id !== input.playerId) {
        throw new MareNotOwnedError(input.mareId);
      }
      // Pazarda aktif ilanı olan bir at çiftleştirilemez — aksi halde
      // satıştan hemen önce yapılan bir çiftleştirme, alıcıya sürpriz bir
      // tay ve soy kaydı devrederdi (`HorseListedInMarketError` ile AYNI
      // gerekçe, antrenman/yarış yollarında zaten uygulanıyor).
      if (mareRow.is_listed) {
        throw new BreedingHorseListedError(input.mareId);
      }
      if (stallionRow.is_listed) {
        throw new BreedingHorseListedError(input.stallionId);
      }

      const now = input.now;

      // KISRAK COOLDOWN'I — son DOĞUM (`foal_id IS NOT NULL`) tarihinden
      // ölçülür. Tay bu projede ANINDA doğduğu için gebelik süresi
      // modellenmez; `breedingCooldownMonths` iki çiftleştirme arası bekleme
      // süresidir (bkz. `assertBreedingEligibility`).
      const lastFoaledResult = await client.query<{ last_foaled_at: Date | null }>(
        `SELECT MAX(created_at) AS last_foaled_at FROM breeding_pairs
         WHERE mare_id = $1 AND foal_id IS NOT NULL`,
        [input.mareId],
      );
      const mareLastFoaledAt = lastFoaledResult.rows[0]?.last_foaled_at ?? null;

      // 15.10.2026 — S5: ömür boyu tay sayısı. Sayaç YOK, çift kayıtlarından
      // sayılır; iki at da yukarıda KİLİTLİ olduğundan aynı ata eşzamanlı iki
      // çiftleştirme serileşir ve sınır aşılamaz.
      const foalCounts = await client.query<{ mare_foals: string; stallion_foals: string }>(
        `SELECT COUNT(*) FILTER (WHERE mare_id = $1) AS mare_foals,
                COUNT(*) FILTER (WHERE stallion_id = $2) AS stallion_foals
         FROM breeding_pairs
         WHERE foal_id IS NOT NULL AND (mare_id = $1 OR stallion_id = $2)`,
        [input.mareId, input.stallionId],
      );
      const mareFoalCount = Number(foalCounts.rows[0]?.mare_foals ?? 0);
      const stallionFoalCount = Number(foalCounts.rows[0]?.stallion_foals ?? 0);

      // SOY — domain'in inbreeding kontrolü ve tayın pedigrisi için.
      const pedigreeByHorseId = new Map<string, Pedigree | null>();
      for (const horseId of [input.mareId, input.stallionId]) {
        const result = await client.query<PedigreeRow>(
          'SELECT sire_id, dam_id, grand_sire_id, grand_dam_id, bloodline FROM pedigrees WHERE horse_id = $1',
          [horseId],
        );
        const row = result.rows[0];
        pedigreeByHorseId.set(
          horseId,
          row
            ? {
                horseId,
                sireId: row.sire_id,
                damId: row.dam_id,
                grandSireId: row.grand_sire_id,
                grandDamId: row.grand_dam_id,
                bloodline: row.bloodline,
              }
            : null,
        );
      }

      // KALITILAN STATLAR — iki ebeveyn için AYNI anahtar kümesi
      // (`breedHorses` her ortak anahtar için ayrı bir çekiliş yapar).
      const mareStats = await this.readStats(client, input.mareId);
      const stallionStats = await this.readStats(client, input.stallionId);

      const mare = rowToCandidate(mareRow, mareStats, now, this.config.horseGrowth, mareFoalCount);
      const stallion = rowToCandidate(stallionRow, stallionStats, now, this.config.horseGrowth, stallionFoalCount);

      // OYUNCULAR — horses'tan SONRA (global sıra: horses → players).
      const stallionOwnerId = stallionRow.owner_id;
      const firstPlayerId = input.playerId <= stallionOwnerId ? input.playerId : stallionOwnerId;
      const secondPlayerId = input.playerId <= stallionOwnerId ? stallionOwnerId : input.playerId;

      const playersById = new Map<string, PlayerRow>();
      for (const playerId of [firstPlayerId, secondPlayerId]) {
        const result = await client.query<PlayerRow>(
          'SELECT id, money, gems, stable_level, deleted_at FROM players WHERE id = $1 FOR UPDATE',
          [playerId],
        );
        const row = result.rows[0];
        if (row) {
          playersById.set(playerId, row);
        }
      }

      const payerRow = playersById.get(input.playerId);
      if (!payerRow) {
        throw new PlayerNotFoundError(input.playerId);
      }
      const stallionOwnerRow = playersById.get(stallionOwnerId);
      if (!stallionOwnerRow) {
        throw new PlayerNotFoundError(stallionOwnerId);
      }

      // 15.10.2026 — damızlık pazarının (`GET /breeding/studs`) iki süzgeci
      // artık çiftleştirmenin KENDİSİNDE de geçerli: liste yalnızca
      // kolaylıktır, aygır kimliğini bilen istemci onu atlayabiliyordu.
      // Oyuncular KİLİTLİYKEN, para hareketinden ÖNCE. Silinmiş hesabın aygırı
      // yokmuş gibi davranır (404); engel YÖN SIZDIRMADAN 403 (`PLAYER_BLOCKED`).
      if (stallionOwnerId !== input.playerId) {
        if (stallionOwnerRow.deleted_at !== null) {
          throw new HorseNotFoundError(input.stallionId);
        }
        const blocked = await client.query(
          `SELECT 1 FROM player_blocks
            WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
            LIMIT 1`,
          [input.playerId, stallionOwnerId],
        );
        if (blocked.rows.length > 0) {
          throw new PlayerBlockedError();
        }
      }

      // AHIR KAPASİTESİ — tay KISRAK SAHİBİNİN ahırına doğar. Ödeyenin
      // `players` satırı yukarıda ZATEN kilitli olduğundan, aynı oyuncunun
      // eşzamanlı iki çiftleştirmesi bu kilit üzerinden SERİLEŞİR; sayım bu
      // yüzden güvenle tutarlıdır (`executePurchase`'ın "alıcının ahır
      // sayımı" notuyla AYNI gerekçe).
      const horseCountResult = await client.query<{ count: string }>(
        'SELECT COUNT(*) FROM horses WHERE owner_id = $1',
        [input.playerId],
      );
      const horseCount = Number(horseCountResult.rows[0]?.count ?? '0');
      assertCanAddHorseToStable(
        horseCount,
        getStableCapacity(payerRow.stable_level, this.config.stable),
      );

      // ÜCRET — yalnızca AYGIR BAŞKASININSA. Kendi atlarını çiftleştiren
      // oyuncu kendine ödeme yapmaz (bkz. `BreedingResultView.fee` doc
      // yorumu); bu durumda `breeding_pairs.fee` de 0 kalır.
      const sameOwner = stallionOwnerId === input.playerId;
      const fee = sameOwner ? 0 : calculateStudFee(stallion, this.config.genetics);
      // 15.10.2026 — S5 (B10): aygır sahibine ücretin `studFeeOwnerSharePercent`i
      // geçer, kalanı ekonomiden ÇIKAR (eskiden ücretin TAMAMI geçiyordu: yan
      // hesaplar arasında bedava değer aktarma kanalı).
      const ownerShare = fee > 0 ? studFeeOwnerShare(fee, this.config.genetics) : 0;

      const payerBalance = { money: Number(payerRow.money), gems: Number(payerRow.gems) };
      const stallionOwnerBalance = {
        money: Number(stallionOwnerRow.money),
        gems: Number(stallionOwnerRow.gems),
      };
      const moved = {
        from: fee > 0 ? debit(payerBalance, fee, 'money') : payerBalance,
        to: ownerShare > 0 ? credit(stallionOwnerBalance, ownerShare, 'money') : stallionOwnerBalance,
      };

      // DOMAIN — satırlar HÂLÂ kilitliyken, EN GÜNCEL değerlerle.
      // `NotEligibleForBreedingError` (yaş/cinsiyet/durum/cooldown) burada
      // fırlar ve `withTransaction` ROLLBACK yapar.
      const result = breedHorses(
        {
          foalId: input.foalId,
          mare,
          stallion,
          marePedigree: pedigreeByHorseId.get(input.mareId) ?? null,
          stallionPedigree: pedigreeByHorseId.get(input.stallionId) ?? null,
          mareLastFoaledAt,
          now,
          // SEED = pairId (bkz. `ExecuteBreedingInput` doc yorumu): kayıt
          // satırı elde olduğu sürece tayın statları yeniden üretilebilir.
          seed: input.pairId,
          birthHealthRiskMultiplier: input.birthHealthRiskMultiplier,
        },
        this.config.genetics,
        this.config.horseGrowth,
      );

      // ---- YAZMA ----
      if (fee > 0) {
        await client.query(
          'UPDATE players SET money = $2, gems = $3, updated_at = $4 WHERE id = $1',
          [input.playerId, moved.from.money, moved.from.gems, now],
        );
      }
      if (ownerShare > 0) {
        await client.query(
          'UPDATE players SET money = $2, gems = $3, updated_at = $4 WHERE id = $1',
          [stallionOwnerId, moved.to.money, moved.to.gems, now],
        );
      }

      // 07.10.2026 — tayın ırkı: aynı ırk → o ırk, config melez kuralı
      // (Safkan Arap × Safkan İngiliz → Anglo-Arap), aksi hâlde kısrağınki.
      const foalBreedKey = resolveFoalBreed(this.config.breeds, stallionRow.breed, mareRow.breed);
      const foal = this.buildFoal(input, result, foalBreedKey, now, {
        sireCoat: stallionRow.coat_color as HorseCoatColor,
        damCoat: mareRow.coat_color as HorseCoatColor,
      });
      await client.query(
        `INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, level, xp, quality, potential,
                             health, fitness, fatigue, energy, morale, weight_kg, status, sire_id, dam_id,
                             created_at, updated_at, coat_color, face_marking, leg_marking, aging_started_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
        [
          foal.id,
          foal.ownerId,
          foal.name,
          foal.gender,
          foal.breed,
          foal.birthDate.slice(0, 10),
          foal.level,
          foal.xp,
          foal.quality,
          foal.potential,
          foal.health,
          foal.fitness,
          foal.fatigue,
          foal.energy,
          foal.morale,
          foal.weightKg,
          foal.status,
          foal.sireId,
          foal.damId,
          new Date(foal.createdAt),
          new Date(foal.updatedAt),
          foal.appearance.coatColor,
          foal.appearance.faceMarking,
          foal.appearance.legMarking,
          new Date(foal.agingStartedAt),
        ],
      );

      const statColumns = INHERITED_STAT_COLUMNS.join(', ');
      const statPlaceholders = INHERITED_STAT_COLUMNS.map((_, index) => `$${index + 2}`).join(', ');
      await client.query(
        `INSERT INTO horse_stats (horse_id, ${statColumns}) VALUES ($1, ${statPlaceholders})`,
        [foal.id, ...INHERITED_STAT_COLUMNS.map((column) => result.foalStats[column] ?? 50)],
      );
      // DOĞUM SAĞLIK RİSKİ burada gerçek bir sütuna yazılır: domain'in
      // hesapladığı `birthHealthRisk` [0,1], `horse_health.injury_risk`
      // [0,100] ölçeğine çevrilir. Aksi halde hesaplanan ama hiçbir yere
      // yazılmayan bir değer olurdu.
      await client.query('INSERT INTO horse_health (horse_id, injury_risk) VALUES ($1, $2)', [
        foal.id,
        Math.round(result.birthHealthRisk * 100 * 100) / 100,
      ]);
      // Statlar genetikten gelir; zemin/mesafe uyumu ise tayın IRKINDAN
      // (07.10.2026 — eskiden varsayılan 50'de kalıyordu).
      const foalBreed = findBreed(this.config.breeds, foalBreedKey);
      await insertNewHorseTrackStats(
        client,
        foal.id,
        foalBreed ? deriveBreedInitialStats(foal.id, foalBreed, this.config.breeds.statJitter) : undefined,
      );

      await client.query(
        `INSERT INTO pedigrees (horse_id, sire_id, dam_id, grand_sire_id, grand_dam_id, bloodline)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          result.foalPedigree.horseId,
          result.foalPedigree.sireId,
          result.foalPedigree.damId,
          result.foalPedigree.grandSireId,
          result.foalPedigree.grandDamId,
          result.foalPedigree.bloodline,
        ],
      );

      const pairResult = await client.query<{ id: string }>(
        `INSERT INTO breeding_pairs (id, mare_id, stallion_id, prediction, fee, foal_id, created_at)
         VALUES ($1, $2, $3, NULL, $4, $5, $6)
         RETURNING id`,
        [input.pairId, input.mareId, input.stallionId, fee, input.foalId, now],
      );
      if (!pairResult.rows[0]) {
        // `INSERT ... RETURNING` her zaman bir satır döner — buraya düşmek
        // şema/bağlantı seviyesinde beklenmedik bir durumdur. Sessizce devam
        // etmek, defter satırlarını `reference_id` olmadan yazardı
        // (`postgres-grandstand.repository.ts` ile AYNI not).
        throw new Error(
          `Çiftleştirme kaydı yazılamadı (kısrak: ${input.mareId}, aygır: ${input.stallionId}).`,
        );
      }

      // DEFTER — AYNI transaction'da. Borç ücretin TAMAMI, alacak yalnızca
      // aygır sahibinin payı: aradaki fark ekonomiden çıkan kesintidir ve
      // karşılığında hesap satırı YOKTUR (platform payıyla aynı, CLAUDE.md).
      if (fee > 0) {
        const entries: EconomyLedgerEntryInput[] = [
          {
            playerId: input.playerId,
            type: 'breeding_stud_fee_debit',
            amount: -fee,
            currency: 'money',
            referenceType: 'breeding_pair',
            referenceId: input.pairId,
            balanceBefore: payerBalance.money,
            balanceAfter: moved.from.money,
            idempotencyKey: input.idempotencyKey,
          },
        ];
        if (ownerShare > 0) {
          entries.push({
            playerId: stallionOwnerId,
            type: 'breeding_stud_fee_credit',
            amount: ownerShare,
            currency: 'money',
            referenceType: 'breeding_pair',
            referenceId: input.pairId,
            balanceBefore: stallionOwnerBalance.money,
            balanceAfter: moved.to.money,
            idempotencyKey: input.idempotencyKey,
          });
        }
        await writeLedgerEntries(client, entries);
      }

      // 15.10.2026 — aygır sahibine haber: aygırı tay verdi ve payı hesabına
      // geçti. Defterle AYNI transaction (geri alınan çiftleştirmenin haberi
      // kalmasın). Kendi atlarını çiftleştirene gitmez.
      if (stallionOwnerId !== input.playerId) {
        const payload: NotificationPayloadByType['stud_service'] = {
          pairId: input.pairId,
          stallionId: input.stallionId,
          stallionName: stallionRow.name,
          foalId: foal.id,
          amount: ownerShare,
        };
        await client.query('INSERT INTO notifications (player_id, type, payload) VALUES ($1, $2, $3::jsonb)', [
          stallionOwnerId,
          'stud_service',
          JSON.stringify(payload),
        ]);
      }

      return {
        pairId: input.pairId,
        foalId: foal.id,
        foalName: foal.name,
        foalGender: input.foalGender,
        mareId: input.mareId,
        stallionId: input.stallionId,
        fee,
        inbreedingDetected: result.inbreedingDetected,
        birthHealthRisk: result.birthHealthRisk,
        payerBalance: fee > 0 ? moved.from : null,
      };
    });
  }

  /**
   * Tayın `horses` satırı. Başlangıç atıyla (`createStarterHorse`) AYNI
   * vital başlangıç değerleri kullanılır — tek fark, `birthDate`'in
   * "şimdi" olması (tay YENİ DOĞMUŞTUR, `getLifeStage` onu `foal` evresinde
   * görür ve bu yüzden henüz yarışamaz/antrenman yapamaz).
   */
  private buildFoal(
    input: ExecuteBreedingInput,
    result: {
      foalQuality: number;
      foalPotential: number;
      foalWeightKg: number;
      foalPedigree: Pedigree;
    },
    breed: string,
    now: Date,
    parentCoats: { sireCoat: HorseCoatColor; damCoat: HorseCoatColor },
  ): Horse {
    return {
      id: input.foalId,
      ownerId: input.playerId,
      name: input.foalName.trim(),
      gender: input.foalGender,
      // Irk KISRAKTAN devralınır (gerçek atçılıkta tay, kısrağın kayıtlı
      // ırkıyla tescil edilir) — soy ağacı kan hattı da `createFoalPedigree`
      // içinde baba hattı öncelikli olarak ayrıca taşınır.
      breed,
      birthDate: now.toISOString(),
      level: 1,
      xp: 0,
      quality: result.foalQuality,
      potential: result.foalPotential,
      health: 100,
      fitness: 50,
      fatigue: 0,
      energy: 100,
      morale: 80,
      weightKg: result.foalWeightKg,
      status: 'active',
      sireId: input.stallionId,
      damId: input.mareId,
      // 01.10.2026 — don rengi ebeveynlerden kalıtılır (domain/horse/appearance.ts).
      appearance: inheritAppearance(
        input.foalId,
        parentCoats.sireCoat,
        parentCoats.damCoat,
        this.config.horseAppearance,
      ),
      // Tay 0 aydan başlar ve doğduğu andan itibaren hızlı yaşlanır.
      agingStartedAt: now.toISOString(),
      retiredAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  /**
   * Bir atın kalıtılabilir statlarını `Record<snake_case sütun, sayı>`
   * olarak okur. Anahtarlar DB sütun adlarıdır (camelCase'e ÇEVRİLMEZ):
   * aynı anahtar kümesi `breedHorses`'a girdi, `horse_stats` INSERT'ine de
   * sütun listesi olur — tek bir dönüşüm noktası kalır.
   */
  private async readStats(client: PoolClient, horseId: string): Promise<Record<string, number>> {
    const columns = INHERITED_STAT_COLUMNS.join(', ');
    const result = await client.query<Record<string, string>>(
      `SELECT ${columns} FROM horse_stats WHERE horse_id = $1`,
      [horseId],
    );
    const row = result.rows[0];
    if (!row) {
      // `horse_stats` satırı olmayan bir at `save()`/bu repository dışında
      // oluşturulamaz (bkz. `PostgresHorseRepository.save` doc yorumu) —
      // yine de savunma amaçlı: satır yoksa nüfus varsayılanı (50) kullanılır.
      return {};
    }
    const stats: Record<string, number> = {};
    for (const column of INHERITED_STAT_COLUMNS) {
      stats[column] = Number(row[column]);
    }
    return stats;
  }
}
