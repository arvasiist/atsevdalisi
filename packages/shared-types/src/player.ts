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
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/** brief §38 Ana Sayfa "Oyuncu" kartı için minimal görünüm. */
export type PlayerSummary = Pick<Player, 'id' | 'displayName' | 'avatarId' | 'level' | 'xp' | 'money' | 'gems'>;
