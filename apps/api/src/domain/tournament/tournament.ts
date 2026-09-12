/**
 * Turnuva (Tournament) — brief §35 YARIŞ TAKVİMİ "Özel kupalar / Büyük
 * ödüllü yarışlar" ve §68 "Görevler ve Retention: Tournament". Her turnuva
 * `RaceTier`/`EntryRequirement`/`EntryFee`/`PrizePool` alanlarına sahiptir
 * (brief §35) — burada `tier` + `minPlayerLevel` + `entryFee` + `prizePool`
 * olarak karşılanır (bkz. `Tournament` tipi).
 *
 * Fonksiyonlar saftır; para transferi `domain/economy/wallet.ts`'in
 * sorumluluğundadır (bu dosya sadece uygunluk kontrolü ve ödül DAĞITIM
 * MİKTARLARINI hesaplar, gerçek transferi YAPMAZ — market.ts'teki
 * `purchaseListing`'in aksine, çünkü turnuva ödülü N kazanana aynı anda
 * dağıtılır ve application katmanının N ayrı transfer çağrısı yapması
 * beklenir).
 */

import type { OnlineConfig } from '@at-sevdalisi/game-config';
import type { Tournament, TournamentParticipant } from '@at-sevdalisi/shared-types';
import {
  InsufficientFundsForEntryFeeError,
  PlayerLevelTooLowError,
  TournamentFullError,
  TournamentNotOpenForRegistrationError,
} from './errors';

/**
 * Bir oyuncunun turnuvaya kayıt olma uygunluğunu doğrular (brief §35
 * `EntryRequirement`/`EntryFee`). Geçersizse ilgili hatayı fırlatır.
 */
export function checkTournamentEligibility(
  tournament: Tournament,
  currentParticipantCount: number,
  playerLevel: number,
  playerMoney: number,
): void {
  if (tournament.status !== 'registration') {
    throw new TournamentNotOpenForRegistrationError(tournament.id, tournament.status);
  }
  if (currentParticipantCount >= tournament.maxParticipants) {
    throw new TournamentFullError(tournament.id, tournament.maxParticipants);
  }
  if (playerLevel < tournament.minPlayerLevel) {
    throw new PlayerLevelTooLowError(playerLevel, tournament.minPlayerLevel);
  }
  if (playerMoney < tournament.entryFee) {
    throw new InsufficientFundsForEntryFeeError(tournament.entryFee, playerMoney);
  }
}

/**
 * brief §35/§41 ile tutarlı şekilde, katılımcıları REYTİNGE göre (yüksekten
 * düşüğe) sıralayıp `seed` atar (1 = en yüksek reyting). Eşit reytingde
 * `playerId` alfabetik sırayla belirlenir (deterministic — aynı girdi her
 * zaman aynı bracket'i üretir, brief §18 son madde ile aynı gerekçe).
 * `ratingByPlayerId`'de olmayan oyuncular için `config.elo.initialRating`
 * benzeri bir varsayılan application katmanınca sağlanmalıdır (bu fonksiyon
 * varsayılan reyting ATAMAZ, sadece sıralar).
 */
export function seedTournamentBracket(
  participantPlayerIds: string[],
  ratingByPlayerId: Record<string, number>,
): Array<{ playerId: string; seed: TournamentParticipant['seed'] }> {
  const sorted = [...participantPlayerIds].sort((a, b) => {
    const ratingDiff = (ratingByPlayerId[b] ?? 0) - (ratingByPlayerId[a] ?? 0);
    return ratingDiff !== 0 ? ratingDiff : a.localeCompare(b);
  });

  return sorted.map((playerId, index) => ({ playerId, seed: index + 1 }));
}

export interface PrizeAward {
  playerId: string;
  amount: number;
}

/**
 * brief §35 `PrizePool`'un final sıralamasına (`finalStandingsByPlacement`,
 * index 0 = şampiyon) göre dağıtımı. Sadece `config.tournament.
 * prizeDistributionByPlacement`'te tanımlı dereceler ödül alır (fazla
 * katılımcı ödülsüz kalır — brief'te "Özel kupalar/Büyük ödüllü yarışlar"
 * yalnızca üst sıraları ödüllendirir).
 */
export function distributeTournamentPrizes(
  finalStandingsByPlacement: string[],
  prizePool: number,
  config: OnlineConfig,
): PrizeAward[] {
  const awards: PrizeAward[] = [];

  finalStandingsByPlacement.forEach((playerId, index) => {
    const placement = index + 1;
    const share = config.tournament.prizeDistributionByPlacement[String(placement)];
    if (share !== undefined) {
      awards.push({ playerId, amount: Math.round(prizePool * share) });
    }
  });

  return awards;
}
