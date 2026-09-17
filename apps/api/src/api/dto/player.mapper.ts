import type { Player, PlayerSummary } from '@at-sevdalisi/shared-types';

/**
 * `player.controller.ts`/`auth.controller.ts`'nin PAYLAŞTIĞI `Player` →
 * `PlayerSummary` dönüşümü — `horse.mapper.ts`'teki `toPublicHorse` ile
 * AYNI desen (bkz. o dosyanın doc yorumu). AUDIT_REPORT.md Bulgu S1
 * hardening (bu oturum) — daha önce yalnızca `player.controller.ts`
 * içinde yerel bir fonksiyondu, `AuthController.login`'in de AYNI
 * dönüşüme ihtiyacı olduğundan paylaşılan bir yere taşındı.
 */
export function toPlayerSummary(player: Player): PlayerSummary {
  return {
    id: player.id,
    displayName: player.displayName,
    avatarId: player.avatarId,
    level: player.level,
    xp: player.xp,
    money: player.money,
    gems: player.gems,
  };
}
