import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import type { AccountCredentialsView, ApiSuccess, AuthSession } from '@at-sevdalisi/shared-types';
import { LoginWithProviderUseCase } from '../../application/use-cases/login-with-provider.use-case';
import { PasswordAuthUseCase } from '../../application/use-cases/password-auth.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from './current-player.decorator';
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
    @Inject(PasswordAuthUseCase) private readonly passwordAuth: PasswordAuthUseCase,
  ) {}

  // AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum) — `register`
  // ile AYNI gerekçe (`@Public()`, token'sız), bkz.
  // `rate-limit.decorator.ts` doc yorumu.
  @RateLimit({ name: 'login', limit: 10, windowSeconds: 300, keyBy: 'ip' })
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

  /**
   * E-POSTA + ŞİFRE İLE GİRİŞ (30.09.2026, migration 0046). `@Public()` —
   * token'ı olmayan (yeni cihaz, silinmiş tarayıcı verisi) oyuncunun hesabına
   * dönmesinin yolu budur. Kayıtlı olmayan e-posta ile yanlış şifre AYNI 401
   * `INVALID_CREDENTIALS`tir. Hız sınırı IP başınadır (kaba kuvvet denemesi).
   * Gövde HAM geçirilir; doğrulama use-case'tedir (CLAUDE.md kural 5).
   */
  @RateLimit({ name: 'login-password', limit: 10, windowSeconds: 300, keyBy: 'ip' })
  @Public()
  @Post('login/password')
  @HttpCode(HttpStatus.OK)
  async loginWithPassword(@Body() body: { email?: unknown; password?: unknown }): Promise<ApiSuccess<AuthSession>> {
    const player = await this.passwordAuth.login(body?.email, body?.password);
    const token = this.tokenService.sign({ sub: player.id });
    return { success: true, data: { token, player: toPlayerSummary(player) } };
  }

  /**
   * "HESABINI KAYDET" (30.09.2026) — oturum açmış MİSAFİR oyuncu kendi
   * hesabına e-posta + şifre bağlar. Oyuncu TOKEN'dan gelir; gövdede başka
   * bir oyuncu kimliği KABUL EDİLMEZ. Atlar, para ve geçmiş aynı oyuncuda
   * kalır — yeni hesap açılmaz.
   */
  @RateLimit({ name: 'save-account', limit: 5, windowSeconds: 300, keyBy: 'player' })
  @Post('credentials')
  @HttpCode(HttpStatus.CREATED)
  async saveAccount(
    @Body() body: { email?: unknown; password?: unknown },
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AccountCredentialsView>> {
    const saved = await this.passwordAuth.saveAccount(currentPlayer.id, body?.email, body?.password);
    return { success: true, data: { email: saved.email } };
  }

  /** Oyuncunun giriş bilgisi durumu — `email: null` misafir demektir. */
  @Get('credentials')
  @HttpCode(HttpStatus.OK)
  async credentials(@CurrentPlayer() currentPlayer: AuthenticatedPlayer): Promise<ApiSuccess<AccountCredentialsView>> {
    return { success: true, data: { email: await this.passwordAuth.accountEmail(currentPlayer.id) } };
  }
}
