import type { PoolClient } from 'pg';
import type { CareConfig, HorseGrowthConfig, StableConfig } from '@at-sevdalisi/game-config';
import { stableRecoveryTable } from '../../domain/stable/stable';
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
 * 16.10.2026 — ahırın konfor çarpanı (sahibin `stable_level`ine en yakın alt
 * seviyenin değeri; `getStableRecoveryMultiplier` ile AYNI kural). Sahibi
 * olmayan/tanımsız seviye → 1. `levelsParam`/`multipliersParam` çağıranın
 * parametre sırasıdır (`stableRecoveryTable`).
 */
function stableRecoveryMultiplierSql(levelsParam: string, multipliersParam: string): string {
  return `COALESCE((SELECT m.mult FROM players p
                      CROSS JOIN LATERAL unnest(${levelsParam}::int[], ${multipliersParam}::numeric[]) AS m(level, mult)
                     WHERE p.id = horses.owner_id AND m.level <= p.stable_level
                     ORDER BY m.level DESC LIMIT 1), 1)`;
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
  // 16.10.2026 — bekleyen toparlanma da ahır konfor çarpanıyla sayılır
  // (zamanlayıcıyla AYNI kural; yoksa yarış anında bonus kaybolurdu).
  stable: StableConfig,
): Promise<void> {
  const ids = [...new Set(horseIds)];
  // 16.10.2026 (brief §8) — ekipman aşınması da yarışın bedelidir: aynı
  // transaction, aynı dört kayıt yolu (pratik, lobi, iki PvP).
  await wearEquippedItemsInTransaction(client, ids, now);
  const cost = computeRaceConditionCost(distanceMeters, care.raceCondition);
  if (ids.length === 0 || (cost.energy === 0 && cost.fatigue === 0)) {
    return;
  }
  const { energyPerHour, fatiguePerHour, maxCreditSeconds, enabled } = care.passiveRecovery;
  const credited = enabled ? creditedSecondsSql('$2', '$3') : '0';
  const multiplier = stableRecoveryMultiplierSql('$10', '$11');
  const table = stableRecoveryTable(stable);
  await client.query(
    `UPDATE horses
        SET energy = GREATEST($6::numeric, LEAST($7::numeric, energy + $4::numeric * ${multiplier} * ${credited} / ${SECONDS_PER_HOUR}) - $8::numeric),
            fatigue = LEAST($7::numeric, GREATEST($6::numeric, fatigue - $5::numeric * ${multiplier} * ${credited} / ${SECONDS_PER_HOUR}) + $9::numeric),
            vitals_recovered_at = $2::timestamptz,
            updated_at = $2::timestamptz
      WHERE id = ANY($1::uuid[])`,
    [
      ids,
      now,
      maxCreditSeconds,
      energyPerHour,
      fatiguePerHour,
      VITAL_MIN,
      VITAL_MAX,
      cost.energy,
      cost.fatigue,
      table.levels,
      table.multipliers,
    ],
  );
}

/**
 * EKİPMAN AŞINMASI — koşan atın KUŞANILI ve ömrü sayılan her parçasından 1
 * yarış düşer; 0'a inen parça aynı ifadede çıkarılır ve `worn_out_at` alır
 * (kısıt: aşınmış parça kuşanılı kalamaz). Tek atomik ifade: aynı yarış iki
 * kez kaydedilemediği için (kayıt yolları durum geçişiyle korunur) çift
 * aşınma olmaz. Kozmetik ve 0096 öncesi parçalar (`NULL`) aşınmaz.
 */
export async function wearEquippedItemsInTransaction(
  client: Pick<PoolClient, 'query'>,
  horseIds: readonly string[],
  now: Date,
): Promise<void> {
  if (horseIds.length === 0) return;
  await client.query(
    `UPDATE horse_equipment
        SET races_remaining = races_remaining - 1,
            equipped = (races_remaining - 1) > 0,
            worn_out_at = CASE WHEN races_remaining - 1 = 0 THEN $2::timestamptz ELSE worn_out_at END
      WHERE horse_id = ANY($1::uuid[])
        AND equipped = true
        AND races_remaining IS NOT NULL
        AND races_remaining > 0`,
    [horseIds, now],
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
  // 16.10.2026 — ahır geliştirme: sahibin ahır seviyesinin konfor çarpanı.
  stable: StableConfig,
): Promise<number> {
  const { energyPerHour, fatiguePerHour, maxCreditSeconds } = care.passiveRecovery;
  const credited = creditedSecondsSql('$1', '$2');
  const multiplier = stableRecoveryMultiplierSql('$7', '$8');
  const table = stableRecoveryTable(stable);
  const result = await client.query(
    `UPDATE horses
        SET energy = LEAST($5::numeric, energy + $3::numeric * ${multiplier} * ${credited} / ${SECONDS_PER_HOUR}),
            fatigue = GREATEST($6::numeric, fatigue - $4::numeric * ${multiplier} * ${credited} / ${SECONDS_PER_HOUR}),
            vitals_recovered_at = $1::timestamptz
      WHERE status <> 'retired'
        AND (energy < 100 OR fatigue > 0)
        AND vitals_recovered_at < $1::timestamptz`,
    [now, maxCreditSeconds, energyPerHour, fatiguePerHour, VITAL_MAX, VITAL_MIN, table.levels, table.multipliers],
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
