import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { CareerHistoryRow, CareerRepository } from '../../application/ports/career.repository';
import { AppConfigService } from '../config/config.service';
import { PG_POOL } from '../database/database.module';
import { careerHistoryOf, careerPointsOf } from './career-points';

@Injectable()
export class PostgresCareerRepository implements CareerRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  pointsOf(playerId: string): Promise<number> {
    return careerPointsOf(this.pool, playerId, this.config.career);
  }

  historyOf(playerId: string, limit: number): Promise<CareerHistoryRow[]> {
    return careerHistoryOf(this.pool, playerId, this.config.career, limit);
  }
}
