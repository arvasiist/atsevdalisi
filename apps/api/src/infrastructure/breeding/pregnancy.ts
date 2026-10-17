import type { Pool, PoolClient } from 'pg';
import type { BreedsConfig, GeneticsConfig } from '@at-sevdalisi/game-config';
import type { NotificationPayloadByType, PregnancyView } from '@at-sevdalisi/shared-types';
import {
  computeBirthOutcome,
  computePregnancyCare,
  gestationDurationMs,
  nextCheckupAvailableAt,
  pregnancyRiskLevel,
  pregnancyRiskMultiplier,
} from '../../domain/breeding/breeding-center';
import { deriveBreedInitialStats, findBreed } from '../../domain/horse/breeds';
import { insertNewHorseTrackStats } from '../horse/horse-row';
import { INHERITED_STAT_COLUMNS, type StoredFoalGenetics } from './conception';

/**
 * 16.10.2026 — gebelik görünümü + DOĞUM (brief §5). Süre sunucu saatiyle
 * işler (`expected_birth_at`, DB'de); istemci saati hiçbir yerde okunmaz.
 * Doğum tek transaction'dır ve `status = 'gestating'` satırı `FOR UPDATE`
 * altında `born`a geçer — iki zamanlayıcı turu (ya da iki örnek) aynı tayı
 * iki kez doğuramaz; `foal_id` TEKİLdir.
 */

export interface PregnancyRow {
  id: string;
  mare_id: string;
  mare_name: string;
  stallion_id: string;
  stallion_name: string;
  owner_id: string;
  foal_id: string;
  foal_name: string;
  genetics: StoredFoalGenetics;
  fee: string;
  conceived_at: Date;
  expected_birth_at: Date;
  status: 'gestating' | 'born';
  born_at: Date | null;
}

export const PREGNANCY_SELECT = `
  SELECT pr.id, pr.mare_id, m.name AS mare_name, pr.stallion_id, s.name AS stallion_name, pr.owner_id,
         pr.foal_id, pr.foal_name, pr.genetics, pr.fee, pr.conceived_at, pr.expected_birth_at, pr.status, pr.born_at
  FROM pregnancies pr
  JOIN horses m ON m.id = pr.mare_id
  JOIN horses s ON s.id = pr.stallion_id`;

export interface PregnancyCareInputs {
  checkups: number;
  lastCheckupAt: Date | null;
  fedDays: number;
}

/**
 * Bakım girdileri SAYAÇ değildir: kontrol satırları + kısrağın gebelik
 * içindeki besleme günlüğü (`horse_feed_log`, ayrı gün sayısı).
 */
export async function readPregnancyCare(
  executor: Pool | PoolClient,
  rows: ReadonlyArray<Pick<PregnancyRow, 'id' | 'mare_id' | 'conceived_at'>>,
  until: Date,
): Promise<Map<string, PregnancyCareInputs>> {
  const result = new Map<string, PregnancyCareInputs>();
  for (const row of rows) {
    const care = await executor.query<{ checkups: string; last_checkup_at: Date | null; fed_days: string }>(
      `SELECT
         (SELECT COUNT(*) FROM pregnancy_checkups WHERE pregnancy_id = $1) AS checkups,
         (SELECT MAX(created_at) FROM pregnancy_checkups WHERE pregnancy_id = $1) AS last_checkup_at,
         (SELECT COUNT(DISTINCT date_trunc('day', fed_at)) FROM horse_feed_log
           WHERE horse_id = $2 AND fed_at >= $3 AND fed_at <= $4) AS fed_days`,
      [row.id, row.mare_id, row.conceived_at, until],
    );
    const value = care.rows[0]!;
    result.set(row.id, {
      checkups: Number(value.checkups),
      lastCheckupAt: value.last_checkup_at,
      fedDays: Number(value.fed_days),
    });
  }
  return result;
}

export function toPregnancyView(
  row: PregnancyRow,
  care: PregnancyCareInputs,
  now: Date,
  config: GeneticsConfig,
): PregnancyView {
  // Bakım doğum anına kadar değerlendirilir (geç tur bakımı cezalandırmasın).
  const evaluatedAt =
    row.status === 'born' && row.born_at !== null
      ? row.born_at
      : new Date(Math.min(now.getTime(), row.expected_birth_at.getTime()));
  const score = computePregnancyCare(
    { conceivedAt: row.conceived_at, at: evaluatedAt, checkupCount: care.checkups, fedDays: care.fedDays },
    config,
  );
  const projected = computeBirthOutcome(row.genetics.baseBirthRisk, pregnancyRiskMultiplier(score, config), config);
  const elapsed = evaluatedAt.getTime() - row.conceived_at.getTime();
  const next = row.status === 'gestating' ? nextCheckupAvailableAt(care.lastCheckupAt, now, config) : null;
  return {
    pregnancyId: row.id,
    mareId: row.mare_id,
    mareName: row.mare_name,
    stallionId: row.stallion_id,
    stallionName: row.stallion_name,
    foalName: row.foal_name,
    fee: Number(row.fee),
    inbreedingDetected: row.genetics.inbreedingDetected,
    status: row.status,
    conceivedAt: row.conceived_at.toISOString(),
    expectedBirthAt: row.expected_birth_at.toISOString(),
    bornAt: row.born_at?.toISOString() ?? null,
    foalId: row.status === 'born' ? row.foal_id : null,
    progress: Math.min(1, Math.max(0, elapsed / gestationDurationMs(config))),
    care: {
      checkups: care.checkups,
      expectedCheckups: score.expectedCheckups,
      careScore: Math.round(score.care * 100) / 100,
      nutritionScore: Math.round(score.nutrition * 100) / 100,
      lastCheckupAt: care.lastCheckupAt?.toISOString() ?? null,
      nextCheckupAt: next?.toISOString() ?? null,
      checkupCost: config.pregnancyCare.checkupCost,
    },
    riskLevel: pregnancyRiskLevel(projected.birthRisk, config),
  };
}

