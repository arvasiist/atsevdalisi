import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { EquipmentType, HorseEquipment } from '@at-sevdalisi/shared-types';
import { HorseEquipmentNotFoundError } from '../../domain/equipment/errors';
import type { HorseEquipmentRepository } from '../../application/ports/horse-equipment.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

interface HorseEquipmentRow {
  id: string;
  horse_id: string;
  equipment_type: EquipmentType;
  name: string;
  quality: string;
  equipped: boolean;
  created_at: Date;
}

function rowToEquipment(row: HorseEquipmentRow): HorseEquipment {
  return {
    id: row.id,
    horseId: row.horse_id,
    equipmentType: row.equipment_type,
    name: row.name,
    // `quality` NUMERIC(5,2)'dir — `postgres-training-session.repository.ts`'teki
    // `fatigue_gain`/`injury_risk` ile AYNI gerekçeyle `Number(...)`'a çevrilir.
    quality: Number(row.quality),
    equipped: row.equipped,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * `horse_equipment` tablosuna yazan repository (`database/migrations/
 * 0028_create_horse_equipment.up.sql`) — `PostgresTrainingSessionRepository`
 * ile AYNI desen.
 */
@Injectable()
export class PostgresHorseEquipmentRepository implements HorseEquipmentRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async save(item: HorseEquipment): Promise<void> {
    await this.pool.query(
      `INSERT INTO horse_equipment (id, horse_id, equipment_type, name, quality, equipped, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [item.id, item.horseId, item.equipmentType, item.name, item.quality, item.equipped, new Date(item.createdAt)],
    );
  }

  async findById(id: string): Promise<HorseEquipment | null> {
    const result = await this.pool.query<HorseEquipmentRow>(
      `SELECT id, horse_id, equipment_type, name, quality, equipped, created_at FROM horse_equipment WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? rowToEquipment(row) : null;
  }

  async findByHorseId(horseId: string): Promise<HorseEquipment[]> {
    const result = await this.pool.query<HorseEquipmentRow>(
      `SELECT id, horse_id, equipment_type, name, quality, equipped, created_at
       FROM horse_equipment
       WHERE horse_id = $1
       ORDER BY created_at DESC`,
      [horseId],
    );
    return result.rows.map(rowToEquipment);
  }

  async findEquippedByHorseId(horseId: string): Promise<HorseEquipment[]> {
    const result = await this.pool.query<HorseEquipmentRow>(
      `SELECT id, horse_id, equipment_type, name, quality, equipped, created_at
       FROM horse_equipment
       WHERE horse_id = $1 AND equipped = true`,
      [horseId],
    );
    return result.rows.map(rowToEquipment);
  }

  /**
   * `idx_horse_equipment_one_equipped_per_type` (migration 0028) İHLAL
   * edilmemesi için `withTransaction` içinde SIRAYLA çalışır: ÖNCE aynı
   * `equipment_type`'tan kuşanılmış OLABİLECEK başka bir satır varsa onu
   * `equipped = false` yapar, SONRA hedef satırı `equipped = true` yapar
   * — `postgres-market-purchase.repository.ts`'in "FOR UPDATE ile satır
   * kilitleme" deseniyle AYNI ruhta (burada kilitleme GEREKMEZ çünkü iki
   * UPDATE de KENDİ İÇİNDE atomik, ama sıralama İÇİN transaction şarttır).
   */
  async equip(horseId: string, equipmentId: string): Promise<HorseEquipment> {
    return withTransaction(this.pool, async (client) => {
      const targetResult = await client.query<HorseEquipmentRow>(
        `SELECT id, horse_id, equipment_type, name, quality, equipped, created_at
         FROM horse_equipment
         WHERE id = $1 AND horse_id = $2
         FOR UPDATE`,
        [equipmentId, horseId],
      );
      const targetRow = targetResult.rows[0];
      if (!targetRow) {
        throw new HorseEquipmentNotFoundError(equipmentId);
      }

      await client.query(
        `UPDATE horse_equipment SET equipped = false WHERE horse_id = $1 AND equipment_type = $2 AND id != $3`,
        [horseId, targetRow.equipment_type, equipmentId],
      );

      const updatedResult = await client.query<HorseEquipmentRow>(
        `UPDATE horse_equipment SET equipped = true WHERE id = $1
         RETURNING id, horse_id, equipment_type, name, quality, equipped, created_at`,
        [equipmentId],
      );
      const updatedRow = updatedResult.rows[0];
      if (!updatedRow) {
        // Veri bütünlüğü varsayımı: yukarıdaki `SELECT ... FOR UPDATE` AYNI
        // transaction içinde satırı ZATEN bulup kilitledi — bu dala normal
        // koşullarda ULAŞILMAZ (`join-matchmaking-queue.use-case.ts`'teki
        // AYNI kategori "ulaşılamaz dal" savunması, `!` non-null assertion
        // YERİNE gerçek bir çalışma-zamanı koruması).
        throw new HorseEquipmentNotFoundError(equipmentId);
      }
      return rowToEquipment(updatedRow);
    });
  }

  async unequip(horseId: string, equipmentId: string): Promise<HorseEquipment> {
    const result = await this.pool.query<HorseEquipmentRow>(
      `UPDATE horse_equipment SET equipped = false WHERE id = $1 AND horse_id = $2
       RETURNING id, horse_id, equipment_type, name, quality, equipped, created_at`,
      [equipmentId, horseId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new HorseEquipmentNotFoundError(equipmentId);
    }
    return rowToEquipment(row);
  }
}
