import { Module } from '@nestjs/common';
import { HealthModule } from './api/health/health.module';
import { AppConfigModule } from './infrastructure/config/config.module';

/**
 * Kök modül. FAZ 1'den itibaren buraya PlayerModule, HorseModule,
 * TrainingModule, RaceModule vb. eklenecektir (bkz. docs/ARCHITECTURE.md §6).
 * Şimdilik sadece altyapı modülleri (config, health check) bağlıdır.
 */
@Module({
  imports: [AppConfigModule, HealthModule],
})
export class AppModule {}
