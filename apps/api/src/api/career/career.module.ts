import { Module } from '@nestjs/common';
import { CAREER_REPOSITORY } from '../../application/ports/career.repository';
import { GetCareerUseCase } from '../../application/use-cases/get-career.use-case';
import { PostgresCareerRepository } from '../../infrastructure/career/postgres-career.repository';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CareerController } from './career.controller';

/** Kariyer (16.10.2026, brief §10). Depo yarış modülüne de verilir (lobi kilidi). */
@Module({
  imports: [DatabaseModule],
  controllers: [CareerController],
  providers: [GetCareerUseCase, { provide: CAREER_REPOSITORY, useClass: PostgresCareerRepository }],
  exports: [CAREER_REPOSITORY],
})
export class CareerModule {}
