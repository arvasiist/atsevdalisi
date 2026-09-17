import type { ISODateTimeString, UUID } from './common';
import type { Player } from './player';

/** brief §14.1 Yarış parametreleri */
export type RaceSurface = 'grass' | 'dirt' | 'synthetic';
export type RaceWeather = 'sunny' | 'rainy' | 'windy' | 'cloudy' | 'hot' | 'cold';
export type RaceStatus = 'scheduled' | 'in_progress' | 'finished' | 'cancelled';

/** brief §14.2 Oyuncu kararları */
export type RacingStyle = 'front_runner' | 'tracker' | 'mid_pack' | 'closer';
export type RiskLevel = 'low' | 'normal' | 'high';
export type StartApproach = 'aggressive' | 'balanced' | 'controlled';
export type FinalStretchPlan = 'early_sprint' | 'normal' | 'late_sprint';

export interface Track {
  id: UUID;
  name: string;
  location: string | null;
  lengthMeters: number | null;
  turnCount: number | null;
  trackWidthMeters: number | null;
}

/** brief §7 Race */
export interface Race {
  id: UUID;
  trackId: UUID | null;
  name: string;
  distanceMeters: number;
  surface: RaceSurface;
  weather: RaceWeather;
  temperatureC: number | null;
  windKmh: number | null;
  humidityPct: number | null;
  participantLimit: number;
  entryFee: number;
  prizePool: number;
  startTime: ISODateTimeString;
  status: RaceStatus;
  simulationSeed: string | null;
  /**
   * AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — brief §58 deterministik
   * replay garantisi: aynı `simulationSeed` + aynı `RaceEntrantSnapshot`ler
   * + aynı bu DÖRT sürüm ⇒ HER ZAMAN bit bit aynı `RaceTimeline` (bkz.
   * `domain/race/race-engine.ts` `RACE_ENGINE_VERSION`/`RACE_RULESET_VERSION`
   * doc yorumu, `database/migrations/0021_add_race_versioning.up.sql`).
   * Bu dört alan olmadan, engine/config gelecekte değiştiğinde ESKİ bir
   * yarışın hangi kod/config ile üretildiği bilinemez hale gelirdi.
   *
   * AUDIT_REPORT.md R1 (bu oturum) — `weatherConfigVersion`, `config/
   * weather.config.json`'ın KENDİ sürümüdür (`configVersion`'ın kapsadığı
   * `race.config.json`'dan BAĞIMSIZ) — `getEnvironmentModifier`
   * (`domain/race/environment.ts`) bu dosyayı AKTİF olarak kullanır ve
   * sonucu doğrudan etkiler, bu yüzden AYNI replay/audit gerekçesi (bkz.
   * `database/migrations/0024_add_weather_config_versioning.up.sql`) burada
   * da geçerlidir.
   */
  engineVersion: string;
  rulesetVersion: string;
  configVersion: string;
  weatherConfigVersion: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/** brief §7 RaceEntry + §56 RaceSnapshot */
export interface RaceEntry {
  id: UUID;
  raceId: UUID;
  horseId: UUID;
  jockeyId: UUID | null;
  gatePosition: number | null;
  tacticalStyle: RacingStyle | null;
  riskLevel: RiskLevel | null;
  horseSnapshot: RaceEntrantSnapshot | null;
  finalTimeMs: number | null;
  finishPosition: number | null;
  performanceScore: number | null;
  createdAt: ISODateTimeString;
}

/**
 * brief §14.2 — oyuncunun yarış öncesi taktik seçimleri.
 * `RaceEntrantSnapshot.tactic` ile AYNI şekil — FAZ 1 wiring, sekizinci
 * dilim (Pratik Yarış) burada ADLANDIRILMIŞ bir tip olarak çıkarıldı,
 * çünkü `RunPracticeRaceUseCase`'in girdi tipi de AYNI şekli kullanır.
 */
export interface RaceTacticInput {
  racingStyle: RacingStyle;
  riskLevel: RiskLevel;
  startApproach: StartApproach;
  finalStretchPlan: FinalStretchPlan;
}

/**
 * brief §56 RaceSnapshot — yarış başladığında donmuş, değiştirilemez değerler.
 * Race Engine yalnızca bu veriyi kullanır (docs/RACE_ENGINE.md §3).
 */
export interface RaceEntrantSnapshot {
  horseId: UUID;
  speed: number;
  stamina: number;
  acceleration: number;
  fitness: number;
  fatigue: number;
  health: number;
  morale: number;
  surfaceCompatibility: number;
  distanceCompatibility: number;
  jockeySkillComposite: number;
  /**
   * Son yarışlardaki performansa dayalı "form" değeri (0-100, brief §17
   * `w_form`). Henüz bir form/momentum hesaplama sistemi kurulmadığından
   * (ileride race_entries geçmişinden türetilecek), snapshot üretilirken
   * bilinmiyorsa nötr değer (50) kullanılır — bkz. docs/ALGORITHMS.md §2.
   */
  form: number;
  tactic: RaceTacticInput;
}

/**
 * FAZ 5 — brief §60 jokey AI karar ağacı sonucu (bkz.
 * `domain/race/jockey-decisions.ts`). Burada string literal union olarak
 * TEKRARLANIR (domain katmanındaki `JockeyDecision` ile birebir aynı
 * değerler) çünkü shared-types, `apps/api/src/domain/*`'a bağımlı OLAMAZ
 * (bağımlılık yönü tersine döner) — aynı gerekçe `RacingStyle` gibi diğer
 * union tipler için de geçerlidir.
 */
export type RaceJockeyDecision = 'reduce_pace' | 'push_for_finish' | 'search_overtake_lane' | 'defend_position' | 'hold';

/** brief §24 Race Telemetry / §19 Segment sistemi */
export interface RaceSegmentSnapshot {
  raceEntryId: UUID;
  segmentDistanceMeters: number;
  timestampMs: number;
  positionMeters: number;
  speed: number;
  stamina: number;
  fatigue: number;
  lane: number;
  tacticalState: string;
  currentRank: number;
  /** FAZ 5 — bu segmentte bir geçiş denemesi başarısız olup bloklandı mı (bkz. `domain/race/overtaking.ts`). */
  blocked: boolean;
  /** FAZ 5 — bu segment için jokey AI kararı (bkz. `domain/race/jockey-decisions.ts`). */
  decision: RaceJockeyDecision;
}

/** docs/RACE_ENGINE.md §5 */
export interface RaceFinishEntry {
  horseId: UUID;
  finishTimeMs: number;
  finishPosition: number;
  performanceScore: number;
}

export interface RaceExplanation {
  horseId: UUID;
  positives: string[];
  negatives: string[];
}

export interface RaceTimeline {
  raceId: UUID;
  simulationSeed: string;
  segments: RaceSegmentSnapshot[];
  finalResult: RaceFinishEntry[];
  explanations: RaceExplanation[];
}

/**
 * FAZ 1 wiring, sekizinci dilim — `POST /horses/:id/practice-race`
 * (docs/API.md §4, brief §6 Race Engine) yanıt şekli. `RaceTimeline`'ın
 * TAMAMI değil: `segments` (ham telemetri) BİLEREK dışarıda bırakılır —
 * `race_entry_segments` tablosunun kendi migration yorumu ("Debug/replay
 * için segment telemetrisi; oyuncuya tam olarak gösterilmek zorunda
 * değildir") bu kararın kaynağıdır. `finalResult`/`explanations` TÜM
 * katılımcıları (oyuncunun atı + bot rakipler) içerir, böylece oyuncu
 * kendi sıralamasını görebilir.
 *
 * FAZ 1 wiring, dokuzuncu dilim — `entryFee`/`prizeWon`/`newBalance`
 * eklendi (brief §31 Economy, docs/SECURITY.md §5). Her ikisi de her
 * zaman `'money'` cinsindendir (gem YOK bu akışta — `dailyRewardMoney`/
 * `raceEntryFeeMultiplier` ile AYNI tek-para-birimi kapsamı). `newBalance`,
 * `StableUpgradeResult`/`ClaimDailyRewardResult` ile AYNI `Pick` deseni.
 */
export interface PracticeRaceResult {
  raceId: UUID;
  horseId: UUID;
  distanceMeters: number;
  surface: RaceSurface;
  weather: RaceWeather;
  finalResult: RaceFinishEntry[];
  explanations: RaceExplanation[];
  entryFee: number;
  prizeWon: number;
  newBalance: Pick<Player, 'money' | 'gems'>;
}

/**
 * Faz 2 (görsel kalite planı) — Ana Sayfa "Son Yarış Sonuçları" paneli,
 * `GET /players/:id/recent-races` yanıt şekli (docs/API.md). `races` +
 * `race_entries` tablolarından (migration 0006) OYUNCUNUN KENDİ atlarının
 * sonuçlanmış (finish_position IS NOT NULL) pratik yarışlarını en yeniden
 * eskiye doğru döner.
 *
 * ÖNEMLİ — KAPSAM: bu, "genel/çok oyunculu son kazananlar" akışı DEĞİLDİR.
 * Bot rakipler `race_entries`'e hiç YAZILMAZ (bkz. `RaceRepository.
 * savePracticeRace` doc yorumu — bir bota sahte `horses` satırı açmak
 * kapsam dışı bırakıldı), bu yüzden yalnızca bu oyuncunun kendi pratik
 * yarış geçmişi mevcuttur.
 */
export interface RecentRaceResultView {
  raceId: UUID;
  raceName: string;
  horseId: UUID;
  horseName: string;
  distanceMeters: number;
  surface: RaceSurface;
  finishPosition: number;
  finalTimeMs: number;
  performanceScore: number;
  finishedAt: ISODateTimeString;
}
