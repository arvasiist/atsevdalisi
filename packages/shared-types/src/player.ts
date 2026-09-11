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
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/** brief §38 Ana Sayfa "Oyuncu" kartı için minimal görünüm. */
export type PlayerSummary = Pick<Player, 'id' | 'displayName' | 'avatarId' | 'level' | 'xp' | 'money' | 'gems'>;
