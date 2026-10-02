import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AuthSessionInfo, SessionTokens } from '@at-sevdalisi/shared-types';
import {
  InvalidAuthTokenError,
  InvalidRefreshTokenError,
  SessionNotFoundError,
  SessionUpgradeNotAllowedError,
} from '../../domain/auth/errors';
import { isAccessTokenAuthorized, normalizeUserAgent } from '../../domain/auth/session';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { AUTH_SESSION_REPOSITORY, type AuthSessionRepository } from '../ports/auth-session.repository';
import { TOKEN_SERVICE, type TokenPayload, type TokenService } from '../ports/token.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Refresh token'ın kabul edilen en uzun hâli — sınırsız girdi özetlenmez. */
const MAX_REFRESH_TOKEN_LENGTH = 512;

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface AuthorizedAccess {
  playerId: string;
  sessionId: string | null;
}

/**
 * OTURUM (02.10.2026, migration 0057) — kısa ömürlü erişim JWT'si + dönen
 * refresh token. Kurallar `domain/auth/session.ts`te; bu sınıf yalnızca
 * token üretir/özetler ve repository'yi çağırır.
 *
 * ⚠️ Refresh token düz metni YALNIZCA yanıtta bulunur; loglanmaz, saklanmaz.
 */
@Injectable()
export class AuthSessionUseCase {
  constructor(
    @Inject(AUTH_SESSION_REPOSITORY) private readonly sessions: AuthSessionRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /** Giriş/kayıt sonrası yeni oturum. */
  async issue(playerId: string, rawUserAgent: unknown, now: Date = new Date()): Promise<SessionTokens> {
    const settings = this.config.auth.session;
    const refreshToken = this.newRefreshToken();
    const sessionId = await this.sessions.create({
      playerId,
      refreshHash: hashRefreshToken(refreshToken),
      userAgent: normalizeUserAgent(rawUserAgent, settings.userAgentMaxLength),
      expiresAt: this.refreshExpiry(now),
      now,
      maxActive: settings.maxActiveSessionsPerPlayer,
    });
    return this.tokensFor(playerId, sessionId, refreshToken, now);
  }

  /** Refresh token'ı döndürür; eskisi bir daha kullanılırsa oturum kapanır. */
  async refresh(rawRefreshToken: unknown, now: Date = new Date()): Promise<SessionTokens> {
    if (
      typeof rawRefreshToken !== 'string' ||
      rawRefreshToken === '' ||
      rawRefreshToken.length > MAX_REFRESH_TOKEN_LENGTH
    ) {
      throw new InvalidRefreshTokenError();
    }
    const refreshToken = this.newRefreshToken();
    const result = await this.sessions.rotate({
      refreshHash: hashRefreshToken(rawRefreshToken),
      newRefreshHash: hashRefreshToken(refreshToken),
      expiresAt: this.refreshExpiry(now),
      now,
    });
    if (result.kind !== 'rotated') {
      throw new InvalidRefreshTokenError();
    }
    return this.tokensFor(result.playerId, result.sessionId, refreshToken, now);
  }

  /** Erişim token'ının ŞU AN geçerli olup olmadığı (guard + soket el sıkışması). */
  async authorize(payload: TokenPayload, now: Date = new Date()): Promise<AuthorizedAccess> {
    const sessionId = payload.sid ?? null;
    const state = await this.sessions.authorizationState(payload.sub, sessionId);
    const ok = isAccessTokenAuthorized({ sessionId, issuedAtSeconds: payload.iat ?? null }, state, now);
    if (!ok) {
      throw new InvalidAuthTokenError();
    }
    return { playerId: payload.sub, sessionId };
  }

  /** Bu cihazdan çıkış. Eski token'da oturum yoktur → oyuncunun eski token'ları kesilir. */
  async logout(access: AuthorizedAccess, now: Date = new Date()): Promise<void> {
    if (access.sessionId === null) {
      await this.sessions.invalidateLegacyTokens(access.playerId, now);
      return;
    }
    await this.sessions.revoke(access.playerId, access.sessionId, 'logout', now);
  }

  async logoutAll(playerId: string, now: Date = new Date()): Promise<void> {
    await this.sessions.revokeAll(playerId, 'logout_all', now);
  }

  async list(access: AuthorizedAccess, now: Date = new Date()): Promise<AuthSessionInfo[]> {
    const rows = await this.sessions.listActive(access.playerId, now);
    return rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      current: row.id === access.sessionId,
    }));
  }

  /** Başka bir cihazı kapatır; oturum çağırana ait değilse 404 (varlığı sızdırılmaz). */
  async revoke(playerId: string, sessionId: string, now: Date = new Date()): Promise<void> {
    const revoked = await this.sessions.revoke(playerId, sessionId, 'revoked', now);
    if (!revoked) {
      throw new SessionNotFoundError();
    }
  }

  /**
   * Eski (`sid`siz) token'ı oturuma yükseltir. Oturumlu token reddedilir:
   * 1 saatlik çalıntı bir erişim token'ı 30 günlük refresh token basamamalı.
   * Eski token'ı KESMEZ — aynı misafir token'ını taşıyan ikinci bir cihaz
   * yükseltemeden hesabını kaybederdi; eski token kendi süresiyle ölür.
   */
  async upgradeLegacy(access: AuthorizedAccess, rawUserAgent: unknown, now: Date = new Date()): Promise<SessionTokens> {
    if (access.sessionId !== null) {
      throw new SessionUpgradeNotAllowedError();
    }
    return this.issue(access.playerId, rawUserAgent, now);
  }

  private tokensFor(playerId: string, sessionId: string, refreshToken: string, now: Date): SessionTokens {
    const ttlSeconds = this.config.auth.session.accessTokenTtlSeconds;
    return {
      token: this.tokens.sign({ sub: playerId, sid: sessionId }, ttlSeconds),
      refreshToken,
      accessTokenExpiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    };
  }

  private newRefreshToken(): string {
    return randomBytes(this.config.auth.session.refreshTokenBytes).toString('base64url');
  }

  private refreshExpiry(now: Date): Date {
    return new Date(now.getTime() + this.config.auth.session.refreshTokenTtlDays * DAY_MS);
  }
}
