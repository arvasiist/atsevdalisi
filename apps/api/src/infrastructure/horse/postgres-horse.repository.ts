import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Horse } from '@at-sevdalisi/shared-types';
import type { HorseRepository } from '../../application/ports/horse.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

/**
 * `horses` tablosunun satır şekli (snake_case, `database/migrations/
 * 0002_create_tracks_and_horses.up.sql`). `xp` BIGINT, `quality`/
 * `potential`/`health`/`fitness`/`fatigue`/`energy`/`morale`/`weight_kg`
 * NUMERIC'tir — `node-postgres` ikisini de (hassasiyet kaybını önlemek
 * için) varsayılan olarak STRING döner (bkz. `postgres-player.repository.ts`
 * üstündeki AYNI not); bu oyunun değerleri bu sınırı pratikte aşmayacağı
 * için `Number(...)`'a çevrilir.
 *
 * NOT — KAPSAM: `horse_surface_stats`/`horse_distance_stats` tabloları
 * BURADA henüz okunmuyor/yazılmıyor. `horse_stats` (Antrenman, dördüncü
 * dilim) ve `horse_health` (Bakım, beşinci dilim) ise kapsama alındı —
 * `save()` artık ikisine de DB varsayılanlarıyla (migration 0003) birer
 * satır ekliyor (bkz. `PostgresHorseStatsRepository`/
 * `PostgresHorseHealthRepository` — okuma/güncelleme AYRI repository'lerde,
 * çünkü `HorseStats`/`HorseHealth` `Horse`'dan farklı domain kavramlarıdır).
 */
interface HorseRow {
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

function rowToHorse(row: HorseRow): Horse {
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

@Injectable()
export class PostgresHorseRepository implements HorseRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<Horse | null> {
    const result = await this.pool.query<HorseRow>('SELECT * FROM horses WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0] ? rowToHorse(result.rows[0]) : null;
  }

  async findByOwnerId(ownerId: string): Promise<Horse[]> {
    const result = await this.pool.query<HorseRow>(
      'SELECT * FROM horses WHERE owner_id = $1 ORDER BY created_at ASC',
      [ownerId],
    );
    return result.rows.map(rowToHorse);
  }

  async save(horse: Horse): Promise<void> {
    // Bir at, `horse_stats`/`horse_health` satırları olmadan var
    // olamamalıdır (Antrenman `horse_stats`'ı, Bakım `horse_health`'i
    // okur/günceller) — bu yüzden ÜÇ INSERT tek bir transaction'da yapılır
    // (bkz. `database.module.ts` `withTransaction`). İkisi için de sütun
    // listesi VERİLMEZ: DEFAULT değerler (migration 0003) TEK doğruluk
    // kaynağıdır, burada TEKRAR yazılmaz.
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, level, xp, quality, potential, health, fitness, fatigue, energy, morale, weight_kg, status, sire_id, dam_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
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
        ],
      );
      await client.query('INSERT INTO horse_stats (horse_id) VALUES ($1)', [horse.id]);
      await client.query('INSERT INTO horse_health (horse_id) VALUES ($1)', [horse.id]);
    });
  }

  /**
   * FAZ 1 wiring, dördüncü dilim — `TrainHorseUseCase` sonrası fatigue/
   * status günceller. Bilinçli olarak `Horse`'un TÜM değişken alanlarını
   * yazar (tek genel amaçlı metod — ileride Care/Race gibi başka
   * dilimler de kullanacaktır), yalnızca antrenmanın dokunduğu alanları
   * değil.
   */
  async update(horse: Horse): Promise<void> {
    await this.pool.query(
      `UPDATE horses
       SET health = $2, fitness = $3, fatigue = $4, energy = $5, morale = $6,
           weight_kg = $7, status = $8, level = $9, xp = $10, updated_at = $11
       WHERE id = $1`,
      [
        horse.id,
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
}
