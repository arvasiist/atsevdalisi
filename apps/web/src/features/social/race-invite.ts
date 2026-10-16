import type { RaceLobbyListItem } from '@at-sevdalisi/shared-types';

/**
 * 16.10.2026 — yarış daveti seçicisi: sunucunun `checkInviteable` kuralıyla
 * AYNI süzgeç (yalnızca `scheduled` ve başlamamış), katıldığın yarışlar önce,
 * sonra başlangıca göre. Saf; kural yine sunucudadır.
 */
export function invitableRaces(races: readonly RaceLobbyListItem[], now: Date): RaceLobbyListItem[] {
  return races
    .filter((race) => race.status === 'scheduled' && Date.parse(race.startTime) > now.getTime())
    .sort((a, b) => {
      const mine = Number(b.myEntry !== null) - Number(a.myEntry !== null);
      return mine !== 0 ? mine : Date.parse(a.startTime) - Date.parse(b.startTime);
    });
}
