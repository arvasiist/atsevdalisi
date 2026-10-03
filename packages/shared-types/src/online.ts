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

/**
 * `GET /api/v1/leaderboard` yanıtının TEK bir satırı (brief §43 "Global"
 * sıralama). `RankedLeaderboardEntry`'den iki farkı vardır:
 *
 * 1. `displayName` taşır — `LeaderboardEntry` yalnızca `playerId` bilir, ama
 *    bir sıralama tablosunda oyuncu ADI olmadan hiçbir şey gösterilemez.
 *    Ad, `players.display_name`'den gelir (uydurulmaz).
 * 2. `raceCount` taşır — puan birikimli bir TOPLAM olduğu için, 1 yarış koşmuş
 *    bir oyuncu ile 40 yarış koşmuş bir oyuncunun aynı puanda görünmesi
 *    yanıltıcı olurdu. Sayı gösterilerek puan okunabilir hâle gelir.
 *
 * `scope`/`scopeKey` BİLEREK yoktur: bu uç nokta yalnızca `global` kapsamı
 * döner (diğer 6 kapsam — country/friends/club/season/weekly/monthly —
 * bağlı değildir; bkz. PROJE_DURUMU.md §13). Sabit bir alanı her satırda
 * tekrarlamak yerine kapsam uç noktanın kendisiyle bellidir.
 */
export interface LeaderboardRowView {
  /** 1 = zirve. Eşit puanda olanlar AYNI rank'i paylaşır (bkz. `buildLeaderboard`). */
  rank: number;
  playerId: UUID;
  /**
   * Profil rotasının adresi (`/profile/:username`) — `SocialPlayerView.
   * username` ile AYNI gerekçe (29.09.2026, `FINAL_PROJECT_AUDIT.md` §5
   * madde 3): sıralama tablosu başka oyuncuların kimliğini gösteren
   * yüzeylerden biridir ve `displayName` bir URL olamaz. Gizlilik
   * değişikliği DEĞİLDİR — `username` zaten `@Public()` olan
   * `GET /players/profile/:username` ucunun adresidir.
   */
  username: string;
  displayName: string;
  score: number;
  raceCount: number;
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

/** 01.10.2026 — `GET /clubs` satırı ve kulüp başlığı (kulüp sıralaması da budur). */
export interface ClubSummaryView {
  id: UUID;
  name: string;
  tag: string | null;
  level: number;
  points: number;
  /** Sonraki seviye için gereken TOPLAM puan; en üst seviyede `null`. */
  nextLevelPoints: number | null;
  memberCount: number;
  maxMembers: number;
  leaderUsername: string;
  leaderDisplayName: string;
  createdAt: ISODateTimeString;
}

export interface ClubMemberView {
  playerId: UUID;
  username: string;
  displayName: string;
  playerLevel: number;
  role: ClubRole;
  contributionPoints: number;
  joinedAt: ISODateTimeString;
}

/** `GET /clubs/:id` ve `GET /clubs/mine` — `myRole` çağıranın bu kulüpteki rolü (üye değilse `null`). */
export interface ClubDetailView {
  club: ClubSummaryView;
  members: ClubMemberView[];
  myRole: ClubRole | null;
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
/** 01.10.2026 — `GET /seasons/current` (brief §69). */
export interface SeasonInfoView {
  id: UUID;
  number: number;
  name: string;
  startsAt: ISODateTimeString;
  endsAt: ISODateTimeString;
  status: SeasonStatus;
  /** Ödüller ödendiyse damga (yalnızca bitmiş sezonda dolar). */
  rewardsPaidAt: ISODateTimeString | null;
}

export interface SeasonStandingRow extends LeaderboardRowView {
  /** Sezon bitince bu sıranın alacağı ödül (çip); ödülsüz sırada 0. */
  reward: number;
}

export interface SeasonView {
  season: SeasonInfoView;
  standings: SeasonStandingRow[];
  /** Çağıranın sezon satırı; bu sezon hiç yarışmadıysa `null`. */
  me: SeasonStandingRow | null;
  rewardsByRank: number[];
  /** Bir önceki (bitmiş) sezonun ilk üçü — yoksa `null`. */
  previous: { season: SeasonInfoView; podium: SeasonStandingRow[] } | null;
}

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

/**
 * FAZ 1 wiring, on dördüncü dilim (bu oturum) — `POST /matchmaking/queue`
 * (docs/API.md §9) bir eşleşme BULUNDUĞUNDA döndürülen sonuç. Bu dilimin
 * SENKRON tasarımı gereği (bkz. `JoinMatchmakingQueueUseCase` doc yorumu)
 * `PvpMatch.status` burada HER ZAMAN `'finished'`tir — yarış, eşleşme
 * ANINDA, aynı istek içinde simüle edilir (`'matched'`/`'in_progress'`
 * değerleri şemada VAR ama bu dilimde hiç ÜRETİLMEZ, ileride gerçek
 * zamanlı/WebSocket bir akışa geçilirse kullanılabilir).
 */
export interface PvpMatchResult {
  matchId: UUID;
  raceId: UUID;
  opponentPlayerId: UUID;
  opponentHorseId: UUID;
  /** Berabere (`scoreA === 0.5`, bkz. `domain/online/elo.ts`) durumunda `null`. */
  winnerId: UUID | null;
  ownFinishPosition: number;
  ownFinishTimeMs: number;
  opponentFinishPosition: number;
  opponentFinishTimeMs: number;
  ownRatingBefore: number;
  ownRatingAfter: number;
  opponentRatingBefore: number;
  opponentRatingAfter: number;
}

/**
 * `POST /matchmaking/queue` yanıt şekli — bir ayırt edici birlik
 * (discriminated union): eşleşme HEMEN bulunduysa `matched: true` +
 * tam maç sonucu; bulunamadıysa `matched: false` + kuyruğa eklenen
 * bilet (bkz. `domain/online/errors.ts` `NoOpponentFoundError` üstündeki
 * not — "eşleşme yok" burada bir HATA değil, bu birliğin bir dalıdır).
 */
export type JoinMatchmakingQueueResult = { matched: false; ticket: MatchmakingTicket } | { matched: true; match: PvpMatchResult };

/** 02.10.2026 (Faz 11) — haftalık/aylık sıralama (sezonla aynı formül, pencere içinde türetilir). */
export type LeaderboardPeriod = 'weekly' | 'monthly';

export interface PeriodStandingRow {
  rank: number;
  playerId: UUID;
  username: string;
  displayName: string;
  score: number;
  raceCount: number;
}

export interface PeriodLeaderboardView {
  period: LeaderboardPeriod;
  startsAt: ISODateTimeString;
  endsAt: ISODateTimeString;
  standings: PeriodStandingRow[];
  /** Çağıranın satırı (listede olmasa da); hiç yarışmadıysa `null`. */
  me: PeriodStandingRow | null;
}
