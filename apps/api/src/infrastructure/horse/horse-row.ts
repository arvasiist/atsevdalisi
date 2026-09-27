import type { Pool, PoolClient } from 'pg';
import type { Horse } from '@at-sevdalisi/shared-types';

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
