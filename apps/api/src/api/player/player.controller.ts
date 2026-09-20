import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ApiSuccess, AuthSession, PlayerSummary } from '@at-sevdalisi/shared-types';
import { GetPlayerUseCase } from '../../application/use-cases/get-player.use-case';
import { RegisterPlayerUseCase } from '../../application/use-cases/register-player.use-case';
import { TOKEN_SERVICE, type TokenService } from '../../application/ports/token.service';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { Public } from '../auth/public.decorator';
import { toPlayerSummary } from '../dto/player.mapper';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RegisterPlayerDto } from './dto/register-player.dto';

/**
 * docs/API.md §3 Player. İş kuralı İÇERMEZ — sadece Application katmanını
 * çağırır ve sonucu docs/API.md §1.1 zarfına sarar (bkz.
 * docs/ARCHITECTURE.md §4 "API: ... İş kuralı içermez").
 *
 * AUDIT_REPORT.md Bulgu S1 (Critical) hardening (bu oturum) — brief §41/§50
 * Google/Apple Sign-In. `POST /players`, gerçek OAuth kimlik bilgileri
 * proje sahibi tarafından sağlanana kadar (bkz. `AuthController`/
 * `GoogleAppleIdentityProvider` doc yorumları) token'sız, doğrudan kayıt
 * sağlayan bir geliştirme/demo uç noktası olmaya DEVAM eder — ama artık
 * `@Public()` işaretlidir (global `AuthGuard`'dan MUAF, bkz. o guard'ın doc
 * yorumu) VE kayıt sonrası HEMEN bir oturum JWT'si de döner (`AuthSession`),
 * böylece istemci kayıt olduktan hemen sonra korunan HİÇBİR uç noktada
 * tıkanmaz. `GET /players/:id` ise artık `@Public()` DEĞİLDİR ve yalnızca
 * kendi profilini isteyen oyuncuya (bkz. `assertSelf`) 200 döner — başka
 * bir oyuncunun id'sini deneyen istek 403 alır (eski davranış: HERKESİN
 * HERKESİN profilini görebilmesiydi, bkz. AUDIT_REPORT.md Bulgu S4).
 *
 * NOT — kök neden (FAZ 1 wiring, beşinci CI hatası, bkz. git geçmişi):
 * her bağımlılık açık `@Inject()` token'ıyla enjekte edilir (Vitest/esbuild
 * `design:paramtypes` üst verisini asla YAYMAZ — bkz. docs/ARCHITECTURE.md
 * §9.1 Hata 6).
 */
@Controller('players')
export class PlayerController {
  constructor(
    @Inject(RegisterPlayerUseCase) private readonly registerPlayerUseCase: RegisterPlayerUseCase,
    @Inject(GetPlayerUseCase) private readonly getPlayerUseCase: GetPlayerUseCase,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
  ) {}

  // AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum) — `@Public()`
  // olduğundan (token gerektirmediğinden) bot/kaba-kuvvet kayıt
  // denemelerine karşı en savunmasız uç noktalardan biri, bkz.
  // `rate-limit.decorator.ts` doc yorumu.
  @RateLimit({ name: 'register', limit: 10, windowSeconds: 300 })
  @Public()
  @Post()
  async register(@Body() dto: RegisterPlayerDto): Promise<ApiSuccess<AuthSession>> {
    const player = await this.registerPlayerUseCase.execute(dto);
    const token = this.tokenService.sign({ sub: player.id });
    return { success: true, data: { token, player: toPlayerSummary(player) } };
  }

  @Get(':id')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PlayerSummary>> {
    assertSelf(currentPlayer.id, id);
    const player = await this.getPlayerUseCase.execute(id);
    return { success: true, data: toPlayerSummary(player) };
  }
}
