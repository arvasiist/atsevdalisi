import { Inject, Injectable } from '@nestjs/common';
import type { MatchmakingTicket } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { NotInMatchmakingQueueError } from '../../domain/online/errors';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { MATCHMAKING_TICKET_REPOSITORY, type MatchmakingTicketRepository } from '../ports/matchmaking-ticket.repository';

/**
 * `DELETE /matchmaking/queue` (docs/API.md §9). `JoinMatchmakingQueueUseCase`
 * ile AYNI desen — oyuncu, gövdede/query'de AYRI bir `playerId` DEĞİL,
 * `horseId`'nin `horse.ownerId`'sinden TÜRETİLEN kimliğiyle tanımlanır
 * (`CreateMarketListingUseCase` ile AYNI gerekçe, brief'in henüz gerçek
 * bir kimlik doğrulama/oturum sistemi tanımlamamasından kaynaklanır —
 * bkz. docs/API.md "Açık kararlar" madde 1).
 *
 * FAZ 1 wiring, on dördüncü dilim (bu oturum).
 */
@Injectable()
export class LeaveMatchmakingQueueUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(MATCHMAKING_TICKET_REPOSITORY) private readonly ticketRepository: MatchmakingTicketRepository,
  ) {}

  async execute(horseId: string): Promise<MatchmakingTicket> {
    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }

    const playerId = horse.ownerId;
    const ticket = await this.ticketRepository.findByPlayerId(playerId);
    if (ticket === null) {
      throw new NotInMatchmakingQueueError(playerId);
    }

    await this.ticketRepository.deleteByPlayerId(playerId);
    return ticket;
  }
}
