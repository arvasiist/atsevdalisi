import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  BreedsConfig,
  GeneticsConfig,
  HorseAppearanceConfig,
  HorseGrowthConfig,
  StableConfig,
} from '@at-sevdalisi/game-config';
import {
  createSeededRandom,
  type HorseAppearance,
  type HorseCoatColor,
  type HorseGender,
  type Pedigree,
} from '@at-sevdalisi/shared-types';
import {
  assertBreedingEligibility,
  breedHorses,
  pickFoalGender,
  type BreedingCandidate,
} from '../../domain/breeding/breeding';
import {
  computeConceptionChance,
  expectedBirthAt,
  failedAttemptRestEndsAt,
  inheritFertility,
  isConceived,
} from '../../domain/breeding/breeding-center';
import {
  BreedingHorseListedError,
  BreedingOfferAlreadyPendingError,
  MareNotOwnedError,
  NotEligibleForBreedingError,
} from '../../domain/breeding/errors';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { computeHorseAgeMonths, getLifeStage } from '../../domain/horse/age-curve';
import { inheritAppearance } from '../../domain/horse/appearance';
import { resolveFoalBreed } from '../../domain/horse/breeds';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PlayerBlockedError } from '../../domain/social/errors';
import { assertCanAddHorseToStable, getStableCapacity } from '../../domain/stable/stable';
import { countStableOccupancy } from '../stable/stable-occupancy';

/**
 * 16.10.2026 — DÖLLENME ÇEKİRDEĞİ (brief §4–§5). Kendi çifti
 * (`POST /players/:id/breeding`) ve kabul edilen teklif
 * (`POST /breeding/offers/:id/accept`) AYNI fonksiyondan geçer — ikinci bir
 * uygunluk kopyası yazılmaz. Çağıranın transaction'ında koşar.
 *
 * Kilit sırası (çiftleştirmenin 15.10.2026 sırasıyla aynı): atlar (id
 * sırası) → oyuncular (id sırası). Para hareketini ÇAĞIRAN yapar; burada
 * kilitlenen oyuncu satırları sonuçta döner.
 *
 * Tayın genetiği DÖLLENME ANINDA hesaplanır (ebeveynlerin o anki statları, yaş
 * evresi riski) ve `pregnancies.genetics`te yalnızca sunucuda saklanır; doğum
 * yalnızca bakımın riske etkisini ekler. Böylece doğum, ebeveynlerin sonraki
 * durumundan (yaşlanma, satış) bağımsız ve tekrar üretilebilir kalır.
 */

