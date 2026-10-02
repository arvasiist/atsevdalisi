import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type {
  AccountCredentialsView,
  AccountProvider,
  ApiSuccess,
  AuthProvidersView,
  AuthSession,
  AuthSessionInfo,
  SessionTokens,
} from '@at-sevdalisi/shared-types';
import { AuthSessionUseCase } from '../../application/use-cases/auth-session.use-case';
import { LinkProviderUseCase } from '../../application/use-cases/link-provider.use-case';
import { LoginWithProviderUseCase } from '../../application/use-cases/login-with-provider.use-case';
import { PasswordAuthUseCase } from '../../application/use-cases/password-auth.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from './current-player.decorator';
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
    @Inject(AuthSessionUseCase) private readonly sessions: AuthSessionUseCase,
    @Inject(PasswordAuthUseCase) private readonly passwordAuth: PasswordAuthUseCase,
    @Inject(LinkProviderUseCase) private readonly linkProvider: LinkProviderUseCase,
  ) {}

  // AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum) — `register`
  // ile AYNI gerekçe (`@Public()`, token'sız), bkz.
  // `rate-limit.decorator.ts` doc yorumu.
  @RateLimit({ name: 'login', limit: 10, windowSeconds: 300, keyBy: 'ip' })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<ApiSuccess<AuthSession>> {
    const { player } = await this.loginWithProviderUseCase.execute({
      provider: dto.provider,
      idToken: dto.idToken,
    });
    const session = await this.sessions.issue(player.id, userAgent);
    return { success: true, data: { ...session, player: toPlayerSummary(player) } };
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
  async loginWithPassword(
    @Body() body: { email?: unknown; password?: unknown },
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<ApiSuccess<AuthSession>> {
    const player = await this.passwordAuth.login(body?.email, body?.password);
    const session = await this.sessions.issue(player.id, userAgent);
    return { success: true, data: { ...session, player: toPlayerSummary(player) } };
  }

  /**
   * OTURUM YENİLEME (02.10.2026, migration 0057) — `@Public()`: erişim
   * token'ının süresi dolmuşken çağrılır. Refresh token HER çağrıda değişir;
   * eskisi tekrar sunulursa oturum kapanır. Hata tek koddur
   * (`INVALID_REFRESH_TOKEN`, 401).
   */
  @RateLimit({ name: 'auth-refresh', limit: 30, windowSeconds: 300, keyBy: 'ip' })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refreshToken?: unknown }): Promise<ApiSuccess<SessionTokens>> {
    return { success: true, data: await this.sessions.refresh(body?.refreshToken) };
  }

  /**
   * ESKİ TOKEN'I OTURUMA YÜKSELTME — yalnızca 02.10.2026 öncesi `sid`siz
   * token kabul edilir (oturumlu token 409). Misafirin hesabı token'dadır;
   * bu uç onu kaybetmeden yeni modele taşır.
   */
  @RateLimit({ name: 'auth-session-upgrade', limit: 5, windowSeconds: 300, keyBy: 'player' })
  @Post('session')
  @HttpCode(HttpStatus.OK)
  async upgradeSession(
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<ApiSuccess<SessionTokens>> {
    const access = { playerId: currentPlayer.id, sessionId: currentPlayer.sessionId };
    return { success: true, data: await this.sessions.upgradeLegacy(access, userAgent) };
  }

  /** Bu cihazdan çıkış — erişim token'ı ANINDA geçersizleşir. */
  @RateLimit({ name: 'auth-logout', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentPlayer() currentPlayer: AuthenticatedPlayer): Promise<ApiSuccess<{ loggedOut: true }>> {
    await this.sessions.logout({ playerId: currentPlayer.id, sessionId: currentPlayer.sessionId });
    return { success: true, data: { loggedOut: true } };
  }

  /** Tüm cihazlardan çıkış — eski (`sid`siz) token'lar dahil. */
  @RateLimit({ name: 'auth-logout-all', limit: 10, windowSeconds: 300, keyBy: 'player' })
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentPlayer() currentPlayer: AuthenticatedPlayer): Promise<ApiSuccess<{ loggedOut: true }>> {
    await this.sessions.logoutAll(currentPlayer.id);
    return { success: true, data: { loggedOut: true } };
  }

  /** Aktif oturumlar (cihazlar) — yalnızca çağıranın. */
  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  async listSessions(@CurrentPlayer() currentPlayer: AuthenticatedPlayer): Promise<ApiSuccess<AuthSessionInfo[]>> {
    const access = { playerId: currentPlayer.id, sessionId: currentPlayer.sessionId };
    return { success: true, data: await this.sessions.list(access) };
  }

  /** Bir cihazı kapat. Başkasının oturumu 404 (IDOR kapısı SQL'dedir). */
  @RateLimit({ name: 'auth-session-revoke', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<{ revoked: true }>> {
    await this.sessions.revoke(currentPlayer.id, sessionId);
    return { success: true, data: { revoked: true } };
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
  ): Promise<ApiSuccess<{ email: string }>> {
    const saved = await this.passwordAuth.saveAccount(currentPlayer.id, body?.email, body?.password);
    return { success: true, data: { email: saved.email } };
  }

  /** Oyuncunun giriş bilgisi durumu — `email: null` misafir demektir. */
  @Get('credentials')
  @HttpCode(HttpStatus.OK)
  async credentials(@CurrentPlayer() currentPlayer: AuthenticatedPlayer): Promise<ApiSuccess<AccountCredentialsView>> {
    const [email, linkedProviders] = await Promise.all([
      this.passwordAuth.accountEmail(currentPlayer.id),
      this.linkProvider.linkedProviders(currentPlayer.id),
    ]);
    return { success: true, data: { email, linkedProviders } };
  }

  /**
   * GOOGLE HESABI BAĞLAMA (01.10.2026, migration 0048) — oturum açmış
   * oyuncu kendi hesabına bir Google kimliği bağlar. Oyuncu TOKEN'dan gelir.
   * Gövde HAM geçirilir; doğrulama use-case'tedir (CLAUDE.md kural 5).
   */
  @RateLimit({ name: 'link-provider', limit: 5, windowSeconds: 300, keyBy: 'player' })
  @Post('link')
  @HttpCode(HttpStatus.OK)
  async link(
    @Body() body: { provider?: unknown; idToken?: unknown },
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<{ provider: AccountProvider }>> {
    return { success: true, data: await this.linkProvider.link(currentPlayer.id, body?.provider, body?.idToken) };
  }

  /**
   * Hangi dış girişlerin yapılandırıldığı (01.10.2026) — `@Public()`; giriş
   * ekranı oturum açılmadan önce okur. Kimlik bilgisi yoksa `null` döner ve
   * web Google düğmesini GÖSTERMEZ.
   */
  @Public()
  @Get('providers')
  @HttpCode(HttpStatus.OK)
  providers(): ApiSuccess<AuthProvidersView> {
    return { success: true, data: this.linkProvider.providersView() };
  }

  /**
   * ŞİFRE SIFIRLAMA İSTEĞİ (30.09.2026, migration 0047) — `@Public()`.
   * Yanıt HER ZAMAN 202'dir; e-postanın kayıtlı olup olmadığını söylemez.
   */
  @RateLimit({ name: 'password-reset-request', limit: 5, windowSeconds: 900, keyBy: 'ip' })
  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(@Body() body: { email?: unknown }): Promise<ApiSuccess<{ accepted: true }>> {
    await this.passwordAuth.requestPasswordReset(body?.email);
    return { success: true, data: { accepted: true } };
  }

  /** Şifre sıfırlama onayı — bağlantıdaki token + yeni şifre. `@Public()`. */
  @RateLimit({ name: 'password-reset-confirm', limit: 10, windowSeconds: 900, keyBy: 'ip' })
  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(@Body() body: { token?: unknown; password?: unknown }): Promise<ApiSuccess<{ reset: true }>> {
    await this.passwordAuth.confirmPasswordReset(body?.token, body?.password);
    return { success: true, data: { reset: true } };
  }
}
