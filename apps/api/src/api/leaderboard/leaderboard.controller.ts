import { Controller, Get, Inject } from '@nestjs/common';
import type { ApiSuccess, LeaderboardRowView } from '@at-sevdalisi/shared-types';
import { GetLeaderboardUseCase } from '../../application/use-cases/get-leaderboard.use-case';
import { Public } from '../auth/public.decorator';

/**
 * docs/API.md §4 — brief §43 "Sıralamalar". İş kuralı İÇERMEZ; yalnızca
 * Application katmanını çağırır ve sonucu docs/API.md §1.1 zarfına sarar
 * (bkz. `player.controller.ts`/`stable.controller.ts` ile AYNI desen).
 *
 * `@Public()`: sıralama tablosu KİŞİYE ÖZEL VERİ taşımaz — yalnızca oyuncu
 * adı, birikmiş puan ve yarış sayısı döner (bkz. `LeaderboardRowView` doc
 * yorumu). `HorseController.getById`'ın `@Public()` olmasıyla AYNI gerekçe:
 * oyun içi bir PANO, oturum açmamış bir ziyaretçiye de gösterilebilir
 * olmalıdır. Kişiye özel hiçbir şey (para, envanter, ahır) buradan geçmez.
 */
@Controller('leaderboard')
export class LeaderboardController {
  constructor(@Inject(GetLeaderboardUseCase) private readonly getLeaderboardUseCase: GetLeaderboardUseCase) {}

  @Public()
  @Get()
  async getLeaderboard(): Promise<ApiSuccess<LeaderboardRowView[]>> {
    const rows = await this.getLeaderboardUseCase.execute();
    return { success: true, data: rows };
  }
}
