import type { Pool, PoolClient } from 'pg';
import type { Horse } from '@at-sevdalisi/shared-types';
import {
  BREED_DISTANCE_COLUMNS,
  BREED_DISTANCE_KEYS,
  BREED_STAT_KEYS,
  BREED_SURFACE_KEYS,
  type BreedInitialStats,
} from '../../domain/horse/breeds';

/**
 * `horses` tablosunun satır şekli + okuma/yazma yardımcıları.
 *
 * `infrastructure/player/player-row.ts` ile AYNI gerekçe ve AYNI desen:
 * bu tanımlar önceden `PostgresHorseRepository` içinde `private` idi, ama
 * besleme (`PostgresFeedInventoryRepository`) de aynı transaction içinde
 * at satırını okuyup yazmak zorunda kaldı. İkinci bir `UPDATE horses`
 * metni YAZMAK yerine (bayat SQL tehlikesi — bu proje daha önce bayat seed
 * SQL'iyle ısırıldı) tek bir paylaşılan tanım çıkarıldı.
 *
 * BIGINT/NUMERIC alanları `node-postgres` STRING döner → `Number(...)`
 * çevirisi burada, TEK noktada yapılır (bkz. `player-row.ts` aynı not).
 */
export interface HorseRow {
  id: string;
  owner_id: string;
  name: string;
  gender: string;
  breed: string;
  birth_date: Date;
  level: number;
  xp: string;
  quality: string;
  potential: string;
  health: string;
  fitness: string;
  fatigue: string;
  energy: string;
  morale: string;
  weight_kg: string | null;
  status: string;
  sire_id: string | null;
  dam_id: string | null;
  coat_color: string;
  face_marking: string;
  leg_marking: string;
  created_at: Date;
  updated_at: Date;
}

export function rowToHorse(row: HorseRow): Horse {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    gender: row.gender as Horse['gender'],
    breed: row.breed,
    birthDate: row.birth_date.toISOString(),
    level: row.level,
    xp: Number(row.xp),
    quality: Number(row.quality),
    potential: Number(row.potential),
    health: Number(row.health),
    fitness: Number(row.fitness),
    fatigue: Number(row.fatigue),
    energy: Number(row.energy),
    morale: Number(row.morale),
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    status: row.status as Horse['status'],
    sireId: row.sire_id,
    damId: row.dam_id,
    // CHECK kısıtları (migration 0051) union tipleriyle aynı kümeyi tutar.
    appearance: {
      coatColor: row.coat_color as Horse['appearance']['coatColor'],
      faceMarking: row.face_marking as Horse['appearance']['faceMarking'],
      legMarking: row.leg_marking as Horse['appearance']['legMarking'],
    },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * `horses` satırını yazar. `Pool`/`PoolClient` ikisi de `pg`'nin uyumlu
 * `query()` imzasına sahiptir, bu yüzden tek imza ikisini de karşılar
 * (`player-row.ts` `writePlayerRow` ile AYNI).
 *
 * YALNIZCA "değişken" alanları yazar (owner/level/xp/statü/vitals/ağırlık);
 * `name`/`gender`/`breed`/`birth_date`/`sire_id`/`dam_id` KİMLİK
 * alanlarıdır ve bu sorguyla DEĞİŞTİRİLEMEZ.
 */
export async function writeHorseRow(executor: Pool | PoolClient, horse: Horse): Promise<void> {
  await executor.query(
    `UPDATE horses
     SET owner_id = $2, health = $3, fitness = $4, fatigue = $5, energy = $6, morale = $7,
         weight_kg = $8, status = $9, level = $10, xp = $11, updated_at = $12
     WHERE id = $1`,
    [
      horse.id,
      horse.ownerId,
      horse.health,
      horse.fitness,
      horse.fatigue,
      horse.energy,
      horse.morale,
      horse.weightKg,
      horse.status,
      horse.level,
      horse.xp,
      new Date(horse.updatedAt),
    ],
  );
}

/**
 * 07.10.2026 — YENİ bir atı (ana satır + dört eşlik eden tablo) yazar. Başlangıç
 * atı (`PostgresHorseRepository.save`) ve ırk mağazası AYNI fonksiyonu kullanır;
 * iki ayrı INSERT metni bir gün ayrışırdı. Çağıran transaction açar.
 *
 * `initial` verilmezse statlar DB varsayılanlarında kalır (migration 0003).
 * Verilirse yalnızca ırkın tanımladığı sütunlar yazılır; sütun adları kapalı
 * kümeden (`BREED_*_KEYS`) gelir, kullanıcı girdisi DEĞİLDİR.
 */
export async function insertNewHorse(client: PoolClient, horse: Horse, initial?: BreedInitialStats): Promise<void> {
  await client.query(
    `INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, level, xp, quality, potential, health, fitness, fatigue, energy, morale, weight_kg, status, sire_id, dam_id, created_at, updated_at, coat_color, face_marking, leg_marking)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
    [
      horse.id,
      horse.ownerId,
      horse.name,
      horse.gender,
      horse.breed,
      horse.birthDate.slice(0, 10),
      horse.level,
      horse.xp,
      horse.quality,
      horse.potential,
      horse.health,
      horse.fitness,
      horse.fatigue,
      horse.energy,
      horse.morale,
      horse.weightKg,
      horse.status,
      horse.sireId,
      horse.damId,
      new Date(horse.createdAt),
      new Date(horse.updatedAt),
      horse.appearance.coatColor,
      horse.appearance.faceMarking,
      horse.appearance.legMarking,
    ],
  );
  await insertWithValues(client, 'horse_stats', horse.id, columnValues(initial?.stats, BREED_STAT_KEYS, (key) => key));
  await client.query('INSERT INTO horse_health (horse_id) VALUES ($1)', [horse.id]);
  await insertNewHorseTrackStats(client, horse.id, initial);
}

/** Zemin + mesafe uyumu satırları — tay da (statları genetikten gelse bile) ırkından alır. */
export async function insertNewHorseTrackStats(
  client: PoolClient,
  horseId: string,
  initial?: BreedInitialStats,
): Promise<void> {
  await insertWithValues(client, 'horse_surface_stats', horseId, columnValues(initial?.surface, BREED_SURFACE_KEYS, (key) => key));
  await insertWithValues(
    client,
    'horse_distance_stats',
    horseId,
    columnValues(initial?.distance, BREED_DISTANCE_KEYS, (key) => BREED_DISTANCE_COLUMNS[key]),
  );
}

function columnValues<K extends string>(
  values: Partial<Record<K, number>> | undefined,
  keys: readonly K[],
  column: (key: K) => string,
): Array<[string, number]> {
  if (!values) {
    return [];
  }
  return keys.flatMap((key) => (values[key] === undefined ? [] : [[column(key), values[key] as number] as [string, number]]));
}

async function insertWithValues(
  client: PoolClient,
  table: 'horse_stats' | 'horse_surface_stats' | 'horse_distance_stats',
  horseId: string,
  entries: Array<[string, number]>,
): Promise<void> {
  const columns = ['horse_id', ...entries.map(([column]) => column)];
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, [
    horseId,
    ...entries.map(([, value]) => value),
  ]);
}
