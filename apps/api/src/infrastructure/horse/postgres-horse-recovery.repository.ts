import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { CareConfig } from '@at-sevdalisi/game-config';
import type { HorseRecoveryRepository } from '../../application/ports/horse-recovery.repository';
import { PG_POOL } from '../database/database.module';
import { recoverHorseVitals } from './race-condition';

@Injectable()
export class PostgresHorseRecoveryRepository implements HorseRecoveryRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  recoverDue(now: Date, care: CareConfig): Promise<number> {
    return recoverHorseVitals(this.pool, care, now);
  }
}
