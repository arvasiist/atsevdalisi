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

/**
 * brief §7 RaceEntry + §56 RaceSnapshot.
 *
 * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `horseId` artık `UUID |
 * null` ve yeni `botLabel` alanı eklendi: bir satır ya GERÇEK bir ata
 * aittir (`horseId` dolu, `botLabel` null) ya da bir BOTA (`horseId` null,
 * `botLabel` `generateBotEntrants`'ın ürettiği "bot-1" gibi bir etiket) —
 * asla ikisi birden (bkz. `database/migrations/0025_add_race_entry_bot_
 * support.up.sql`'daki CHECK kısıtı, veritabanı seviyesinde de zorunlu
 * kılınır). Öncesinde `horseId` HER ZAMAN dolu bir UUID'ydi çünkü botlar
 * hiç `race_entries`'e yazılmıyordu (bkz. eski `RaceRepository.
 * savePracticeRace` doc yorumu) — tam alan (full-field) replay artık
 * mümkün olduğundan bu ayrım GEREKLİDİR.
 */
export interface RaceEntry {
  id: UUID;
  raceId: UUID;
  horseId: UUID | null;
  /** AUDIT_REPORT.md R2 — bkz. yukarıdaki arayüz doc yorumu. GERÇEK bir at satırı için her zaman null. */
  botLabel: string | null;
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
   * `w_form`). AUDIT_REPORT.md Bulgu R3 (bu oturum) — artık gerçekten
   * `race_entries` geçmişinden türetiliyor (bkz. `apps/api/src/domain/
   * race/entrant-snapshot.ts`'in `deriveFormFromRecentResults` fonksiyonu:
   * son 5 sonuçlanmış yarışın `performanceScore` ortalaması). Bir atın
   * (henüz hiç yarışmamış at, ya da bot) hiç geçmişi yoksa "bilinmiyorsa
   * nötr" ilkesiyle 50 kullanılır — bkz. docs/ALGORITHMS.md §2.
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
 * AUDIT_REPORT.md Bulgu R2 (bu oturum) ÖNCESİNDE bot rakipler `race_entries`'e
 * hiç yazılmıyordu; R2 sonrasında botlar da yazılır (`RaceEntry.botLabel`,
 * bkz. `RaceTimelineEntrantView`) AMA bu sorgunun kendisi `JOIN horses`
 * kullandığından (`horse_id IS NULL` olan bot satırları bir INNER JOIN'de
 * asla eşleşmez) botlar burada OTOMATİK olarak hariç kalmaya devam eder —
 * bu yüzden yalnızca bu oyuncunun kendi pratik yarış geçmişi mevcuttur.
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

/**
 * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`
 * yanıt şekli (docs/API.md). `PracticeRaceResult`'ın AKSİNE (segment YOK,
 * bkz. o tipin doc yorumu), bu uç nokta BİLEREK ham segment telemetrisini
 * DE döner — amacı tam olarak "tam alan (full-field) replay"i DB'den
 * DOĞRUDAN okuyarak sağlamaktır (`simulationSeed` ile yeniden simülasyona
 * ALTERNATİF bir yol, bkz. R2 Fix notu). `horseName` YALNIZCA gerçek at
 * satırları için doludur (`isBot` false); bot satırları için `botLabel`
 * doludur, `horseName`/`horseId` null'dur.
 */
