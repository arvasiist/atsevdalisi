import type { ISODateTimeString, UUID } from './common';

/** brief §7 Player */
export interface Player {
  id: UUID;
  username: string;
  displayName: string;
  avatarId: string | null;
  level: number; // 1-50, bkz. brief §36
  xp: number;
  money: number;
  gems: number;
  reputation: number;
  /**
   * Ahır seviyesi (brief §32). `database/migrations/
   * 0012_create_staff_and_stable_level.up.sql` — her oyuncunun TEK bir
   * ahırı vardır (ayrı bir `stables` tablosu yok), bu yüzden seviye
   * doğrudan `players` üzerinde tutulur (bkz. `domain/stable/stable.ts`).
   */
  stableLevel: number;
  /**
   * FAZ 1 wiring, yedinci dilim — Günlük Ödül (brief §37). `null` = hiç
   * talep edilmemiş. `stableLevel` ile AYNI gerekçeyle doğrudan `Player`
   * üzerinde tutulur (gizli/dar bir görünüm gerektiren `horse_health`
   * alanlarının AKSİNE, bu basit bir bookkeeping alanıdır).
   */
  lastDailyRewardClaimedAt: ISODateTimeString | null;
  /**
   * FAZ 1 wiring, on dördüncü dilim (bu oturum) — brief §43 "Elo benzeri
   * sistem PvP için ayrıca uygulanabilir" (bkz. `domain/online/elo.ts`).
   * `stableLevel`/`lastDailyRewardClaimedAt` ile AYNI gerekçeyle doğrudan
   * `Player` üzerinde tutulur (ayrı bir `PlayerRating` tablosu/aggregate'i
   * YOK — `packages/shared-types/src/online.ts`'teki `PlayerRating`
   * arayüzü FAZ 7'den beri TASLAKTA duruyordu ama hiç kullanılmadı; bu
   * dilim onun yerine `Player.rating`'i tercih etti, çünkü `matchesPlayed`
   * alanı henüz hiçbir yerde tüketilmiyor ve tek-alanlı bir genişletme
   * daha az mimari karmaşıklık taşıyor — bkz. `domain/online/README.md`).
   * Yeni oyuncular `config/online.config.json` → `elo.initialRating` ile
   * başlar (bkz. `domain/player/player.ts` `createNewPlayer`).
   */
  rating: number;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/** brief §38 Ana Sayfa "Oyuncu" kartı için minimal görünüm. */
export type PlayerSummary = Pick<Player, 'id' | 'displayName' | 'avatarId' | 'level' | 'xp' | 'money' | 'gems'>;
