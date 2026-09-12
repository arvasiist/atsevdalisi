import type { ISODateTimeString, UUID } from './common';

/**
 * FAZ 7 — Online (brief §41-44, §68-69, ROADMAP.md Faz 7: Matchmaking, PvP,
 * Race rooms, Leaderboards, Clubs, Tournaments, Seasons, Anti-cheat,
 * Server-authoritative simulation).
 *
 * Bu dosya, önceki tüm fazlarda olduğu gibi sadece VERİ ŞEKİLLERİNİ
 * tanımlar; hesaplama mantığı `apps/api/src/domain/{online,ranking,club,
 * tournament,season}/` altındadır (bkz. o klasörlerin README.md'leri).
 */

// ---------------------------------------------------------------------------
// Sıralama (brief §43 SIRALAMA)
// ---------------------------------------------------------------------------

/** brief §43 "Sıralamalar: Global, Türkiye, Arkadaşlar, Kulüp, Sezon, Haftalık, Aylık". */
export type LeaderboardScope = 'global' | 'country' | 'friends' | 'club' | 'season' | 'weekly' | 'monthly';

/**
 * Tek bir sıralama tablosundaki tek bir satır. `scopeKey`, scope'a göre
 * anlam kazanır: `country` için ülke kodu, `club`/`season` için ilgili
 * kulübün/sezonun id'si, `friends` için sıralamayı gören oyuncunun id'si;
 * `global`/`weekly`/`monthly` için `null` (tüm oyuncular tek bir havuzdadır).
 * Sıra (`rank`) DB/hesaplama katmanında `domain/ranking/leaderboard.ts` ile
 * üretilir, bu arayüzde sabit bir alan değildir çünkü aynı ham puan listesi
 * farklı anlarda farklı sıra üretebilir (yeni girişler eklendikçe).
 */
export interface LeaderboardEntry {
  playerId: UUID;
  scope: LeaderboardScope;
  scopeKey: string | null;
  score: number;
  updatedAt: ISODateTimeString;
}

/** `domain/ranking/leaderboard.ts` `buildLeaderboard` çıktısı — sıralanmış ve rank atanmış bir satır. */
export interface RankedLeaderboardEntry extends LeaderboardEntry {
  rank: number;
}

/** brief §43 RankingScore bileşenleri (hesaplama: `domain/ranking/ranking-score.ts`). */
export interface RankingScoreInput {
  /** Bir yarıştaki ham performans puanı (bkz. `RaceFinishEntry.performanceScore`, docs/RACE_ENGINE.md §5). */
  racePerformanceScore: number;
  /** O yarışta 1. olundu mu (brief §43 "WinBonus"). */
  isWin: boolean;
  /** 1 = birinci, 2 = ikinci, ... `null` = dereceye giremedi (bkz. `RankingConfig.placementBonusByPlacement`). */
  placement: number | null;
  /** Bir turnuvadan kazanılan ek bonus (brief §43 "TournamentBonus"), turnuvaya katılım yoksa 0. */
  tournamentBonus: number;
}

// ---------------------------------------------------------------------------
// Kulüp (brief §44 KULÜP)
// ---------------------------------------------------------------------------

/** brief §44'te açıkça listelenmemiş ama "Kulüp sohbeti/görevleri" gibi roller gerektiren bir hiyerarşi zorunludur. */
export type ClubRole = 'leader' | 'officer' | 'member';

/** brief §44 "Kulüp özellikleri": ad, logo, üyeler, seviye, puan, sıralama, sohbet, yarışlar, görevler. */
export interface Club {
  id: UUID;
  name: string;
  tag: string | null;
  logoId: string | null;
  leaderId: UUID;
  /** brief §44 "Kulüp seviyesi" — `domain/club/club.ts` `calculateClubLevel` ile `points`'ten türetilir. */
  level: number;
  /** brief §44 "Kulüp puanı" — üyelerin katkılarının toplamı (bkz. `ClubMembership.contributionPoints`). */
  points: number;
  createdAt: ISODateTimeString;
}

