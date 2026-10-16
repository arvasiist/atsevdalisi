import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { EquipmentType, HorseEquipment } from '@at-sevdalisi/shared-types';
import { HorseEquipmentNotFoundError } from '../../domain/equipment/errors';
import type {
  HorseEquipmentRepository,
  PurchaseHorseEquipmentInput,
} from '../../application/ports/horse-equipment.repository';
import { assertCanBuyEquipment } from '../../domain/equipment/catalog';
import { debit } from '../../domain/economy/wallet';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { PG_POOL, withTransaction } from '../database/database.module';
import { writeLedgerEntries } from '../player/player-row';

interface HorseEquipmentRow {
  id: string;
  horse_id: string;
  equipment_type: EquipmentType;
  name: string;
  quality: string;
  equipped: boolean;
  created_at: Date;
  catalog_key: string | null;
}

const COLUMNS = 'id, horse_id, equipment_type, name, quality, equipped, created_at, catalog_key';

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
    catalogKey: row.catalog_key,
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

  /**
   * KATALOGDAN ALIM — PARA YOLU (08.10.2026). Tek transaction, kilit sırası
   * pazarla aynı (at → oyuncu): at satırı SAHİBİYLE `FOR UPDATE` (guard'dan
   * sonra satılmış at 404), oyuncu `FOR UPDATE` → seviye kapısı + bakiye
   * KİLİT ALTINDA → parça (`equipped: false`) → bakiye → `equipment_purchase`
   * defter satırı. Kalite/ad/fiyat çağıranın verdiği KATALOG kaleminden.
   */
  async purchase(input: PurchaseHorseEquipmentInput): Promise<{ item: HorseEquipment; money: number }> {
    return withTransaction(this.pool, async (client) => {
      const horse = await client.query('SELECT id FROM horses WHERE id = $1 AND owner_id = $2 FOR UPDATE', [
        input.horseId,
        input.playerId,
      ]);
      if (horse.rows.length === 0) {
        throw new HorseNotFoundError(input.horseId);
      }
      const buyer = await client.query<{ money: string; gems: string; level: number }>(
        'SELECT money, gems, level FROM players WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.playerId],
      );
      const row = buyer.rows[0];
      if (!row) {
        throw new PlayerNotFoundError(input.playerId);
      }
      assertCanBuyEquipment(input.catalogItem, row.level);

      const before = { money: Number(row.money), gems: Number(row.gems) };
      const after = debit(before, input.catalogItem.priceMoney, 'money');

      const inserted = await client.query<HorseEquipmentRow>(
        `INSERT INTO horse_equipment (id, horse_id, equipment_type, name, quality, equipped, created_at, catalog_key)
         VALUES ($1, $2, $3, $4, $5, false, $6, $7)
         RETURNING ${COLUMNS}`,
        [
          input.equipmentId,
          input.horseId,
          input.catalogItem.equipmentType,
          input.catalogItem.name,
          input.catalogItem.quality,
          input.now,
          input.catalogItem.key,
        ],
      );
      await client.query('UPDATE players SET money = $2, updated_at = now() WHERE id = $1', [input.playerId, after.money]);
      await writeLedgerEntries(client, [
        {
          playerId: input.playerId,
          type: 'equipment_purchase',
          amount: -input.catalogItem.priceMoney,
          currency: 'money',
          referenceType: 'horse_equipment',
          referenceId: input.equipmentId,
          balanceBefore: before.money,
          balanceAfter: after.money,
          idempotencyKey: input.idempotencyKey,
        },
      ]);
      return { item: rowToEquipment(inserted.rows[0]!), money: after.money };
    });
  }

  async findById(id: string): Promise<HorseEquipment | null> {
    const result = await this.pool.query<HorseEquipmentRow>(
      `SELECT ${COLUMNS} FROM horse_equipment WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? rowToEquipment(row) : null;
  }

  async findByHorseId(horseId: string): Promise<HorseEquipment[]> {
    const result = await this.pool.query<HorseEquipmentRow>(
      `SELECT ${COLUMNS}
       FROM horse_equipment
       WHERE horse_id = $1
       ORDER BY created_at DESC`,
      [horseId],
    );
    return result.rows.map(rowToEquipment);
  }

  async findEquippedByHorseId(horseId: string): Promise<HorseEquipment[]> {
    const result = await this.pool.query<HorseEquipmentRow>(
      `SELECT ${COLUMNS}
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
        `SELECT ${COLUMNS}
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
         RETURNING ${COLUMNS}`,
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
       RETURNING ${COLUMNS}`,
      [equipmentId, horseId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new HorseEquipmentNotFoundError(equipmentId);
    }
    return rowToEquipment(row);
  }
}
