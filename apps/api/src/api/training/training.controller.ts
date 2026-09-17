import { Body, Controller, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { ApiSuccess, TrainHorseResult } from '@at-sevdalisi/shared-types';
import { TrainHorseUseCase } from '../../application/use-cases/train-horse.use-case';
import { DEFAULT_TRAINING_DURATION_MINUTES } from '../../domain/training/validation';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { TrainHorseDto } from './dto/train-horse.dto';

/**
 * docs/API.md §4 Horses (Ahır) — `POST /horses/:id/train` (brief §10).
 * `@Controller('horses')` `HorseController` ile AYNI prefix'i paylaşır;
 * bu güvenlidir çünkü tam rota yolları çakışmaz (bkz. `StableController`'ın
 * `PlayerController` ile AYNI prefix'i paylaştığı desen, docs/ROADMAP.md
 * "Üçüncü dilim") — Antrenman ayrı bir modülde (`TrainingModule`) tutulur
 * çünkü kendi repository'lerine (`HORSE_STATS_REPOSITORY`,
 * `TRAINING_SESSION_REPOSITORY`) sahiptir, `HorseModule`'ün okuma/kayıt
 * sorumluluğuyla KARIŞTIRILMAZ.
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık
 * `@Inject()` ile enjekte edilir (Vitest/esbuild örtük tip tabanlı
 * enjeksiyonu desteklemez).
 */
@Controller('horses')
export class TrainingController {
  constructor(@Inject(TrainHorseUseCase) private readonly trainHorseUseCase: TrainHorseUseCase) {}

  // Antrenman, yeni bir KAYNAK yaratmaz (yalnızca var olan atı günceller)
  // — NestJS'in POST için varsayılanı olan 201 Created yerine bilinçli
  // olarak 200 OK döner (`/players` KAYIT gibi gerçek "creation" uç
  // noktalarından FARKLI, bkz. `PlayerController`).
  // AUDIT_REPORT.md Bulgu S2 (Critical IDOR) hardening (bu oturum) —
  // `HorseOwnerGuard('param')` (bkz. o dosyanın doc yorumu): `:id`'nin
  // GERÇEKTEN kimlik doğrulanmış oyuncuya ait olduğunu doğrular.
  @UseGuards(HorseOwnerGuardByParam)
  @Post(':id/train')
  @HttpCode(HttpStatus.OK)
  async train(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TrainHorseDto,
  ): Promise<ApiSuccess<TrainHorseResult>> {
    const result = await this.trainHorseUseCase.execute(id, {
      type: dto.type,
      intensity: dto.intensity,
      durationMinutes: dto.durationMinutes ?? DEFAULT_TRAINING_DURATION_MINUTES,
    });
    return { success: true, data: result };
  }
}