export interface ClubMembership {
  clubId: UUID;
  playerId: UUID;
  role: ClubRole;
  /** Bu üyenin kulübe kattığı toplam puan (brief §44 "Kulüp puanı"nın bileşeni). */
  contributionPoints: number;
  joinedAt: ISODateTimeString;
}

// ---------------------------------------------------------------------------
// Sezon (brief §69 SEZON SİSTEMİ)
// ---------------------------------------------------------------------------

export type SeasonStatus = 'upcoming' | 'active' | 'ended';

/** brief §69 "Her sezon: yarış takvimi, leaderboard, görevler, ödüller, özel turnuvalar içerebilir." */
export interface Season {
  id: UUID;
  name: string;
  startsAt: ISODateTimeString;
  endsAt: ISODateTimeString;
}

/**
 * brief §69 "Sezon reseti oyuncunun tüm ilerlemesini silmemelidir. Sadece
 * sezon skorları resetlenir." — `domain/season/season.ts` `resetSeasonProgress`
 * bu arayüzdeki alanları sıfırlar; `Player`/`Horse` gibi KALICI varlıklar bu
 * arayüzde YOKTUR (onlar hiç dokunulmadan kalır).
 */
export interface PlayerSeasonState {
  playerId: UUID;
  seasonId: UUID;
  seasonRankingScore: number;
  seasonWins: number;
  seasonRacesRun: number;
}

// ---------------------------------------------------------------------------
// Turnuva (brief §35 YARIŞ TAKVİMİ "Özel kupalar/Büyük ödüllü yarışlar" + §68)
// ---------------------------------------------------------------------------

export type TournamentTierName = 'bronze' | 'silver' | 'gold';
export type TournamentStatus = 'registration' | 'in_progress' | 'completed' | 'cancelled';

/** brief §35 RaceTier/EntryRequirement/EntryFee/PrizePool alanlarının turnuva karşılığı. */
export interface Tournament {
  id: UUID;
  name: string;
  tier: TournamentTierName;
  minPlayerLevel: number;
  entryFee: number;
  prizePool: number;
  maxParticipants: number;
  status: TournamentStatus;
  startsAt: ISODateTimeString;
}

export interface TournamentParticipant {
  tournamentId: UUID;
  playerId: UUID;
  horseId: UUID;
  /** `domain/tournament/tournament.ts` `seedTournamentBracket` tarafından atanır (1 = en yüksek reyting). */
  seed: number;
  /** Turnuva bittiğinde final sırası (1 = şampiyon); devam ederken `null`. */
  finalPlacement: number | null;
}

// ---------------------------------------------------------------------------
// Matchmaking & PvP (brief §41 ONLINE MİMARİ, §43 "Elo benzeri sistem")
// ---------------------------------------------------------------------------

/** Bir oyuncunun PvP reytingi (brief §43 "Elo benzeri sistem PvP için ayrıca uygulanabilir"). */
export interface PlayerRating {
  playerId: UUID;
  rating: number;
  matchesPlayed: number;
}

/** Eşleştirme kuyruğuna girmiş, henüz bir maça atanmamış bir bilet. */
export interface MatchmakingTicket {
  playerId: UUID;
  horseId: UUID;
  rating: number;
  queuedAt: ISODateTimeString;
}

export type PvpMatchStatus = 'matched' | 'in_progress' | 'finished' | 'cancelled';

/**
 * brief §41 ONLINE MİMARİ akışının ("Client A/B/C → Race Server → Race
 * Simulation → Race Result → All Clients") server tarafında tuttuğu kayıt.
 * `simulationSeed`, gerçek yarış simülasyonu için `RaceSimulationInput.
 * simulationSeed`'e aynen aktarılır (bkz. `domain/race/race-engine.ts`) —
 * PvP'ye özgü YENİ bir simülasyon motoru YOKTUR, mevcut Race Engine'in
 * server-authoritative bir "oda" (room) içinde çalıştırılmasıdır.
 */
export interface PvpMatch {
  id: UUID;
  playerIds: [UUID, UUID];
  simulationSeed: string;
  status: PvpMatchStatus;
  winnerId: UUID | null;
  createdAt: ISODateTimeString;
}
