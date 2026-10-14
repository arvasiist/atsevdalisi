import { Inject, Injectable } from '@nestjs/common';
import { checkOwnRaceCancelable } from '../../domain/race/lobby';
import { NotRaceOwnerError, OwnRaceNotCancelableError, RaceNotFoundError } from '../../domain/race/errors';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

/**
 * 14.10.2026 — oyuncu KENDİ açtığı yarışı iptal eder (`POST /races/:id/cancel`).
 *
 * Eksik olan yol buydu: açık yarış tavanı (`maxOpenRacesPerPlayer`) dolan
 * oyuncunun yarışlarını geri almanın bir yolu yoktu; 7 gün sonrasına açılmış
 * yarışlar onu 7 gün kilitliyordu. Kural saf fonksiyondadır
 * (`checkOwnRaceCancelable`) ve repository onu yarış satırı KİLİTLİYKEN
 * koşar. Aktif katılım varken iptal YOKTUR, bu yüzden bu yolda para hareket
 * etmez (iade gerektiren iptal yöneticinin yoludur).
 */
@Injectable()
export class CancelOwnRaceUseCase {
  constructor(@Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository) {}

  async execute(raceId: string, playerId: string): Promise<void> {
    const found = await this.raceRepository.cancelOwnLobbyRace({ raceId, now: new Date() }, (race) => {
      const rejection = checkOwnRaceCancelable(race, playerId);
      if (rejection === 'NOT_OWNER') {
        throw new NotRaceOwnerError(raceId);
      }
      if (rejection !== null) {
        throw new OwnRaceNotCancelableError(rejection, raceId);
      }
    });
    if (!found) {
      throw new RaceNotFoundError(raceId);
    }
  }
}
