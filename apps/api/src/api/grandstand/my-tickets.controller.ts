import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import type { ApiSuccess, RaceTicketView } from '@at-sevdalisi/shared-types';
import { ListMyTicketsUseCase } from '../../application/use-cases/list-my-tickets.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';

/**
 * "Biletlerim" — `RecentRacesController` ile BİREBİR AYNI desen:
 * `@Controller('players')` prefix'i (`PlayerController`/`StableController`/
 * `FeedController` ile paylaşılır, tam yollar çakışmaz) + `assertSelf`
 * (AUDIT_REPORT.md Bulgu S4: `:id` KAVRAMSAL OLARAK oyuncunun kendisidir,
 * başkasının biletleri okunamaz).
 *
 * Ayrı bir dosyada (`GrandstandController`'ın AKSİNE farklı prefix) —
 * `RecentRacesController`'ın `RaceController`'dan ayrı durmasıyla AYNI
 * gerekçe.
 */
@Controller('players')
export class MyTicketsController {
  constructor(@Inject(ListMyTicketsUseCase) private readonly listMyTicketsUseCase: ListMyTicketsUseCase) {}

  @Get(':id/tickets')
  async getMyTickets(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RaceTicketView[]>> {
    assertSelf(currentPlayer.id, id);
    const tickets = await this.listMyTicketsUseCase.execute(id);
    return { success: true, data: tickets };
  }
}
