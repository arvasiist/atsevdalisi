/**
 * Oyuncu (Player) domain fonksiyonları (brief §7, §31, §42). Kayıt akışının
 * kimlik doğrulama sağlayıcısından bağımsız kısmı — yeni hesabın
 * başlangıç durumunu (para, level, xp) belirler.
 */

import type { EconomyConfig } from '@at-sevdalisi/game-config';
import type { Player } from '@at-sevdalisi/shared-types';
import { UsernameAlreadyTakenError } from './errors';
import { validateDisplayName, validateUsername } from './validation';

export interface NewPlayerInput {
  id: string;
  username: string;
  displayName: string;
  avatarId?: string | null;
  now?: Date;
}

/**
 * Yeni bir oyuncu için başlangıç durumunu oluşturur. `id` (UUID) ve
 * benzersizlik kontrolü (username unique) application/infrastructure
 * katmanının sorumluluğundadır — bu fonksiyon saf bir fabrika (factory)'dir.
 */
export function createNewPlayer(input: NewPlayerInput, economyConfig: EconomyConfig): Player {
  validateUsername(input.username);
  validateDisplayName(input.displayName);

  const now = (input.now ?? new Date()).toISOString();

  return {
    id: input.id,
    username: input.username,
    displayName: input.displayName.trim(),
    avatarId: input.avatarId ?? null,
    level: 1,
    xp: 0,
    money: economyConfig.newPlayerStartingBalance.money,
    gems: economyConfig.newPlayerStartingBalance.gems,
    reputation: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * FAZ 1 wiring — brief §7 `players.username` UNIQUE. `isUsernameTaken`,
 * infrastructure katmanının (repository) DB'de önceden yaptığı bir
 * sorgunun SONUCUDUR — bu fonksiyon kendisi asla DB'ye erişmez (domain
 * kuralı, bkz. docs/ARCHITECTURE.md §4); `domain/club/club.ts`'teki
 * `joinClub`'ın `playerHasAnyClubMembership: boolean` parametresiyle aynı
 * desen.
 */
export function assertUsernameAvailable(username: string, isUsernameTaken: boolean): void {
  if (isUsernameTaken) {
    throw new UsernameAlreadyTakenError(username);
  }
}
