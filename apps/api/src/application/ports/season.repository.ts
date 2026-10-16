import type { SeasonInfoView } from '@at-sevdalisi/shared-types';
import type { PlayerRaceRecord } from './leaderboard.repository';

/**
 * Sezon deposu (brief §69, migration 0050). Sezon SKORU tutulmaz — sıralama
 * `findRecordsInWindow`dan türetilir (genel sıralamayla aynı kaynak).
 */
export interface SeasonRepository {
  /**
   * `now`ı kapsayan sezonu döner; yoksa öncekinin bitişinden başlayarak
   * (ilk sezon `now`dan) ardışık sezonlar AÇAR. Eşzamanlı iki çağrı aynı
   * sezonu iki kez açamaz (transaction'a bağlı advisory lock + `number` UNIQUE).
   */
  ensureCurrentSeason(now: Date, durationDays: number): Promise<SeasonInfoView>;
  /** `now`dan önce bitmiş en son sezon (yoksa `null`). */
  findPreviousSeason(now: Date): Promise<SeasonInfoView | null>;
  /** Bitmiş ve ödülü ödenmemiş sezonlar (eskiden yeniye). */
  findUnpaidEndedSeasons(now: Date): Promise<SeasonInfoView[]>;
  /** Yarışı (`races.start_time`) pencere içinde koşulmuş, dereceye girmiş kayıtlar. */
  findRecordsInWindow(startsAt: string, endsAt: string): Promise<PlayerRaceRecord[]>;
  /**
   * **PARA YOLU.** Sezonu `FOR UPDATE` ile kilitler; `rewards_paid_at`
   * doluysa ya da sezon bitmemişse HİÇBİR ŞEY yapmaz (`null`). Aksi hâlde
   * `computePayouts` kilit altında okunan kayıtlarla ödemeleri belirler;
   * her alıcının `players` satırı (id sırasıyla) kilitlenir, bakiye artar,
   * `season_reward` defter satırı ve `rewards_paid_at` AYNI transaction'da
   * yazılır.
   */
  paySeasonRewards(
    seasonId: string,
    now: Date,
    computePayouts: (records: PlayerRaceRecord[]) => Array<{ playerId: string; amount: number }>,
  ): Promise<Array<{ playerId: string; amount: number }> | null>;
}

export const SEASON_REPOSITORY = Symbol('SEASON_REPOSITORY');
