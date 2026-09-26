import { Module } from '@nestjs/common';
import { HORSE_EQUIPMENT_REPOSITORY } from '../../application/ports/horse-equipment.repository';
import { CreateHorseEquipmentUseCase } from '../../application/use-cases/create-horse-equipment.use-case';
import { EquipHorseEquipmentUseCase } from '../../application/use-cases/equip-horse-equipment.use-case';
import { ListHorseEquipmentUseCase } from '../../application/use-cases/list-horse-equipment.use-case';
import { UnequipHorseEquipmentUseCase } from '../../application/use-cases/unequip-horse-equipment.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PostgresHorseEquipmentRepository } from '../../infrastructure/equipment/postgres-horse-equipment.repository';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { HorseModule } from '../horse/horse.module';
import { EquipmentController } from './equipment.controller';

/**
 * `TrainingModule` ile AYNI desen. `HORSE_EQUIPMENT_REPOSITORY` burada
 * `exports` EDİLMEZ — `RaceModule`/`MatchmakingModule`'ün AYNI token'ı
 * KENDİ `providers`'larında BAĞIMSIZ olarak sağladığı (`RACE_REPOSITORY`'nin
 * o iki modülde tekrarlandığı desenle AYNI, bkz. `race.module.ts`/
 * `matchmaking.module.ts` doc yorumu) — NestJS'te bir provider yalnızca
 * `exports` eden modülü `imports`'a ekleyen modüllere görünür, ve bu üç
 * modülü (Equipment/Race/Matchmaking) BİRBİRİNE `imports` ile bağlamak
 * gereksiz bir çapraz bağımlılık yaratırdı.
 */
@Module({
  imports: [DatabaseModule, HorseModule],
  controllers: [EquipmentController],
  providers: [
    CreateHorseEquipmentUseCase,
    ListHorseEquipmentUseCase,
    EquipHorseEquipmentUseCase,
    UnequipHorseEquipmentUseCase,
    { provide: HORSE_EQUIPMENT_REPOSITORY, useClass: PostgresHorseEquipmentRepository },
    HorseOwnerGuardByParam,
  ],
})
export class EquipmentModule {}
