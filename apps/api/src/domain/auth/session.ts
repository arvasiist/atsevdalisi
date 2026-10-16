/**
 * OTURUM KURALLARI (02.10.2026, migration 0057) — saf, framework'süz.
 *
 * İki tür erişim token'ı yaşar:
 * - **Oturumlu** (`sid` taşır): geçerliliği `auth_sessions` satırına bağlıdır;
 *   çıkış/iptal satırı kapatır ve token ANINDA reddedilir.
 * - **Eski** (`sid`siz, 02.10.2026 öncesi 30 günlük JWT): satırı yoktur.
 *   Misafirin hesabı yalnızca bu token'dadır, bu yüzden reddedilmez; ama
 *   `players.tokens_valid_after`dan ÖNCE basılmışsa (tüm cihazlardan çıkış,
 *   şifre sıfırlama) geçersizdir. Yeni eski-tip token BASILMAZ.
 */

export interface SessionAuthorizationState {
  /** Oyuncu satırı var mı (silinmiş hesap → yok). */
  playerExists: boolean;
  /** `players.tokens_valid_after`. */
  tokensValidAfter: Date | null;
  /** `sid`li token için oturum satırı; yoksa `null`. */
  session: { revokedAt: Date | null; expiresAt: Date } | null;
  /**
   * 02.10.2026 (Faz 10, migration 0060) — etkin yaptırım. Token GEÇERLİ olsa
   * bile oyuncu askıda/yasaklıysa erişim 403'tür (kimlik doğru, izin yok).
   */
  sanction?: { kind: 'suspend' | 'ban'; expiresAt: Date | null; reason: string } | null;
}

export interface AccessTokenClaims {
  sessionId: string | null;
  /** JWT `iat` (saniye). */
  issuedAtSeconds: number | null;
}

export function isAccessTokenAuthorized(
  claims: AccessTokenClaims,
  state: SessionAuthorizationState,
  now: Date,
): boolean {
  if (!state.playerExists) return false;
  if (claims.sessionId !== null) {
    const session = state.session;
    return session !== null && session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
  }
  // Eski token: kesim noktası yoksa geçerli; varsa kesimden SONRA basılmış
  // olmalı. `iat` saniye hassasiyetindedir — kesimle aynı saniyede basılmış
  // eski token reddedilir (yeni eski-tip token zaten basılmaz).
  if (state.tokensValidAfter === null) return true;
  if (claims.issuedAtSeconds === null) return false;
  return claims.issuedAtSeconds * 1000 > state.tokensValidAfter.getTime();
}

/** Kullanıcı aracısı metni kırpılır; boşsa `null` (kişisel veri değil, yalnızca cihaz etiketi). */
export function normalizeUserAgent(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed.slice(0, maxLength);
}
