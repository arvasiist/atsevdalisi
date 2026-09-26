import { Inject, Injectable } from '@nestjs/common';
import type { TrainingSession } from '@at-sevdalisi/shared-types';
import { TRAINING_HISTORY_LIMIT } from '../../domain/training/validation';
import { TRAINING_SESSION_REPOSITORY, type TrainingSessionRepository } from '../ports/training-session.repository';

/**
 * `GET /horses/:id/training-history` (bu turda EKLENDİ — docs/AUDIT_REPORT.md
 * "Antrenman geçmişi gösterimi" bulgusunun kapatılması, `docs/API.md`'nin
 * daha önce "KAPSAM DIŞI" diye işaretlediği `history` uç noktasının
 * antrenman-yalnızca alt kümesi — bkz. `training.controller.ts`'e eklenen
 * rotanın doc yorumu, bu isim ayrımının GEREKÇESİ orada açıklanır).
 *
 * At'ın VAR OLUP OLMADIĞI ve isteği yapan oyuncuya AİT OLUP OLMADIĞI bu
 * use-case'in SORUMLULUĞU DEĞİLDİR — `HorseOwnerGuardByParam` (route'a
 * ZATEN eklenmiş guard, bkz. controller) bunu Application katmanına
 * ULAŞMADAN ÖNCE doğrular (bulunamayan at için `HorseNotFoundError`, sahibi
 * farklıysa `ForbiddenError` fırlatır) — bu yüzden burada `HORSE_REPOSITORY`
 * bağımlılığı YOKTUR, `GetHorseMarketValueUseCase`'in aksine (o endpoint
 * `@Public()`'tir, kendi at-var-mı kontrolünü kendisi yapar).
 */
@Injectable()
export class GetTrainingHistoryUseCase {
  constructor(@Inject(TRAINING_SESSION_REPOSITORY) private readonly trainingSessionRepository: TrainingSessionRepository) {}

  async execute(horseId: string): Promise<TrainingSession[]> {
    return this.trainingSessionRepository.findByHorseId(horseId, TRAINING_HISTORY_LIMIT);
  }
}
