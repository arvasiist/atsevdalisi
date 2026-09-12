/**
 * Sıralama tablosu (Leaderboard) — brief §43 "Sıralamalar: Global, Türkiye,
 * Arkadaşlar, Kulüp, Sezon, Haftalık, Aylık". Fonksiyonlar saftır; DB'den
 * hangi kayıtların çekileceği (scope/scopeKey filtresi) application
 * katmanının sorumluluğundadır — bu dosya yalnızca ELİNDEKİ girdi listesini
 * puana göre sıralar ve rank atar.
 */

import type { LeaderboardEntry, LeaderboardScope, RankedLeaderboardEntry } from '@at-sevdalisi/shared-types';

/**
 * Girdileri puana göre (yüksekten düşüğe) sıralar ve "standart yarışma
 * sıralaması" (1224 — eşit puanlılar aynı rank'i paylaşır, bir sonraki
 * rank atlanan sıra sayısı kadar ileri gider) ile `rank` atar. Bu, brief'te
 * belirtilmemiş ama sıralama tablolarında evrensel olarak kullanılan
 * standart bir yöntemdir (aynı puana sahip iki oyuncu aynı sırada
 * gösterilmelidir, biri keyfi olarak öne alınmamalıdır).
 */
export function buildLeaderboard(entries: LeaderboardEntry[]): RankedLeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score);

  const ranked: RankedLeaderboardEntry[] = [];
  let lastScore: number | null = null;
  let lastRank = 0;

  sorted.forEach((entry, index) => {
    const rank = entry.score === lastScore ? lastRank : index + 1;
    lastScore = entry.score;
    lastRank = rank;
    ranked.push({ ...entry, rank });
  });

  return ranked;
}

/** Belirli bir scope + scopeKey'e ait girdileri filtreler (brief §43'teki 7 sıralama türünün her biri için tek bir sorgu deseni). */
export function filterLeaderboardByScope(
  entries: LeaderboardEntry[],
  scope: LeaderboardScope,
  scopeKey: string | null = null,
): LeaderboardEntry[] {
  return entries.filter((entry) => entry.scope === scope && entry.scopeKey === scopeKey);
}

/** Bir oyuncunun belirli bir sıralanmış tablodaki (varsa) satırını bulur — brief §38 "Ana Sayfa" gibi ekranlarda "senin sıran" gösterimi için. */
export function findPlayerRank(ranked: RankedLeaderboardEntry[], playerId: string): RankedLeaderboardEntry | null {
  return ranked.find((entry) => entry.playerId === playerId) ?? null;
}
