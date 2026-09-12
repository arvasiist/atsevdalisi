/**
 * Elo benzeri PvP reyting sistemi — brief §43 "Elo benzeri sistem PvP için
 * ayrıca uygulanabilir." Standart Elo formülü (bkz. docs/ALGORITHMS.md'ye
 * eklenen not) kullanılır; fonksiyonlar saftır, hiçbir DB/zaman erişimi
 * yoktur.
 */

import type { OnlineConfig } from '@at-sevdalisi/game-config';

/**
 * A oyuncusunun B'ye karşı "beklenen skoru" (0-1 arası bir olasılık).
 * Reytingler eşitse 0.5 döner; A'nın reytingi ne kadar yüksekse 1'e o kadar
 * yaklaşır.
 */
export function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export interface EloMatchResult {
  ratingA: number;
  ratingB: number;
}

/**
 * Bir maç sonucundan sonra iki oyuncunun yeni reytingini hesaplar.
 * `scoreA`: A'nın gerçek sonucu — 1 = A kazandı, 0 = A kaybetti, 0.5 = berabere
 * (brief'te beraberlik yarış bağlamında nadirdir ama formül genel tutulur).
 * Reyting `config.elo.minRating`'in altına düşemez (proje-içi taban, brief'te
 * belirtilmemiş ama negatif/anlamsız reytingi önlemek için gereklidir).
 */
export function applyEloUpdate(
  ratingA: number,
  ratingB: number,
  scoreA: 0 | 0.5 | 1,
  config: OnlineConfig,
): EloMatchResult {
  const expectedA = calculateExpectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;

  const newRatingA = Math.round(ratingA + config.elo.kFactor * (scoreA - expectedA));
  const newRatingB = Math.round(ratingB + config.elo.kFactor * (scoreB - expectedB));

  return {
    ratingA: Math.max(newRatingA, config.elo.minRating),
    ratingB: Math.max(newRatingB, config.elo.minRating),
  };
}
