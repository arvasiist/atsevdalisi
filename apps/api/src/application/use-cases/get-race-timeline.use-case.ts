import { Inject, Injectable } from '@nestjs/common';
import type { RaceTimelineView } from '@at-sevdalisi/shared-types';
import { ForbiddenError } from '../../domain/auth/errors';
import { RaceNotFoundError } from '../../domain/race/errors';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

/**
 * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`
 * (docs/API.md, brief §58 replay). `GetRecentRaceResultsUseCase` ile AYNI
 * "hiçbir iş kuralı içermez, yalnızca doğrulama + repository çağrısı"
 * deseni (docs/ARCHITECTURE.md §4).
 *
 * Yetkilendirme: bu, `HorseOwnerGuardByParam`'ın tekil-at sahipliğinden
 * FARKLI bir şekildir — burada `:id` bir AT değil bir YARIŞTIR, bu yüzden
 * ayrı bir route guard yerine burada, `RaceRepository.isPlayerParticipant`
 * ile "bu yarışta GERÇEKTEN bir atım var mıydı" sorusu sorulur. Yarış
 * BULUNAMAZSA `RaceNotFoundError` (404); yarış varsa ama istek sahibinin
 * hiçbir atı o yarışta YOKSA `ForbiddenError` (403) — kaynağın VARLIĞI
 * (404 ile) YALNIZCA gerçek katılımcılara sızdırılır, `HorseOwnerGuard`
 * ile AYNI "önce sahiplik" sırası burada TERSTİR (önce var mı, sonra
 * sahip misin) çünkü NOT_FOUND/FORBIDDEN ayrımı burada BİLGİ SIZDIRMAZ —
 * `races.id` client tarafından TAHMİN edilebilir bir kaynak değil
 * (yalnızca kendi yarış sonucundan öğrenilir), `HorseNotFoundError`'ın
 * `horses.id` için aldığı ÖNLEMLE (bkz. o hatanın 404 davranışı) AYNI
 * kategoridedir.
 */
@Injectable()
export class GetRaceTimelineUseCase {
  constructor(@Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository) {}

  async execute(raceId: string, requestingPlayerId: string): Promise<RaceTimelineView> {
    const timeline = await this.raceRepository.findTimelineByRaceId(raceId);
    if (timeline === null) {
      throw new RaceNotFoundError(raceId);
    }

    const isParticipant = await this.raceRepository.isPlayerParticipant(raceId, requestingPlayerId);
    if (!isParticipant) {
      throw new ForbiddenError('Bu yarışın tam alan replay verisini görüntüleme yetkiniz yok.');
    }

    return timeline;
  }
}
