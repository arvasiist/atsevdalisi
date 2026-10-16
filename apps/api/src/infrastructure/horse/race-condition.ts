import type { PoolClient } from 'pg';
import type { CareConfig, HorseGrowthConfig } from '@at-sevdalisi/game-config';
import { computeHorseAgeMonths } from '../../domain/horse/age-curve';
import { computeRaceConditionCost, VITAL_MAX, VITAL_MIN } from '../../domain/care/race-condition';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { HorseNotReadyToRaceError } from '../../domain/race/errors';
import { checkRaceReadiness, type RaceReadinessThresholds } from '../../domain/race/readiness';
import type { HorseStatus } from '@at-sevdalisi/shared-types';

const SECONDS_PER_HOUR = 3600;

/**
 * Bir turun saydığı süre (saniye) — `creditedRecoverySeconds` ile AYNI kural
 * SQL'de: negatif değil, `maxCreditSeconds`i aşmaz. `$now`, `$maxCredit`
 * yer tutucuları çağıranın parametre sırasıdır.
 */
function creditedSecondsSql(nowParam: string, maxCreditParam: string): string {
  return `LEAST(${maxCreditParam}::numeric, GREATEST(0, EXTRACT(EPOCH FROM (${nowParam}::timestamptz - vitals_recovered_at))))`;
}

/**
 * YARIŞIN ATA BEDELİ — sonucu yazan transaction'ın İÇİNDE çağrılır (yarış
 * geri alınırsa bedel de geri alınır). Önce bekleyen toparlanma hesaba
 * katılır, sonra bedel düşülür ve damga yenilenir: dolu atın eski damgası
 * bir sonraki turda bedava toparlanma vermez, yarı toparlanmış at da
 * birikmiş süresini kaybetmez. Yalnızca gerçek atlar (botların satırı yok).
 */
export async function applyRaceConditionInTransaction(
  client: PoolClient,
  horseIds: readonly string[],
  distanceMeters: number,
  care: CareConfig,
  now: Date,
): Promise<void> {
  const ids = [...new Set(horseIds)];
  const cost = computeRaceConditionCost(distanceMeters, care.raceCondition);
  if (ids.length === 0 || (cost.energy === 0 && cost.fatigue === 0)) {
    return;
  }
  const { energyPerHour, fatiguePerHour, maxCreditSeconds, enabled } = care.passiveRecovery;
  const credited = enabled ? creditedSecondsSql('$2', '$3') : '0';
  await client.query(
    `UPDATE horses
        SET energy = GREATEST($6::numeric, LEAST($7::numeric, energy + $4::numeric * ${credited} / ${SECONDS_PER_HOUR}) - $8::numeric),
            fatigue = LEAST($7::numeric, GREATEST($6::numeric, fatigue - $5::numeric * ${credited} / ${SECONDS_PER_HOUR}) + $9::numeric),
            vitals_recovered_at = $2::timestamptz,
            updated_at = $2::timestamptz
      WHERE id = ANY($1::uuid[])`,
    [ids, now, maxCreditSeconds, energyPerHour, fatiguePerHour, VITAL_MIN, VITAL_MAX, cost.energy, cost.fatigue],
  );
}

/**
 * ZAMANLA TOPARLANMA TURU — tek atomik ifade. Yalnızca dolu olmayan,
 * emekli olmayan ve damgası `now`dan eski atlar güncellenir; aynı `now` ile
 * ikinci tur hiçbir şey yazmaz (iki örnek ya da tekrar eden tur çift
 * toparlanma veremez). Dönen sayı güncellenen at sayısıdır.
 */
export async function recoverHorseVitals(
  client: Pick<PoolClient, 'query'>,
  care: CareConfig,
  now: Date,
): Promise<number> {
  const { energyPerHour, fatiguePerHour, maxCreditSeconds } = care.passiveRecovery;
  const credited = creditedSecondsSql('$1', '$2');
  const result = await client.query(
    `UPDATE horses
        SET energy = LEAST($5::numeric, energy + $3::numeric * ${credited} / ${SECONDS_PER_HOUR}),
            fatigue = GREATEST($6::numeric, fatigue - $4::numeric * ${credited} / ${SECONDS_PER_HOUR}),
            vitals_recovered_at = $1::timestamptz
      WHERE status <> 'retired'
        AND (energy < 100 OR fatigue > 0)
        AND vitals_recovered_at < $1::timestamptz`,
    [now, maxCreditSeconds, energyPerHour, fatiguePerHour, VITAL_MAX, VITAL_MIN],
  );
  return result.rowCount ?? 0;
}

/**
 * HAZIRLIK KAPISI KİLİT ALTINDA — çağıranın transaction'ında, para
 * hareketinden ÖNCE. Kilitsiz ön kontrolden sonra eşzamanlı yarışlar atı
 * yormuş olabilir; karar burada kilitli satırla verilir, hazır değilse
 * `HorseNotReadyToRaceError` transaction'ı geri alır (para düşmez).
 */
export async function assertHorseRaceReadyLocked(
  client: PoolClient,
  horseId: string,
  gate: { thresholds: RaceReadinessThresholds; growth: HorseGrowthConfig },
  now: Date,
): Promise<void> {
  const result = await client.query<{
    status: HorseStatus;
    health: string;
    fitness: string;
    fatigue: string;
    energy: string;
    morale: string;
    birth_date: Date;
    aging_started_at: Date;
  }>(
    `SELECT status, health, fitness, fatigue, energy, morale, birth_date, aging_started_at
     FROM horses WHERE id = $1 FOR UPDATE`,
    [horseId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new HorseNotFoundError(horseId);
  }
  const readiness = checkRaceReadiness(
    row.status,
    {
      health: Number(row.health),
      fitness: Number(row.fitness),
      fatigue: Number(row.fatigue),
      energy: Number(row.energy),
      morale: Number(row.morale),
    },
    gate.thresholds,
    computeHorseAgeMonths({ birthDate: row.birth_date, agingStartedAt: row.aging_started_at }, now, gate.growth),
  );
  if (!readiness.ready && readiness.reason !== null) {
    throw new HorseNotReadyToRaceError(readiness.reason);
  }
}
