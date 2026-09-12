import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { HorseStatField, HorseStats } from '@at-sevdalisi/shared-types';
import type { HorseStatsRepository } from '../../application/ports/horse-stats.repository';
import { PG_POOL } from '../database/database.module';

/**
 * `horse_stats` tablosunun satır şekli (`database/migrations/
 * 0003_create_horse_stat_tables.up.sql`). Tüm `NUMERIC(5,2)` sütunlar
 * `node-postgres` tarafından STRING döner (bkz. `postgres-horse.repository.ts`
 * üstündeki AYNI not) — `Number(...)`'a çevrilir. `stride_length`/
 * `stride_frequency` DEFAULT'suz, NULL olabilir sütunlardır.
 */
interface HorseStatsRow {
  horse_id: string;
  speed: string;
  acceleration: string;
  stamina: string;
  strength: string;
  agility: string;
  balance: string;
  stride_length: string | null;
  stride_frequency: string | null;
  start_speed: string;
  early_speed: string;
  mid_speed: string;
  finish_speed: string;
  sprint: string;
  endurance: string;
  cornering: string;
  positioning: string;
  temperament: string;
  focus: string;
  courage: string;
  competitiveness: string;
  stress_resistance: string;
  obedience: string;
}

function rowToHorseStats(row: HorseStatsRow): HorseStats {
  return {
    horseId: row.horse_id,
    speed: Number(row.speed),
    acceleration: Number(row.acceleration),
    stamina: Number(row.stamina),
    strength: Number(row.strength),
    agility: Number(row.agility),
    balance: Number(row.balance),
    strideLength: row.stride_length === null ? null : Number(row.stride_length),
    strideFrequency: row.stride_frequency === null ? null : Number(row.stride_frequency),
    startSpeed: Number(row.start_speed),
    earlySpeed: Number(row.early_speed),
    midSpeed: Number(row.mid_speed),
    finishSpeed: Number(row.finish_speed),
    sprint: Number(row.sprint),
    endurance: Number(row.endurance),
    cornering: Number(row.cornering),
    positioning: Number(row.positioning),
    temperament: Number(row.temperament),
    focus: Number(row.focus),
    courage: Number(row.courage),
    competitiveness: Number(row.competitiveness),
    stressResistance: Number(row.stress_resistance),
    obedience: Number(row.obedience),
  };
}

/**
 * `HorseStatField` (camelCase) → DB sütun adı (snake_case) eşlemesi.
 * `updateStatValue` bir sütun adını doğrudan bir SQL sorgusuna gömer
 * (parametreli değer OLARAK DEĞİL, tanımlayıcı olarak — `pg` parametreleri
 * sütun adlarını değil yalnızca DEĞERLERİ destekler); bu yüzden dinamik
 * bir string yerine SABİT bir eşleme üzerinden gidilir — çağıran taraf
 * (`TrainHorseUseCase`) zaten `HorseStatField` union'ıyla kısıtlı olsa da,
 * bu eşleme SQL enjeksiyonuna karşı ikinci bir güvenlik katmanıdır.
 */
const STAT_COLUMN_MAP: Record<HorseStatField, string> = {
  speed: 'speed',
  acceleration: 'acceleration',
  stamina: 'stamina',
  strength: 'strength',
  agility: 'agility',
  balance: 'balance',
  strideLength: 'stride_length',
  strideFrequency: 'stride_frequency',
  startSpeed: 'start_speed',
  earlySpeed: 'early_speed',
  midSpeed: 'mid_speed',
  finishSpeed: 'finish_speed',
  sprint: 'sprint',
  endurance: 'endurance',
  cornering: 'cornering',
  positioning: 'positioning',
  temperament: 'temperament',
  focus: 'focus',
  courage: 'courage',
  competitiveness: 'competitiveness',
  stressResistance: 'stress_resistance',
  obedience: 'obedience',
};

@Injectable()
export class PostgresHorseStatsRepository implements HorseStatsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByHorseId(horseId: string): Promise<HorseStats | null> {
    const result = await this.pool.query<HorseStatsRow>(
      'SELECT * FROM horse_stats WHERE horse_id = $1 LIMIT 1',
      [horseId],
    );
    return result.rows[0] ? rowToHorseStats(result.rows[0]) : null;
  }

  async updateStatValue(horseId: string, statKey: HorseStatField, newValue: number): Promise<void> {
    const column = STAT_COLUMN_MAP[statKey];
    await this.pool.query(`UPDATE horse_stats SET ${column} = $2, updated_at = now() WHERE horse_id = $1`, [
      horseId,
      newValue,
    ]);
  }
}
