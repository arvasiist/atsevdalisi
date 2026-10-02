import type { SessionAuthorizationState } from '../../domain/auth/session';

/**
 * `auth_sessions` + `players.tokens_valid_after` (migration 0057). Refresh
 * token ASLA düz metin saklanmaz — her yöntem SHA-256 ÖZETİ alır.
 */
export type SessionRevokeReason =
  | 'logout'
  | 'logout_all'
  | 'revoked'
  | 'reuse_detected'
  | 'password_reset'
  | 'account_deleted';

export interface StoredSession {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export type RotateResult =
  | { kind: 'rotated'; sessionId: string; playerId: string }
  /** Önceki (artık geçersiz) token yeniden sunuldu → oturum KAPATILDI. */
  | { kind: 'reuse_detected' }
  | { kind: 'invalid' };

export interface AuthSessionRepository {
  /**
   * Yeni oturum açar; oyuncunun aktif oturumu `maxActive`i aşarsa EN ESKİLER
   * (`revoked`) kapatılır — aynı transaction'da.
   */
  create(input: {
    playerId: string;
    refreshHash: string;
    userAgent: string | null;
    expiresAt: Date;
    now: Date;
    maxActive: number;
  }): Promise<string>;
  /** Satır KİLİTLİ: aynı token'la eşzamanlı iki yenilemeden yalnızca biri döner. */
  rotate(input: { refreshHash: string; newRefreshHash: string; expiresAt: Date; now: Date }): Promise<RotateResult>;
  /** Oturum + oyuncu varlığı + etkin yaptırım — TEK sorgu (her istekte koşar). */
  authorizationState(playerId: string, sessionId: string | null, now: Date): Promise<SessionAuthorizationState>;
  /** Giriş/yenilemede: etkin yaptırım (en kısıtlayıcısı); yoksa `null`. */
  findActiveSanction(
    playerId: string,
    now: Date,
  ): Promise<{ kind: 'suspend' | 'ban'; expiresAt: Date | null; reason: string } | null>;
  listActive(playerId: string, now: Date): Promise<StoredSession[]>;
  /** Oyuncuya ait aktif oturumu kapatır; yoksa/başkasınınsa `false` (IDOR kapısı SQL'de). */
  revoke(playerId: string, sessionId: string, reason: SessionRevokeReason, now: Date): Promise<boolean>;
  /** Tüm oturumları kapatır VE `tokens_valid_after = now` (eski token'lar da ölür) — tek transaction. */
  revokeAll(playerId: string, reason: SessionRevokeReason, now: Date): Promise<void>;
  /** Yalnızca eski (`sid`siz) token'ları geçersiz kılar: `tokens_valid_after = now`. */
  invalidateLegacyTokens(playerId: string, now: Date): Promise<void>;
}

export const AUTH_SESSION_REPOSITORY = Symbol('AUTH_SESSION_REPOSITORY');
