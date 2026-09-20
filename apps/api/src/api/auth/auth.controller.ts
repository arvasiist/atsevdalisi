import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import type { ApiSuccess, AuthSession } from '@at-sevdalisi/shared-types';
import { LoginWithProviderUseCase } from '../../application/use-cases/login-with-provider.use-case';
import { TOKEN_SERVICE, type TokenService } from '../../application/ports/token.service';
import { toPlayerSummary } from '../dto/player.mapper';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { Public } from './public.decorator';
import { LoginDto } from './dto/login.dto';

/**
 * `POST /auth/login` (brief §41/§50 Google/Apple Sign-In). AUDIT_REPORT.md
 * Bulgu S1 hardening (bu oturum) — `PlayerController.register`'ın
 * (token'sız demo kaydı, hâlâ mevcut) YANINDA, GERÇEK bir kimlik doğrulama
 * akışı sağlar. `@Public()` işaretlidir (bkz. o decorator'ın doc yorumu) —
 * bu rota, henüz BİZİM token'ımıza sahip OLMAYAN bir istemci tarafından
 * çağrılır.
 *
 * NOT — proje sahibi henüz gerçek Google/Apple OAuth kimlik bilgileri
 * SAĞLAMADI (bkz. `GoogleAppleIdentityProvider` doc yorumu) — bu uç nokta
 * şu an her zaman `INVALID_PROVIDER_TOKEN` (401) döner; gerçek kimlik
 * bilgileri sağlandığında BU DOSYA DEĞİŞMEDEN uçtan uca çalışır hale gelir.
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık `@Inject()`
 * ile enjekte edilir.
 */
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(LoginWithProviderUseCase) private readonly loginWithProviderUseCase: LoginWithProviderUseCase,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
  ) {}

  // AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum) — `register`
  // ile AYNI gerekçe (`@Public()`, token'sız), bkz.
  // `rate-limit.decorator.ts` doc yorumu.
  @RateLimit({ name: 'login', limit: 10, windowSeconds: 300 })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<ApiSuccess<AuthSession>> {
    const { player } = await this.loginWithProviderUseCase.execute({
      provider: dto.provider,
      idToken: dto.idToken,
    });
    const token = this.tokenService.sign({ sub: player.id });
    return { success: true, data: { token, player: toPlayerSummary(player) } };
  }
}
