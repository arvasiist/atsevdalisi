/**
 * Eşleştirme (Matchmaking) — brief §41 ONLINE MİMARİ, ROADMAP.md Faz 7
 * "Matchmaking". Reyting bazlı, bekleme süresine göre genişleyen bir aralık
 * kullanır (uzun süre eşleşemeyen oyuncu için havuz aşamalı olarak
 * genişler) — brief'te bu genişleme kuralı açıkça belirtilmemiştir, proje-içi
 * standart bir matchmaking tasarım kararıdır (bkz. `OnlineConfig.matchmaking`).
 *
 * Fonksiyonlar saftır: kuyruk YÖNETİMİ (ekleme/çıkarma/DB) application
 * katmanının sorumluluğundadır; bu dosya sadece "verilen bilet listesinde,
 * şu bilet için en iyi rakip kim?" sorusuna saf bir fonksiyonla cevap verir.
 */

import type { OnlineConfig } from '@at-sevdalisi/game-config';
import type { MatchmakingTicket } from '@at-sevdalisi/shared-types';

/** Bir biletin ne kadar süredir kuyrukta olduğuna göre kabul edilen reyting aralığının yarı-genişliği. */
export function calculateRatingRangeAtWait(waitSeconds: number, config: OnlineConfig): number {
  const { initialRatingRangeWidth, rangeExpansionPerSecond, maxRatingRangeWidth } = config.matchmaking;
  const expanded = initialRatingRangeWidth + waitSeconds * rangeExpansionPerSecond;
  return Math.min(expanded, maxRatingRangeWidth);
}

/**
 * `forTicket` için kuyruktaki (`candidates`) en uygun rakibi bulur:
 * reyting farkı, o biletin BEKLEME SÜRESİNE göre izin verilen aralık
 * içinde olan adaylar arasından, reyting farkı EN KÜÇÜK olanı seçer
 * (en adil eşleşme). Aynı `horseId`/`playerId` ile eşleşme yapılamaz
 * (kendi kendine eşleşme brief §41'in "participant validation" ilkesine
 * aykırıdır). Uygun aday yoksa `null` döner (application katmanı bileti
 * kuyrukta bekletmeye devam eder).
 */
export function findBestMatch(
  forTicket: MatchmakingTicket,
  candidates: MatchmakingTicket[],
  config: OnlineConfig,
  now: Date = new Date(),
): MatchmakingTicket | null {
  const waitSeconds = (now.getTime() - new Date(forTicket.queuedAt).getTime()) / 1000;
  const range = calculateRatingRangeAtWait(Math.max(waitSeconds, 0), config);

  let best: MatchmakingTicket | null = null;
  let bestDiff = Infinity;

  for (const candidate of candidates) {
    if (candidate.playerId === forTicket.playerId) {
      continue;
    }
    const diff = Math.abs(candidate.rating - forTicket.rating);
    if (diff <= range && diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }

  return best;
}
