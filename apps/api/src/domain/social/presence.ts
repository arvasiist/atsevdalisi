/**
 * 16.10.2026 — sosyal brief §3: oyuncu arama + çevrimiçi durumu. Saf kurallar
 * (DB yok); sorgular `postgres-social.repository.ts`te.
 */
import type { SocialConfig } from '@at-sevdalisi/game-config';

/** Oyuncu kimliği (UUID) — tam eşleşme araması. */
const PLAYER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Kullanıcı adı alfabesi `domain/player/validation.ts` ile AYNI (a-z, 0-9, _). */
const USERNAME_PREFIX_PATTERN = /^[a-z0-9_]+$/;

export type PlayerSearchQuery = { kind: 'id'; playerId: string } | { kind: 'username'; prefix: string };

/**
 * Sorguyu çözer. Kimlik biçimindeyse tam eşleşme; değilse kullanıcı adı ön
 * eki (küçük harfe çevrilir, baştaki `@` atılır). Kullanıcı adı alfabesi
 * dışında karakter ya da `minQueryLength`ten kısa ön ek → `null` (boş sonuç;
 * hata değil — yazarken arayan istemciye 400 yağdırmayalım).
 */
export function parsePlayerSearchQuery(raw: string, minQueryLength: number): PlayerSearchQuery | null {
  const trimmed = raw.trim().toLowerCase();
  if (PLAYER_ID_PATTERN.test(trimmed)) return { kind: 'id', playerId: trimmed };
  const prefix = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (prefix.length < minQueryLength || !USERNAME_PREFIX_PATTERN.test(prefix)) return null;
  return { kind: 'username', prefix };
}

/** `LIKE` kalıbı: `_` kullanıcı adında geçerli bir karakterdir ama LIKE jokeridir → kaçırılır. */
export function usernamePrefixLikePattern(prefix: string): string {
  return `${prefix.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export type PresenceState = 'online' | 'offline' | 'hidden';

export interface PresenceFacts {
  lastSeenAt: Date | null;
  showOnlineStatus: boolean;
}

export interface ResolvedPresence {
  state: PresenceState;
  /** Gizli oyuncuda `null` — son görülme de sızmaz. */
  lastSeenAt: string | null;
}

/** Durum `last_seen_at`ten TÜRETİLİR; gizlilik açıksa hiçbir zaman bilgisi çıkmaz. */
export function resolvePresence(facts: PresenceFacts, now: Date, onlineWindowSeconds: number): ResolvedPresence {
  if (!facts.showOnlineStatus) return { state: 'hidden', lastSeenAt: null };
  if (facts.lastSeenAt === null) return { state: 'offline', lastSeenAt: null };
  const ageMs = now.getTime() - facts.lastSeenAt.getTime();
  return {
    state: ageMs <= onlineWindowSeconds * 1000 ? 'online' : 'offline',
    lastSeenAt: facts.lastSeenAt.toISOString(),
  };
}

const PRESENCE_ORDER: Record<PresenceState, number> = { online: 0, offline: 1, hidden: 2 };

/**
 * Arkadaş listesi sırası: çevrimiçi → çevrimdışı (en son görülen önce) →
 * gizli; eşitlikte görünen ad (tr-TR). Girdiyi değiştirmez.
 */
export function sortByPresence<T extends { presence: ResolvedPresence; displayName: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const order = PRESENCE_ORDER[a.presence.state] - PRESENCE_ORDER[b.presence.state];
    if (order !== 0) return order;
    const aSeen = a.presence.lastSeenAt === null ? 0 : Date.parse(a.presence.lastSeenAt);
    const bSeen = b.presence.lastSeenAt === null ? 0 : Date.parse(b.presence.lastSeenAt);
    if (aSeen !== bSeen) return bSeen - aSeen;
    return a.displayName.localeCompare(b.displayName, 'tr-TR');
  });
}

/** Açılışta koşar: bozuk değer reddedilir. */
export function validatePresenceConfig(config: Pick<SocialConfig, 'presence' | 'playerSearch'>): string[] {
  const problems: string[] = [];
  const { heartbeatSeconds, onlineWindowSeconds, touchMinIntervalSeconds } = config.presence;
  for (const [name, value] of Object.entries({ heartbeatSeconds, onlineWindowSeconds, touchMinIntervalSeconds })) {
    if (!Number.isInteger(value) || value <= 0) problems.push(`social.presence.${name} pozitif tam sayı olmalı (verilen: ${value}).`);
  }
  if (onlineWindowSeconds <= heartbeatSeconds) {
    problems.push('social.presence.onlineWindowSeconds nabız aralığından büyük olmalı (açık sekme çevrimdışı görünürdü).');
  }
  if (touchMinIntervalSeconds >= heartbeatSeconds) {
    problems.push('social.presence.touchMinIntervalSeconds nabız aralığından küçük olmalı (nabızlar yazılmazdı).');
  }
  const { minQueryLength, limit } = config.playerSearch;
  if (!Number.isInteger(minQueryLength) || minQueryLength < 1) problems.push('social.playerSearch.minQueryLength ≥ 1 olmalı.');
  if (!Number.isInteger(limit) || limit < 1) problems.push('social.playerSearch.limit ≥ 1 olmalı.');
  return problems;
}