/** `horse_stats`tan kalıtılan sütunlar (çiftleştirme deposuyla AYNI liste). */
export const INHERITED_STAT_COLUMNS = [
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

export interface BreedingHorseRow {
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
  coat_color: string;
  fertility: number;
  is_listed: boolean;
}

export interface LockedPlayerRow {
  id: string;
  money: string;
  gems: string;
  stable_level: number;
  deleted_at: Date | null;
}

/** Sunucuda saklanan tay genetiği (istemciye DÖNMEZ). */
export interface StoredFoalGenetics {
  foalStats: Record<string, number>;
  quality: number;
  potential: number;
  weightKg: number;
  /** Döllenme anındaki taban doğum riski (0..1; üreme merkezi çarpanı dahil). */
  baseBirthRisk: number;
  inbreedingDetected: boolean;
  pedigree: Pedigree;
  gender: HorseGender;
  breed: string;
  fertility: number;
  appearance: HorseAppearance;
}

export interface ConceptionConfigs {
  genetics: GeneticsConfig;
  horseGrowth: HorseGrowthConfig;
  stable: StableConfig;
  breeds: BreedsConfig;
  horseAppearance: HorseAppearanceConfig;
}

export interface ConceptionParams {
  mareId: string;
  stallionId: string;
  /** Kısrağın sahibi olması GEREKEN oyuncu (tay onun ahırına doğar). */
  mareOwnerId: string;
  /** Aygırın sahibi olması GEREKEN oyuncu; değilse `onStallionOwnerMismatch` fırlar. */
  stallionOwnerId: string;
  onStallionOwnerMismatch: () => Error;
  foalName: string;
  /** Gebelik satırına yazılan ödenmiş ücret (kendi çiftinde 0). */
  fee: number;
  offerId: string | null;
  now: Date;
  /** [0,1) — döllenme zarı ve tay cinsiyeti (sunucuda üretilir; e2e sabitler). */
  random: () => number;
  birthHealthRiskMultiplier: number;
}

export interface ConceptionResult {
  attemptId: string;
  conceived: boolean;
  chance: number;
  pregnancyId: string | null;
  foalId: string | null;
  expectedBirthAt: Date | null;
  inbreedingDetected: boolean;
  /** Tutmadıysa kısrağın yeniden denenebileceği an. */
  mareRestEndsAt: Date | null;
  mare: BreedingHorseRow;
  stallion: BreedingHorseRow;
  mareOwner: LockedPlayerRow;
  stallionOwner: LockedPlayerRow;
}

/** İki atı kilitler (id sırası) ve pazardaki aktif ilanı işaretler. */
export async function lockBreedingHorses(
  client: PoolClient,
  mareId: string,
  stallionId: string,
): Promise<{ mare: BreedingHorseRow; stallion: BreedingHorseRow }> {
  const byId = new Map<string, BreedingHorseRow>();
  for (const horseId of [mareId, stallionId].sort()) {
    if (byId.has(horseId)) continue;
    const result = await client.query<BreedingHorseRow>(
      `SELECT h.id, h.owner_id, h.name, h.gender, h.breed, h.birth_date, h.aging_started_at, h.quality,
              h.potential, h.health, h.weight_kg, h.status, h.coat_color, h.fertility,
              EXISTS (SELECT 1 FROM market_listings ml WHERE ml.horse_id = h.id AND ml.status = 'active') AS is_listed
       FROM horses h WHERE h.id = $1 FOR UPDATE OF h`,
      [horseId],
    );
    if (result.rows[0]) byId.set(horseId, result.rows[0]);
  }
  const mare = byId.get(mareId);
  if (!mare) throw new HorseNotFoundError(mareId);
  const stallion = byId.get(stallionId);
  if (!stallion) throw new HorseNotFoundError(stallionId);
  return { mare, stallion };
}

/** Oyuncuları kilitler (id sırası). */
export async function lockPlayers(client: PoolClient, playerIds: readonly string[]): Promise<Map<string, LockedPlayerRow>> {
  const rows = new Map<string, LockedPlayerRow>();
  for (const playerId of [...new Set(playerIds)].sort()) {
    const result = await client.query<LockedPlayerRow>(
      'SELECT id, money, gems, stable_level, deleted_at FROM players WHERE id = $1 FOR UPDATE',
      [playerId],
    );
    if (!result.rows[0]) throw new PlayerNotFoundError(playerId);
    rows.set(playerId, result.rows[0]);
  }
  return rows;
}

export { countStableOccupancy };

async function readStats(client: PoolClient, horseId: string): Promise<Record<string, number>> {
  const result = await client.query<Record<string, string>>(
    `SELECT ${INHERITED_STAT_COLUMNS.join(', ')} FROM horse_stats WHERE horse_id = $1`,
    [horseId],
  );
  const row = result.rows[0];
  const stats: Record<string, number> = {};
  if (!row) return stats;
  for (const column of INHERITED_STAT_COLUMNS) {
    stats[column] = Number(row[column]);
  }
  return stats;
}

async function readPedigree(client: PoolClient, horseId: string): Promise<Pedigree | null> {
  const result = await client.query<{
    sire_id: string | null;
    dam_id: string | null;
    grand_sire_id: string | null;
    grand_dam_id: string | null;
    bloodline: string | null;
  }>('SELECT sire_id, dam_id, grand_sire_id, grand_dam_id, bloodline FROM pedigrees WHERE horse_id = $1', [horseId]);
  const row = result.rows[0];
  return row
    ? {
        horseId,
        sireId: row.sire_id,
        damId: row.dam_id,
        grandSireId: row.grand_sire_id,
        grandDamId: row.grand_dam_id,
        bloodline: row.bloodline,
      }
    : null;
}

interface MareHistory {
  /** Kısrak için yanıt bekleyen teklif (varsa). */
  pendingOfferId: string | null;
  lastFoaledAt: Date | null;
  lastFailedAttemptAt: Date | null;
  isGestating: boolean;
  mareFoals: number;
  stallionFoals: number;
}

/**
 * Tay sayıları DOĞMUŞ + TAŞINAN gebelikleri sayar: aynı aygırın eşzamanlı
 * gebelikleri ömür boyu sınırı aşamasın. Atlar kilitli olduğundan sayım
 * serileşir.
 */
async function readBreedingHistory(client: PoolClient, mareId: string, stallionId: string): Promise<MareHistory> {
  const result = await client.query<{
    pending_offer_id: string | null;
    last_foaled_at: Date | null;
    last_failed_at: Date | null;
    gestating: boolean;
    mare_foals: string;
    stallion_foals: string;
  }>(
    `SELECT
       (SELECT id FROM breeding_offers WHERE mare_id = $1 AND status = 'pending' LIMIT 1) AS pending_offer_id,
       (SELECT MAX(created_at) FROM breeding_pairs WHERE mare_id = $1 AND foal_id IS NOT NULL) AS last_foaled_at,
       (SELECT MAX(created_at) FROM breeding_attempts WHERE mare_id = $1 AND NOT succeeded) AS last_failed_at,
       EXISTS (SELECT 1 FROM pregnancies WHERE mare_id = $1 AND status = 'gestating') AS gestating,
       (SELECT COUNT(*) FROM breeding_pairs WHERE mare_id = $1 AND foal_id IS NOT NULL)
         + (SELECT COUNT(*) FROM pregnancies WHERE mare_id = $1 AND status = 'gestating') AS mare_foals,
       (SELECT COUNT(*) FROM breeding_pairs WHERE stallion_id = $2 AND foal_id IS NOT NULL)
         + (SELECT COUNT(*) FROM pregnancies WHERE stallion_id = $2 AND status = 'gestating') AS stallion_foals`,
    [mareId, stallionId],
  );
  const row = result.rows[0]!;
  return {
    pendingOfferId: row.pending_offer_id,
    lastFoaledAt: row.last_foaled_at,
    lastFailedAttemptAt: row.last_failed_at,
    isGestating: row.gestating,
    mareFoals: Number(row.mare_foals),
    stallionFoals: Number(row.stallion_foals),
  };
}

function toCandidate(
  row: BreedingHorseRow,
  stats: Record<string, number>,
  now: Date,
  growth: HorseGrowthConfig,
  foalCount: number,
): BreedingCandidate {
  return {
    id: row.id,
    gender: row.gender as BreedingCandidate['gender'],
    status: row.status as BreedingCandidate['status'],
    ageMonths: computeHorseAgeMonths({ birthDate: row.birth_date, agingStartedAt: row.aging_started_at }, now, growth),
    health: Number(row.health),
    quality: Number(row.quality),
    potential: Number(row.potential),
    stats,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    foalCount,
  };
}

export interface BreedingContext {
  mare: BreedingCandidate;
  stallion: BreedingCandidate;
  history: MareHistory;
  marePedigree: Pedigree | null;
  stallionPedigree: Pedigree | null;
}

/**
 * Uygunluk (KİLİTLİ satırlarla): cinsiyet, emeklilik, yaş, tay sınırı, doğum
 * sonrası bekleme, gebelik, tutmayan deneme sonrası dinlenme, pazardaki ilan.
 * Teklif oluştururken (para emanete alınmadan önce) ve kabulde AYNI kural.
 */
export async function assertConceptionAllowed(
  client: PoolClient,
  rows: { mare: BreedingHorseRow; stallion: BreedingHorseRow },
  now: Date,
  configs: Pick<ConceptionConfigs, 'genetics' | 'horseGrowth'>,
  /** Kabul edilen teklifin kendisi (kendi çiftinde ve yeni teklifte `null`). */
  currentOfferId: string | null,
): Promise<BreedingContext> {
  if (rows.mare.is_listed) throw new BreedingHorseListedError(rows.mare.id);
  if (rows.stallion.is_listed) throw new BreedingHorseListedError(rows.stallion.id);
  const history = await readBreedingHistory(client, rows.mare.id, rows.stallion.id);
  // Kısrağın bekleyen teklifi varken başka bir çiftleştirme (kendi aygırıyla
  // ya da ikinci teklif) yapılamaz: emanetteki ücret askıda kalırdı.
  if (history.pendingOfferId !== null && history.pendingOfferId !== currentOfferId) {
    throw new BreedingOfferAlreadyPendingError();
  }
  const [mareStats, stallionStats, marePedigree, stallionPedigree] = await Promise.all([
    readStats(client, rows.mare.id),
    readStats(client, rows.stallion.id),
    readPedigree(client, rows.mare.id),
    readPedigree(client, rows.stallion.id),
  ]);
  const mare = toCandidate(rows.mare, mareStats, now, configs.horseGrowth, history.mareFoals);
  const stallion = toCandidate(rows.stallion, stallionStats, now, configs.horseGrowth, history.stallionFoals);
  assertBreedingEligibility(mare, stallion, history.lastFoaledAt, now, configs.genetics, configs.horseGrowth);
  if (history.isGestating) throw new NotEligibleForBreedingError('MARE_PREGNANT');
  const restEndsAt = failedAttemptRestEndsAt(history.lastFailedAttemptAt, configs.genetics);
  if (restEndsAt !== null && now.getTime() < restEndsAt.getTime()) {
    throw new NotEligibleForBreedingError('MARE_RESTING');
  }
  return { mare, stallion, history, marePedigree, stallionPedigree };
}

/** Başka oyuncunun aygırı: silinmiş hesap 404, aradaki engel 403 (yön sızdırmaz). */
export async function assertCrossOwnerAllowed(
  client: PoolClient,
  mareOwnerId: string,
  stallionOwner: LockedPlayerRow,
  stallionId: string,
): Promise<void> {
  if (stallionOwner.id === mareOwnerId) return;
  if (stallionOwner.deleted_at !== null) throw new HorseNotFoundError(stallionId);
  const blocked = await client.query(
    `SELECT 1 FROM player_blocks
      WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
    [mareOwnerId, stallionOwner.id],
  );
  if (blocked.rows.length > 0) throw new PlayerBlockedError();
}

/** Döllenme denemesi: kilitler, denetler, zarı atar, tutarsa gebeliği yazar. */
export async function conceiveInTransaction(
  client: PoolClient,
  params: ConceptionParams,
  configs: ConceptionConfigs,
): Promise<ConceptionResult> {
  const rows = await lockBreedingHorses(client, params.mareId, params.stallionId);
  if (rows.mare.owner_id !== params.mareOwnerId) throw new MareNotOwnedError(params.mareId);
  if (rows.stallion.owner_id !== params.stallionOwnerId) throw params.onStallionOwnerMismatch();

  const context = await assertConceptionAllowed(client, rows, params.now, configs, params.offerId);

  const players = await lockPlayers(client, [params.mareOwnerId, params.stallionOwnerId]);
  const mareOwner = players.get(params.mareOwnerId)!;
  const stallionOwner = players.get(params.stallionOwnerId)!;
  await assertCrossOwnerAllowed(client, params.mareOwnerId, stallionOwner, params.stallionId);

  // Tay kısrak sahibinin ahırına doğar; yer DÖLLENMEDE ayrılır.
  assertCanAddHorseToStable(
    await countStableOccupancy(client, params.mareOwnerId),
    getStableCapacity(mareOwner.stable_level, configs.stable),
  );

  const chance = computeConceptionChance(
    {
      mareFertility: rows.mare.fertility,
      stallionFertility: rows.stallion.fertility,
      mareHealth: context.mare.health,
      mareLifeStage: getLifeStage(context.mare.ageMonths, configs.horseGrowth).name,
    },
    configs.genetics,
  );
  const conceived = isConceived(params.random(), chance);
  const attemptId = randomUUID();

  if (!conceived) {
    await client.query(
      `INSERT INTO breeding_attempts (id, mare_id, stallion_id, owner_id, offer_id, chance, succeeded, pregnancy_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, NULL, $7)`,
      [attemptId, params.mareId, params.stallionId, params.mareOwnerId, params.offerId, chance, params.now],
    );
    return {
      attemptId,
      conceived: false,
      chance,
      pregnancyId: null,
      foalId: null,
      expectedBirthAt: null,
      inbreedingDetected: false,
      mareRestEndsAt: failedAttemptRestEndsAt(params.now, configs.genetics),
      mare: rows.mare,
      stallion: rows.stallion,
      mareOwner,
      stallionOwner,
    };
  }

  const pregnancyId = randomUUID();
  const foalId = randomUUID();
  const genetics = breedHorses(
    {
      foalId,
      mare: context.mare,
      stallion: context.stallion,
      marePedigree: context.marePedigree,
      stallionPedigree: context.stallionPedigree,
      mareLastFoaledAt: context.history.lastFoaledAt,
      now: params.now,
      seed: pregnancyId,
      birthHealthRiskMultiplier: params.birthHealthRiskMultiplier,
    },
    configs.genetics,
    configs.horseGrowth,
  );
  const stored: StoredFoalGenetics = {
    foalStats: genetics.foalStats,
    quality: genetics.foalQuality,
    potential: genetics.foalPotential,
    weightKg: genetics.foalWeightKg,
    baseBirthRisk: genetics.birthHealthRisk,
    inbreedingDetected: genetics.inbreedingDetected,
    pedigree: genetics.foalPedigree,
    gender: pickFoalGender(params.random()),
    breed: resolveFoalBreed(configs.breeds, rows.stallion.breed, rows.mare.breed),
    fertility: inheritFertility(
      rows.mare.fertility,
      rows.stallion.fertility,
      createSeededRandom(`${pregnancyId}:fertility`),
      configs.genetics,
    ),
    appearance: inheritAppearance(
      foalId,
      rows.stallion.coat_color as HorseCoatColor,
      rows.mare.coat_color as HorseCoatColor,
      configs.horseAppearance,
    ),
  };
  const birthAt = expectedBirthAt(params.now, configs.genetics);
  await client.query(
    `INSERT INTO pregnancies (id, mare_id, stallion_id, owner_id, offer_id, foal_id, foal_name, genetics, fee,
                              conceived_at, expected_birth_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, 'gestating')`,
    [
      pregnancyId,
      params.mareId,
      params.stallionId,
      params.mareOwnerId,
      params.offerId,
      foalId,
      params.foalName,
      JSON.stringify(stored),
      params.fee,
      params.now,
      birthAt,
    ],
  );
  await client.query(
    `INSERT INTO breeding_attempts (id, mare_id, stallion_id, owner_id, offer_id, chance, succeeded, pregnancy_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)`,
    [attemptId, params.mareId, params.stallionId, params.mareOwnerId, params.offerId, chance, pregnancyId, params.now],
  );
  return {
    attemptId,
    conceived: true,
    chance,
    pregnancyId,
    foalId,
    expectedBirthAt: birthAt,
    inbreedingDetected: genetics.inbreedingDetected,
    mareRestEndsAt: null,
    mare: rows.mare,
    stallion: rows.stallion,
    mareOwner,
    stallionOwner,
  };
}
