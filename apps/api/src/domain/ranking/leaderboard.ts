/**
 * Sıralama tablosu (Leaderboard) — brief §43 "Sıralamalar: Global, Türkiye,
 * Arkadaşlar, Kulüp, Sezon, Haftalık, Aylık". Fonksiyonlar saftır; DB'den
 * hangi kayıtların çekileceği (scope/scopeKey filtresi) application
 * katmanının sorumluluğundadır — bu dosya yalnızca ELİNDEKİ girdi listesini
 * puana göre sıralar ve rank atar.
 */

import type { OnlineConfig } from '@at-sevdalisi/game-config';
import type { LeaderboardEntry, LeaderboardScope, RankedLeaderboardEntry } from '@at-sevdalisi/shared-types';
import { calculateRankingScore } from './ranking-score';

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

/**
 * Tek bir tamamlanmış yarıştaki bir ATIN (ve sahibinin) ham sonucu. Adı
 * bilerek "outcome"dur: bu bir yarış SONUCUDUR, bir sıralama girdisi değil —
 * sıralama girdisine (`LeaderboardEntry`) dönüşüm `sumRankingScores`'un işidir.
 */
export interface PlayerRaceOutcome {
  playerId: string;
  /** Yarış motorunun ürettiği ham performans puanı (bkz. `RankingScoreInput.racePerformanceScore`). */
  performanceScore: number;
  /** 1 = birinci. Bitmemiş bir kayıt buraya HİÇ gelmemelidir (repository süzer). */
  finishPosition: number;
  /** ISO 8601 (UTC) — `LeaderboardEntry.updatedAt` için en son yarışın anı. */
  finishedAt: string;
}

/** Bir oyuncunun TÜM yarışlarından birikmiş sıralama toplamı. */
export interface PlayerRankingTotal {
  playerId: string;
  score: number;
  raceCount: number;
  lastFinishedAt: string;
}

/**
 * Oyuncu başına sıralama puanlarını TOPLAR (brief §43). `LeaderboardEntry.score`
 * tek bir birikimli sayıdır — bu yüzden burada ortalama DEĞİL toplam alınır;
 * ortalama almak "tek bir iyi yarış koşan oyuncu zirveye oturur" sonucunu
 * verirdi ve bunu düzeltmek uydurma bir "en az yarış sayısı" eşiği
 * gerektirirdi (CLAUDE.md "SİHİRLİ SAYI YOK"). Toplam, eşik gerektirmez.
 *
 * Puanın FORMÜLÜ burada YOKTUR: her yarış için `calculateRankingScore`
 * çağrılır, yani kural tek bir kaynakta kalır (`ranking-score.ts` + config).
 * Aynı sebeple `placement` olarak ham `finishPosition` geçilir — "ilk 3'e
 * bonus" eşiği koda GÖMÜLMEZ, `placementBonusByPlacement` tablosunda yaşar;
 * listede olmayan bir derece (örn. 4.) zaten 0 bonus alır.
 *
 * `tournamentBonus` bugün her zaman 0'dır: turnuva sistemi henüz BAĞLI
 * DEĞİL (bkz. PROJE_DURUMU.md §13). Turnuva gelince burası gerçek değeri
 * taşıyacak, formül değişmeyecek.
 */
export function sumRankingScores(outcomes: PlayerRaceOutcome[], config: OnlineConfig): PlayerRankingTotal[] {
  const totals = new Map<string, PlayerRankingTotal>();

  for (const outcome of outcomes) {
    const raceScore = calculateRankingScore(
      {
        racePerformanceScore: outcome.performanceScore,
        isWin: outcome.finishPosition === 1,
        placement: outcome.finishPosition,
        tournamentBonus: 0,
      },
      config,
    );

    const existing = totals.get(outcome.playerId);
    if (existing === undefined) {
      totals.set(outcome.playerId, {
        playerId: outcome.playerId,
        score: raceScore,
        raceCount: 1,
        lastFinishedAt: outcome.finishedAt,
      });
      continue;
    }

    existing.score += raceScore;
    existing.raceCount += 1;
    // ISO 8601 UTC dizgileri sözlük sırasına göre de kronolojiktir
    // (sabit genişlikli, aynı zaman dilimi) — `Date`'e çevirmeye gerek yok.
    if (outcome.finishedAt > existing.lastFinishedAt) {
      existing.lastFinishedAt = outcome.finishedAt;
    }
  }

  return [...totals.values()];
}
