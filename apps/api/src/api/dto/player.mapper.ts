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
    // `username` 28.09.2026'da eklendi — istemci kendi profiline
    // (`/profile/:username`) bağlantı üretebilsin diye. Gerekçe:
    // `shared-types/src/player.ts` `PlayerSummary` doc yorumu.
    username: player.username,
    displayName: player.displayName,
    avatarId: player.avatarId,
    level: player.level,
    xp: player.xp,
    money: player.money,
    gems: player.gems,
    // `isAdmin` 28.09.2026'da eklendi — üst bar yönetim bağlantısını
    // yalnızca yöneticiye çizebilsin diye. Bu bir YETKİ KAPISI DEĞİLDİR:
    // sunucu her istekte `players.is_admin`i yeniden okur ve kararı orada
    // verir. Gerekçe: `shared-types/src/player.ts` `PlayerSummary` doc yorumu.
    isAdmin: player.isAdmin,
    isModerator: player.isModerator,
  };
}
