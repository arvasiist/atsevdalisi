import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEconomyConfig, loadRaceLobbyConfig, type RaceTierConfig } from '@at-sevdalisi/game-config';
import { validateRaceCreation } from '../../../src/domain/race/lobby';
import { applyPracticeRaceStakes, validateRaceTiers } from '../../../src/domain/race/prize';
import { computePrizePayouts, resolvePrizeDistribution } from '../../../src/domain/race/prize-distribution';
import {
  computeTableSettlement,
  findRaceTable,
  isLoserRefundEligible,
  loserRefundAmount,
  paidPlacesOf,
  tableRakePercent,
  validateRaceTableRules,
} from '../../../src/domain/race/table-rules';

const economy = loadEconomyConfig();
const lobby = loadRaceLobbyConfig();
const MIGRATIONS = join(__dirname, '../../../../../database/migrations');

function latestMigrationWith(needle: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.up.sql'))
    .sort()
    .reverse();
  const file = files.find((name) => readFileSync(join(MIGRATIONS, name), 'utf8').includes(needle));
  if (!file) throw new Error(`${needle} bulunamadı`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

describe('masa kuralları (09.10.2026)', () => {
  it('config geçerli; her masa lobide açılabilir (at sayısı lobinin listesinde)', () => {
    expect(validateRaceTiers(economy)).toEqual([]);
    for (const table of economy.raceTiers) {
      expect(lobby.fieldSizes).toContain(table.fieldSize);
    }
  });

  it('migration CHECK masa kimlikleriyle BİREBİR', () => {
    const sql = latestMigrationWith('races_table_id_valid');
    const listed = [...sql.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
    expect(listed).toEqual(economy.raceTiers.map((table) => table.id).sort());
  });

  it('iade bandı: ödül alan sıra dışı, maxPosition dahil; yüzde 0 = kimse', () => {
    const rule = { percent: 50, maxPosition: 6 };
    expect(isLoserRefundEligible(5, 5, rule)).toBe(false);
    expect(isLoserRefundEligible(6, 5, rule)).toBe(true);
    expect(isLoserRefundEligible(7, 5, rule)).toBe(false);
    expect(isLoserRefundEligible(6, 5, { percent: 0, maxPosition: 6 })).toBe(false);
  });

  it('iade tutarı ödenen bedelin yüzdesi, aşağı yuvarlanır; ödenmemiş bedele iade yok', () => {
    expect(loserRefundAmount(100, { percent: 50, maxPosition: 6 })).toBe(50);
    expect(loserRefundAmount(250, { percent: 25, maxPosition: 8 })).toBe(62);
    expect(loserRefundAmount(0, { percent: 50, maxPosition: 6 })).toBe(0);
  });

  it('kesinleşme para BASMAZ: Σödül + Σiade ≤ havuz, iade havuzdan önce ayrılır', () => {
    for (const table of economy.raceTiers) {
      const shares = resolvePrizeDistribution(economy, table.distributionId)!.shares;
      for (let humans = 1; humans <= table.fieldSize; humans += 1) {
        const entries = Array.from({ length: humans }, (_, index) => ({
          entryId: `e${index}`,
          finishPosition: index + 1,
          paidFee: table.entryFee,
        }));
        const pool = table.entryFee * humans;
        const result = computeTableSettlement(pool, shares, entries, table.loserRefund);
        const paidPrizes = result.payouts.slice(0, humans).reduce((sum, value) => sum + value, 0);
        expect(paidPrizes + result.refundTotal).toBeLessThanOrEqual(pool);
        expect(result.payouts).toEqual(computePrizePayouts(pool - result.refundTotal, shares));
        for (const [entryId, amount] of result.loserRefunds) {
          const position = entries.find((entry) => entry.entryId === entryId)!.finishPosition;
          expect(position).toBeGreaterThan(shares.length);
          expect(position).toBeLessThanOrEqual(table.loserRefund.maxPosition);
          expect(amount).toBe(loserRefundAmount(table.entryFee, table.loserRefund));
        }
      }
    }
  });

  it('iade havuzu aşarsa sessizce kırpılmaz, fırlatır', () => {
    expect(() =>
      computeTableSettlement(10, [0.5, 0.4], [{ entryId: 'a', finishPosition: 3, paidFee: 100 }], {
        percent: 50,
        maxPosition: 3,
      }),
    ).toThrow(/havuzu/);
  });

  it('bozuk masa kuralı reddedilir', () => {
    const table = findRaceTable(economy, 'local')!;
    const broken = (patch: Partial<RaceTierConfig>) => validateRaceTableRules({ ...table, ...patch }, 5);
    expect(broken({ feeTiming: 'sometime' as RaceTierConfig['feeTiming'] })).not.toEqual([]);
    expect(broken({ loserRefund: { percent: 120, maxPosition: 6 } })).not.toEqual([]);
    expect(broken({ loserRefund: { percent: 50, maxPosition: 5 } })).not.toEqual([]);
    expect(broken({ loserRefund: { percent: 50, maxPosition: 99 } })).not.toEqual([]);
    expect(broken({ loserRefund: { percent: 0, maxPosition: 0 } })).toEqual([]);
  });

  it('komisyon dağılımdan türetilir (Σpay = 1 − komisyon)', () => {
    for (const table of economy.raceTiers) {
      const shares = resolvePrizeDistribution(economy, table.distributionId)!.shares;
      expect(tableRakePercent(shares)).toBe(Math.round(economy.raceRake * 100));
      expect(paidPlacesOf(economy, table)).toBe(shares.length);
    }
  });

  it('pratik yarış: iade ödülle birlikte uygulanır, bakiye zinciri doğru', () => {
    expect(applyPracticeRaceStakes({ money: 1000, gems: 0 }, 100, 0, 50)).toEqual({ money: 950, gems: 0 });
    expect(applyPracticeRaceStakes({ money: 1000, gems: 0 }, 100, 270)).toEqual({ money: 1170, gems: 0 });
  });

  describe('masalı yarış açma', () => {
    const now = new Date('2026-10-09T10:00:00Z');
    const base = {
      name: 'Masa Koşusu',
      maxPlayers: 8,
      raceType: 'paid',
      startTime: new Date(now.getTime() + 10 * 60_000).toISOString(),
      surface: 'grass',
      weather: 'sunny',
      distanceMeters: 1600,
      tribuneFee: 0,
      spectatorCapacity: 500,
    };
    const validate = (input: Record<string, unknown>) =>
      validateRaceCreation({ ...base, ...input }, lobby, now, [], [], economy.raceTiers);

    it('masanın bedeli ve at sayısıyla açılır (serbest listede olmayan bedel dahil)', () => {
      const champion = findRaceTable(economy, 'championship')!;
      expect(lobby.paidEntryFeeOptions).not.toContain(champion.entryFee);
      const result = validate({
        tableId: 'championship',
        entryFee: champion.entryFee,
        fieldSize: champion.fieldSize,
        maxPlayers: 8,
      });
      expect(result.problems).toEqual([]);
      expect(result.value?.tableId).toBe('championship');
    });

    it('masadan farklı bedel/at sayısı, bilinmeyen masa ve masa listesi verilmeyen çağıran reddedilir', () => {
      const local = findRaceTable(economy, 'local')!;
      expect(validate({ tableId: 'local', entryFee: local.entryFee + 50, fieldSize: local.fieldSize }).value).toBeNull();
      expect(validate({ tableId: 'local', entryFee: local.entryFee, fieldSize: 10 }).value).toBeNull();
      expect(validate({ tableId: 'vip', entryFee: 100, fieldSize: 8 }).value).toBeNull();
      expect(
        validateRaceCreation({ ...base, tableId: 'local', entryFee: 100, fieldSize: 8 }, lobby, now).value,
      ).toBeNull();
    });

    it('masasız yarış eskisi gibi (tableId null)', () => {
      const result = validate({ entryFee: 100, fieldSize: 8 });
      expect(result.problems).toEqual([]);
      expect(result.value?.tableId).toBeNull();
    });
  });
});