export interface DeliveredFoal {
  pregnancyId: string;
  foalId: string;
  ownerId: string;
}

/**
 * Doğum: gebelik `FOR UPDATE`, hâlâ `gestating` ve vakti geldiyse tay yazılır
 * (at + stat + sağlık + zemin/mesafe + soy + çift kaydı), gebelik `born` olur
 * ve sahibine `foal_born` bildirimi AYNI transaction'da gider. Vakti gelmemiş
 * ya da zaten doğmuşsa `null` (hiçbir şey yazılmaz).
 */
export async function deliverPregnancyInTransaction(
  client: PoolClient,
  pregnancyId: string,
  now: Date,
  configs: { genetics: GeneticsConfig; breeds: BreedsConfig },
): Promise<DeliveredFoal | null> {
  const locked = await client.query<PregnancyRow>(`${PREGNANCY_SELECT} WHERE pr.id = $1 FOR UPDATE OF pr`, [pregnancyId]);
  const row = locked.rows[0];
  if (!row || row.status !== 'gestating' || row.expected_birth_at.getTime() > now.getTime()) {
    return null;
  }
  const care = (await readPregnancyCare(client, [row], row.expected_birth_at)).get(row.id)!;
  const score = computePregnancyCare(
    { conceivedAt: row.conceived_at, at: row.expected_birth_at, checkupCount: care.checkups, fedDays: care.fedDays },
    configs.genetics,
  );
  const outcome = computeBirthOutcome(
    row.genetics.baseBirthRisk,
    pregnancyRiskMultiplier(score, configs.genetics),
    configs.genetics,
  );
  const g = row.genetics;

  await client.query(
    `INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, level, xp, quality, potential,
                         health, fitness, fatigue, energy, morale, weight_kg, status, sire_id, dam_id,
                         created_at, updated_at, coat_color, face_marking, leg_marking, aging_started_at, fertility)
     VALUES ($1, $2, $3, $4, $5, $6, 1, 0, $7, $8, $9, 50, 0, 100, 80, $10, 'active', $11, $12,
             $13, $13, $14, $15, $16, $13, $17)`,
    [
      row.foal_id,
      row.owner_id,
      row.foal_name,
      g.gender,
      g.breed,
      now.toISOString().slice(0, 10),
      g.quality,
      g.potential,
      outcome.foalHealth,
      g.weightKg,
      row.stallion_id,
      row.mare_id,
      now,
      g.appearance.coatColor,
      g.appearance.faceMarking,
      g.appearance.legMarking,
      g.fertility,
    ],
  );
  const statPlaceholders = INHERITED_STAT_COLUMNS.map((_, index) => `$${index + 2}`).join(', ');
  await client.query(
    `INSERT INTO horse_stats (horse_id, ${INHERITED_STAT_COLUMNS.join(', ')}) VALUES ($1, ${statPlaceholders})`,
    [row.foal_id, ...INHERITED_STAT_COLUMNS.map((column) => g.foalStats[column] ?? 50)],
  );
  // Doğum riski gerçek bir sütuna iner (0..1 → 0..100).
  await client.query('INSERT INTO horse_health (horse_id, injury_risk) VALUES ($1, $2)', [
    row.foal_id,
    Math.round(outcome.birthRisk * 100 * 100) / 100,
  ]);
  const breed = findBreed(configs.breeds, g.breed);
  await insertNewHorseTrackStats(
    client,
    row.foal_id,
    breed ? deriveBreedInitialStats(row.foal_id, breed, configs.breeds.statJitter) : undefined,
  );
  await client.query(
    `INSERT INTO pedigrees (horse_id, sire_id, dam_id, grand_sire_id, grand_dam_id, bloodline)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.foal_id, g.pedigree.sireId, g.pedigree.damId, g.pedigree.grandSireId, g.pedigree.grandDamId, g.pedigree.bloodline],
  );
  // Çift kaydı DOĞUM anında: tay sayısı, doğum sonrası bekleme ve kariyer
  // özetindeki tay sayısı bu tablodan okunur (kimlik = gebelik).
  await client.query(
    `INSERT INTO breeding_pairs (id, mare_id, stallion_id, prediction, fee, foal_id, created_at)
     VALUES ($1, $2, $3, NULL, $4, $5, $6)`,
    [row.id, row.mare_id, row.stallion_id, Number(row.fee), row.foal_id, now],
  );
  await client.query("UPDATE pregnancies SET status = 'born', born_at = $2 WHERE id = $1", [row.id, now]);
  const payload: NotificationPayloadByType['foal_born'] = {
    pregnancyId: row.id,
    foalId: row.foal_id,
    foalName: row.foal_name,
    mareName: row.mare_name,
  };
  await client.query('INSERT INTO notifications (player_id, type, payload) VALUES ($1, $2, $3::jsonb)', [
    row.owner_id,
    'foal_born',
    JSON.stringify(payload),
  ]);
  return { pregnancyId: row.id, foalId: row.foal_id, ownerId: row.owner_id };
}