export interface RaceTimelineEntrantView {
  entryId: UUID;
  isBot: boolean;
  horseId: UUID | null;
  horseName: string | null;
  botLabel: string | null;
  tacticalStyle: RacingStyle | null;
  riskLevel: RiskLevel | null;
  /**
   * AUDIT_REPORT.md Bulgu R3 (bu oturum) — başlangıç/kapı numarası (gerçek
   * at yarışlarındaki "gate draw"). `apps/api/src/domain/race/
   * gate-assignment.ts`'in `assignGatePositions`'ı ile deterministik olarak
   * (aynı yarış = aynı çekiliş) atanır — simülasyon TAMAMLANDIKTAN SONRA,
   * motor/denge formüllerinden TAMAMEN BAĞIMSIZ bir isim uzayında. Bu
   * dilimde YARIŞ SONUCUNU etkilemez, yalnızca gerçek/görünür bir "start
   * numarası" sağlar — `race_entries.gate_position` sütunu projenin İLK
   * yarış migration'ından (0006) beri VARDI ama hiç doldurulmuyordu.
   */
  gatePosition: number | null;
  finalTimeMs: number | null;
  finishPosition: number | null;
  performanceScore: number | null;
  segments: RaceSegmentSnapshot[];
}

/** `RaceTimelineEntrantView`'i taşıyan üst seviye yanıt — bkz. o tipin doc yorumu. */
export interface RaceTimelineView {
  raceId: UUID;
  distanceMeters: number;
  surface: RaceSurface;
  weather: RaceWeather;
  simulationSeed: string | null;
  entrants: RaceTimelineEntrantView[];
}

/**
 * `race.roster` WebSocket olayı (bu turda EKLENDİ — bkz.
 * `apps/api/src/api/realtime/race.gateway.ts` doc yorumu "Roster" bölümü,
 * `docs/API.md` §10). Frontend'in F2 WebSocket altyapısına GERÇEK bir
 * tüketici (canlı `/races` akışı) bağlanabilmesi için eksik olan tek
 * parça buydu: `race.telemetry`'nin segmentleri `raceEntryId`'ye göre
 * gruplanır (`race_entries.id` — GERÇEK bir `horseId` DEĞİLDİR, bot
 * satırlarında `horseId` zaten `null`dur), ama istemcinin at isimlerini/
 * "bu benim atım mı" bilgisini gösterebilmesi için `entryId → horseId/
 * horseName/botLabel` eşlemesine ihtiyacı vardır — bu eşleme daha önce
 * hiçbir olayda GÖNDERİLMİYORDU. `RaceTimelineEntrantView`'in bir alt
 * kümesidir (segment/final-sonuç alanları BİLEREK dışarıda bırakıldı —
 * roster yarış BAŞLARKEN bir kez gönderilir, final alanları `race.
 * finished`'te zaten var).
 */
export interface RaceRosterEntrant {
  entryId: UUID;
  isBot: boolean;
  horseId: UUID | null;
  horseName: string | null;
  botLabel: string | null;
  tacticalStyle: RacingStyle | null;
  gatePosition: number | null;
}

/** `race.roster` (sunucu → istemci, `race.subscribe` sonrası TAM OLARAK bir kez) yanıt şekli. */
export interface RaceRosterPayload {
  raceId: UUID;
  entrants: RaceRosterEntrant[];
}

/**
 * `race.finished` WebSocket olayının bir katılımcı satırı — bkz.
 * `apps/api/src/api/realtime/race.gateway.ts`'teki `RaceFinishedPayload`
 * (gateway'in kendi iç arayüzü ile BİREBİR aynı alanlar, burada frontend'in
 * `@at-sevdalisi/shared-types`'tan import edebilmesi için TEKRARLANIR —
 * `RaceJockeyDecision`'daki AYNI gerekçe).
 */
export interface RaceFinishedEntrant {
  horseId: UUID | null;
  horseName: string | null;
  botLabel: string | null;
  isBot: boolean;
  finishPosition: number | null;
  finalTimeMs: number | null;
  performanceScore: number | null;
}

/** `race.finished` (sunucu → istemci, tam olarak bir kez) yanıt şekli. */
export interface RaceFinishedPayload {
  raceId: UUID;
  entrants: RaceFinishedEntrant[];
}

/** `race.telemetry` (sunucu → istemci, ✅ yetkiliyse birden çok kez) yanıt şekli. */
export interface RaceTelemetryPayload {
  raceId: UUID;
  segments: RaceSegmentSnapshot[];
}
