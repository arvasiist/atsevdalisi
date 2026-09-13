import { Body, Controller, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ApiSuccess, PracticeRaceResult } from '@at-sevdalisi/shared-types';
import { RunPracticeRaceUseCase } from '../../application/use-cases/run-practice-race.use-case';
import { DEFAULT_RACE_TACTIC } from '../../domain/race/validation';
import { RunPracticeRaceDto } from './dto/run-practice-race.dto';

/**
 * docs/API.md §4 Horses (Ahır) — `POST /horses/:id/practice-race`
 * (brief §6 Race Engine, §75 MVP kriteri). `@Controller('horses')`
 * `HorseController`/`TrainingController`/`CareController` ile AYNI
 * prefix'i paylaşır — güvenlidir çünkü tam rota yolları çakışmaz (bkz.
 * `StableController`'ın `PlayerController` ile AYNI prefix'i paylaştığı
 * desen). Ayrı bir modülde (`RaceModule`) tutulur çünkü kendi
 * repository'sine (`RACE_REPOSITORY`) sahiptir.
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık
 * `@Inject()` ile enjekte edilir.
 */
@Controller('horses')
export class RaceController {
  constructor(@Inject(RunPracticeRaceUseCase) private readonly runPracticeRaceUseCase: RunPracticeRaceUseCase) {}

  // Antrenman/Bakım/Ahır Yükseltme/Günlük Ödül ile AYNI gerekçeyle 200 OK
  // (yeni bir KAYNAK yaratılmış olsa da — `races` satırı — istemciye bunu
  // yönetmesi için bir URI verilmiyor, bu dilimde `GET /races/:id` yok;
  // bu "atın gerçekleştirdiği bir eylem" olarak modellendi).
  @Post(':id/practice-race')
  @HttpCode(HttpStatus.OK)
  async runPracticeRace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RunPracticeRaceDto,
  ): Promise<ApiSuccess<PracticeRaceResult>> {
    const result = await this.runPracticeRaceUseCase.execute(id, {
      tactic: {
        racingStyle: dto.racingStyle ?? DEFAULT_RACE_TACTIC.racingStyle,
        riskLevel: dto.riskLevel ?? DEFAULT_RACE_TACTIC.riskLevel,
        startApproach: dto.startApproach ?? DEFAULT_RACE_TACTIC.startApproach,
        finalStretchPlan: dto.finalStretchPlan ?? DEFAULT_RACE_TACTIC.finalStretchPlan,
      },
    });
    return { success: true, data: result };
  }
}
