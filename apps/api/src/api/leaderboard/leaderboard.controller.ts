import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { ApiSuccess, LeaderboardRowView, RaceWinnersPageView } from '@at-sevdalisi/shared-types';
import { GetLeaderboardUseCase } from '../../application/use-cases/get-leaderboard.use-case';
import { GetRaceWinnersUseCase } from '../../application/use-cases/get-race-winners.use-case';
import { Public } from '../auth/public.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

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
  constructor(
    @Inject(GetLeaderboardUseCase) private readonly getLeaderboardUseCase: GetLeaderboardUseCase,
    @Inject(GetRaceWinnersUseCase) private readonly getRaceWinners: GetRaceWinnersUseCase,
  ) {}

  @Public()
  @Get()
  async getLeaderboard(): Promise<ApiSuccess<LeaderboardRowView[]>> {
    const rows = await this.getLeaderboardUseCase.execute();
    return { success: true, data: rows };
  }

  /**
   * 16.10.2026 (brief §12) — kazananlar tablosu: `?from=&to=` (YYYY-AA-GG,
   * `[from, to)`), `?before=` (imleç), `?limit=`. Sıralamayla aynı sınıf
   * (`@Public`, kişiye özel veri yok: kullanıcı adı, at adı, pist, derece,
   * ödül). Okuma yolu ama veritabanı taradığı için IP başına hız sınırı.
   * Sorgu dizesi düz parametrelerle okunur (Express 5 iç içe nesne kurmaz).
   */
  @Public()
  @RateLimit({ name: 'race-winners', limit: 60, windowSeconds: 60, keyBy: 'ip' })
  @Get('winners')
  async getWinners(
    @Query('limit') limit: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('before') before: string | undefined,
  ): Promise<ApiSuccess<RaceWinnersPageView>> {
    return { success: true, data: await this.getRaceWinners.execute({ limit, from, to, before }) };
  }
}
