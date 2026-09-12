/**
 * Sezon (Season) — brief §69 SEZON SİSTEMİ: "Her sezon: yarış takvimi,
 * leaderboard, görevler, ödüller, özel turnuvalar içerebilir. Sezon reseti
 * oyuncunun tüm ilerlemesini silmemelidir. Sadece sezon skorları
 * resetlenir."
 *
 * Fonksiyonlar saftır; DB/zaman erişimi yoktur. `PlayerSeasonState`
 * (bkz. `packages/shared-types/src/online.ts`) KASITLI olarak `Player`den
 * AYRI bir arayüzdür — bu ayrım brief'in "sadece sezon skorları resetlenir"
 * kuralını tip seviyesinde garanti eder: `resetSeasonProgress` `Player`
 * nesnesine hiç erişemez, dolayısıyla onu YANLIŞLIKLA sıfırlayamaz.
 */

import type { PlayerSeasonState, Season, SeasonStatus } from '@at-sevdalisi/shared-types';

/** Bir sezonun şu andaki durumunu (brief'te örtük — takvim tarihlerinden türetilir) hesaplar. */
export function getSeasonStatus(season: Season, now: Date = new Date()): SeasonStatus {
  const nowMs = now.getTime();
  const startsAtMs = new Date(season.startsAt).getTime();
  const endsAtMs = new Date(season.endsAt).getTime();

  if (nowMs < startsAtMs) {
    return 'upcoming';
  }
  if (nowMs >= endsAtMs) {
    return 'ended';
  }
  return 'active';
}

/**
 * brief §69: yeni sezon başladığında oyuncunun sezon-kapsamlı skorlarını
 * (sıralama puanı, sezon galibiyeti, sezon yarış sayısı) sıfırlar; bu
 * fonksiyon `Player.level`/`Player.money`/`Horse.*` gibi KALICI alanlara
 * DOKUNMAZ (çünkü onlar bu arayüzde yer almaz — tip seviyesinde güvence).
 */
export function resetSeasonProgress(playerId: string, newSeasonId: string): PlayerSeasonState {
  return {
    playerId,
    seasonId: newSeasonId,
    seasonRankingScore: 0,
    seasonWins: 0,
    seasonRacesRun: 0,
  };
}

/** Bir yarış sonucunu sezon istatistiklerine ekler (RankingScore hesaplaması `domain/ranking/ranking-score.ts`'e aittir, burada sadece BİRİKTİRME yapılır). */
export function applySeasonRaceResult(
  state: PlayerSeasonState,
  rankingScoreGained: number,
  isWin: boolean,
): PlayerSeasonState {
  return {
    ...state,
    seasonRankingScore: state.seasonRankingScore + rankingScoreGained,
    seasonWins: state.seasonWins + (isWin ? 1 : 0),
    seasonRacesRun: state.seasonRacesRun + 1,
  };
}

/** brief §69 `season.durationDays`'e göre bir sonraki sezonun bitiş tarihini hesaplar (yeni sezon oluşturma akışı için yardımcı). */
export function calculateSeasonEndDate(startsAt: Date, durationDays: number): Date {
  return new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
}
