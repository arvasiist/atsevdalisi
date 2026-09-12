/**
 * Oyuncu (Player) domain fonksiyonları (brief §7, §31, §42). Kayıt akışının
 * kimlik doğrulama sağlayıcısından bağımsız kısmı — yeni hesabın
 * başlangıç durumunu (para, level, xp) belirler.
 */

import type { EconomyConfig } from '@at-sevdalisi/game-config';
import type { Player } from '@at-sevdalisi/shared-types';
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
