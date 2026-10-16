import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { Staff, StaffRole } from '@at-sevdalisi/shared-types';
import type {
  StaffMoneyInput,
  StaffMoneyResult,
  StaffRepository,
} from '../../application/ports/staff.repository';
import { debit } from '../../domain/economy/wallet';
import { assertCanHireMoreStaff } from '../../domain/farm/farm';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { calculateContractCost, hireStaff, renewContract } from '../../domain/staff/staff';
import { StaffNotFoundError, StaffNotOwnedError } from '../../domain/staff/errors';
import { AppConfigService } from '../config/config.service';
import { PG_POOL, withTransaction } from '../database/database.module';

interface StaffRow {
  id: string;
  role: string;
  name: string;
  skill: string;
  experience: number;
  salary: string;
  specialization: string | null;
  morale: string;
  contract_started_at: Date;
  contract_duration_months: number | null;
  owner_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToStaff(row: StaffRow): Staff {
  return {
    id: row.id,
    role: row.role as StaffRole,
    name: row.name,
    // NUMERIC ve BIGINT `pg`den metin döner (CLAUDE.md) — `Number(...)` şart.
    skill: Number(row.skill),
    experience: row.experience,
    salary: Number(row.salary),
    specialization: row.specialization,
    morale: Number(row.morale),
    contract: {
      startedAt: row.contract_started_at.toISOString(),
      durationMonths: row.contract_duration_months,
    },
    ownerId: row.owner_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function lockStaff(client: PoolClient, staffId: string): Promise<Staff> {
  const result = await client.query<StaffRow>('SELECT * FROM staff WHERE id = $1 FOR UPDATE', [
    staffId,
  ]);
  const row = result.rows[0];
  if (!row) {
    throw new StaffNotFoundError(staffId);
  }
  return rowToStaff(row);
}

/**
 * Kilit sırası HER ZAMAN `staff` → `players` (jokey kiralamayla aynı).
 * Bırakma `players`i hiç kilitlemez.
 */
@Injectable()
export class PostgresStaffRepository implements StaffRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findByOwnerId(ownerId: string): Promise<Staff[]> {
    const result = await this.pool.query<StaffRow>(
      'SELECT * FROM staff WHERE owner_id = $1 ORDER BY role, skill DESC, id',
      [ownerId],
    );
    return result.rows.map(rowToStaff);
  }

  async findCandidates(roles: readonly string[]): Promise<Staff[]> {
    const result = await this.pool.query<StaffRow>(
      'SELECT * FROM staff WHERE owner_id IS NULL AND role = ANY($1) ORDER BY role, salary ASC, id',
      [roles],
    );
    return result.rows.map(rowToStaff);
  }

  async insertCandidates(candidates: Staff[]): Promise<void> {
    for (const staff of candidates) {
      await this.pool.query(
        `INSERT INTO staff (id, role, name, skill, experience, salary, specialization, morale,
                            contract_started_at, contract_duration_months, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL)`,
        [
          staff.id,
          staff.role,
          staff.name,
          staff.skill,
          staff.experience,
          staff.salary,
          staff.specialization,
          staff.morale,
          staff.contract.startedAt,
          staff.contract.durationMonths,
        ],
      );
    }
  }

  async findStaffBuildingLevel(ownerId: string): Promise<number> {
    const result = await this.pool.query<{ level: number }>(
      "SELECT level FROM facilities WHERE owner_id = $1 AND type = 'staff_building'",
      [ownerId],
    );
    return result.rows[0]?.level ?? 0;
  }

  async hire(input: StaffMoneyInput & { capacity: number }): Promise<StaffMoneyResult> {
    return withTransaction(this.pool, async (client) => {
      const staff = await lockStaff(client, input.staffId);
      // Sahiplik KİLİT ALTINDA: iki eşzamanlı kiralama aynı adayı iki oyuncuya veremez.
      const hired = hireStaff(staff, input.playerId, input.now);
      const contract = {
        startedAt: input.now.toISOString(),
        durationMonths: this.config.staff.contractMonths,
      };
      // Kapasite de kilit altında sayılır — `players` satırı kilitlenmeden önce
      // değil SONRA (aynı oyuncunun iki eşzamanlı kiralaması sırayla geçer).
      const { balanceBefore, balanceAfter, paid } = await this.charge(client, input, staff);
      const count = await client.query<{ n: string }>(
        'SELECT COUNT(*) AS n FROM staff WHERE owner_id = $1',
        [input.playerId],
      );
      assertCanHireMoreStaff(Number(count.rows[0]?.n ?? 0), input.capacity);
      await client.query(
        `UPDATE staff SET owner_id = $2, contract_started_at = $3, contract_duration_months = $4, updated_at = $5
          WHERE id = $1`,
        [staff.id, input.playerId, contract.startedAt, contract.durationMonths, input.now],
      );
      await this.writeLedger(client, input, paid, balanceBefore, balanceAfter);
      return { staff: { ...hired, contract }, paid, balanceAfter };
    });
  }

  async renew(input: StaffMoneyInput): Promise<StaffMoneyResult> {
    return withTransaction(this.pool, async (client) => {
      const staff = await lockStaff(client, input.staffId);
      if (staff.ownerId !== input.playerId) {
        throw new StaffNotOwnedError(input.staffId);
      }
      // Pencere kuralı kilit altında: çift basışın ikincisi burada 409 alır.
      const contract = renewContract(staff.contract, this.config.staff, input.now);
      const { balanceBefore, balanceAfter, paid } = await this.charge(client, input, staff);
      await client.query(
        'UPDATE staff SET contract_started_at = $2, contract_duration_months = $3, updated_at = $4 WHERE id = $1',
        [staff.id, contract.startedAt, contract.durationMonths, input.now],
      );
      await this.writeLedger(client, input, paid, balanceBefore, balanceAfter);
      return {
        staff: { ...staff, contract, updatedAt: input.now.toISOString() },
        paid,
        balanceAfter,
      };
    });
  }

  async release(input: { staffId: string; playerId: string; now: Date }): Promise<Staff> {
    return withTransaction(this.pool, async (client) => {
      const staff = await lockStaff(client, input.staffId);
      if (staff.ownerId !== input.playerId) {
        throw new StaffNotOwnedError(input.staffId);
      }
      // İADE YOK (jokey bırakmayla aynı gerekçe): peşin sözleşme bir kiralama
      // bedelidir; iade edilseydi "kirala → bırak" döngüsü personeli bedava yapardı.
      const result = await client.query<StaffRow>(
        'UPDATE staff SET owner_id = NULL, updated_at = $2 WHERE id = $1 RETURNING *',
        [staff.id, input.now],
      );
      return rowToStaff(result.rows[0] as StaffRow);
    });
  }

  private async charge(
    client: PoolClient,
    input: StaffMoneyInput,
    staff: Staff,
  ): Promise<{ balanceBefore: number; balanceAfter: number; paid: number }> {
    const balance = await client.query<{ money: string }>(
      'SELECT money FROM players WHERE id = $1 FOR UPDATE',
      [input.playerId],
    );
    const row = balance.rows[0];
    if (!row) {
      throw new PlayerNotFoundError(input.playerId);
    }
    const balanceBefore = Number(row.money);
    const paid = calculateContractCost(staff, this.config.staff);
    if (paid <= 0) {
      return { balanceBefore, balanceAfter: balanceBefore, paid: 0 };
    }
    const balanceAfter = debit({ money: balanceBefore, gems: 0 }, paid, 'money').money;
    await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
      input.playerId,
      balanceAfter,
      input.now,
    ]);
    return { balanceBefore, balanceAfter, paid };
  }

  /** Defter — bakiye güncellemesiyle AYNI transaction (CLAUDE.md kural 7). Sıfır tutar yazılmaz. */
  private async writeLedger(
    client: PoolClient,
    input: StaffMoneyInput,
    paid: number,
    balanceBefore: number,
    balanceAfter: number,
  ): Promise<void> {
    if (paid <= 0) {
      return;
    }
    await client.query(
      `INSERT INTO economy_transactions
         (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
       VALUES ($1, 'staff_contract', $2, 'money', 'staff', $3, $4, $5)`,
      [input.playerId, balanceAfter - balanceBefore, input.staffId, balanceBefore, balanceAfter],
    );
  }
}
