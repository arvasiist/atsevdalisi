import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  JoinMatchmakingQueueResult,
  MatchmakingTicket,
  PvpMatch,
  PvpMatchResult,
  Race,
  RaceEntry,
  RaceSegmentSnapshot,
} from '@at-sevdalisi/shared-types';
import { buildHorseEntrantSnapshot, FORM_SAMPLE_SIZE, type TrackFitInput } from '../../domain/race/entrant-snapshot';
import { assignGatePositions } from '../../domain/race/gate-assignment';
import { findBestMatch } from '../../domain/online/matchmaking';
import { createRaceRoomSeed, validateRaceRoomParticipants } from '../../domain/online/race-room';
import { RACE_ENGINE_VERSION, RACE_RULESET_VERSION, simulateRace } from '../../domain/race/race-engine';
import { DEFAULT_RACE_TACTIC, PRACTICE_RACE_DISTANCE_METERS } from '../../domain/race/validation';
import { HorseInjuredError, HorseNotFoundError } from '../../domain/horse/errors';
import { AlreadyInMatchmakingQueueError } from '../../domain/online/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { HORSE_SURFACE_STATS_REPOSITORY, type HorseSurfaceStatsRepository } from '../ports/horse-surface-stats.repository';
import { HORSE_DISTANCE_STATS_REPOSITORY, type HorseDistanceStatsRepository } from '../ports/horse-distance-stats.repository';
import { LOBBY_NOTIFIER, type LobbyNotifier } from '../ports/lobby-notifier';
import { MATCHMAKING_TICKET_REPOSITORY, type MatchmakingTicketRepository } from '../ports/matchmaking-ticket.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

export interface JoinMatchmakingQueueInput {
  horseId: string;
}

/** `RunPracticeRaceUseCase`'in KENDİ sabitleriyle AYNI — bkz. o dosyanın doc yorumu "KAPSAM DIŞI" maddesi; PvP maçları da AYNI gerekçeyle şimdilik sabit zemin/hava/mesafe kullanır. */
const PVP_MATCH_SURFACE = 'grass' as const;
const PVP_MATCH_WEATHER = 'sunny' as const;

/**
 * `POST /matchmaking/queue` (docs/API.md §9, brief §41 ONLINE MİMARİ).
 *
 * FAZ 1 wiring, ON DÖRDÜNCÜ dilim — `domain/online/{matchmaking,elo,
 * race-room}.ts` FAZ 7'den beri hazır ama hiç wiring edilmemiş saf
 * fonksiyonlardı (bkz. docs/ROADMAP.md); bu dilim onları gerçek DB'ye ve
 * (halihazırda FAZ 5'te doğrulanmış) `simulateRace`'e bağlayan
 * orkestrasyondur — `RunPracticeRaceUseCase`'in FAZ 5'in `simulateRace`'ini
 * ilk kez orkestre etmesiyle AYNI kategori.
 *
 * TASARIM KARARI — TAMAMEN SENKRON eşleştirme: bu projede henüz bir
 * zamanlanmış görev/arka plan işçisi altyapısı YOK (bkz. `domain/market`'in
 * on üçüncü diliminde keşfedilen "sandbox'ta npm registry erişimi yok"
 * kısıtı, docs/ROADMAP.md) — bu yüzden eşleştirme, arka planda sürekli
 * çalışan bir eşleştirici yerine, HER `join` isteğinin KENDİSİ İÇİNDE,
 * senkron olarak dener: uygun bir rakip bileti VARSA yarış HEMEN simüle
 * edilir ve sonuç aynı yanıtla döner; yoksa çağıran oyuncunun kendi
 * bileti kuyruğa eklenir. brief §41'in "Client A/B/C → Race Server →
 * ... → All Clients" akışının GERÇEK ZAMANLI/WebSocket bildirim kısmı
 * ARTIK KISMEN kapsam İÇİNDE — bkz. hemen aşağıdaki "ÖNEMLİ, BİLİNÇLİ
 * SINIRLAMA" notunun GÜNCEL hâli ve `lobby.update`'in kendisi için
 * `api/realtime/race.gateway.ts`'in "`lobby.update`" doc bölümü
 * (docs/API.md §10'da ARTIK `[UYGULANDI]`) — `notification.new` (docs/API.md
 * §10'un diğer önerisi) ise HÂLÂ PLANLI, daha belirsiz/büyük bir kapsam
 * olduğundan bilerek dışarıda bırakıldı (bkz. docs/ROADMAP.md).
 *
 * ÖNEMLİ, BİLİNÇLİ SINIRLAMA (bu dilim, `lobby.update` eklendikten SONRA
 * GÜNCELLENDİ): kuyrukta ÖNCE bekleyen oyuncu, eşleşme SONRADAN gelen bir
 * oyuncunun `join` isteği İÇİNDE gerçekleştiğinde bunu ARTIK öğrenebilir —
 * `playMatch`, DB yazımı TAMAMLANDIKTAN SONRA `LobbyNotifier.notifyMatchFound`
 * ile o oyuncuya `lobby.update` yayınlar (bkz. `race.gateway.ts`). AMA bu
 * BEST-EFFORT'tur, GARANTİ DEĞİL: yalnızca o oyuncunun istemcisi O AN
 * `/races` namespace'ine BAĞLIYKEN çalışır (bkz. `RaceGateway.
 * handleConnection`'ın her istemciyi kendi `player:${playerId}` odasına
 * katması) — bağlantısı yoksa (tarayıcı sekmesi kapalı, ağ kopmuş, henüz
 * hiç bağlanmamış) bildirim SESSİZCE kaybolur, yeni bir kuyruk/yeniden
 * deneme mekanizması YOKTUR. Böyle bir durumda oyuncu HÂLÂ bunu kendi
 * başına öğrenemez ve önceki davranışla AYNI şekilde yeniden `join`/
 * `leave` çağırmak ZORUNDADIR. Rakibin bileti eşleşme anında kuyruktan
 * SİLİNİR, bu yüzden bildirim ULAŞMAZSA o oyuncu daha sonra tekrar `join`
 * çağırırsa (maçın kendisiyle ilgili hiçbir bilgi almadan) YENİ, bağımsız
 * bir kuyruk girişi başlatmış olur — bu, brief'in gerçek zamanlı bildirim
 * gereksinimini TAM garanti ALTINA ALMAYAN (bağlı olmayan istemciler için
 * hâlâ eksik), ama bağlıyken GERÇEKTEN çalışan, kademeli bir adımdır
 * (`RunPracticeRaceUseCase`'in "sabit sayıda bot" kararıyla AYNI ruhta).
 *
 * KAPSAM (bu dilim, bilinçli, sonraki dilimler için bkz. docs/ROADMAP.md):
 *  - Giriş ücreti/ödül YOK — `config/online.config.json`'da
 *    `matchmaking` bölümü hiçbir entry fee tanımlamaz (turnuvaların
 *    AKSİNE) — PvP maçları yalnızca Elo reytingini değiştirir.
 *  - Her iki oyuncu için de SABİT taktik (`DEFAULT_RACE_TACTIC`) ve sabit
 *    zemin/hava/mesafe kullanılır (`RunPracticeRaceUseCase` ile AYNI
 *    KAPSAM DIŞI gerekçesi) — oyuncunun kendi taktiğini seçmesi ayrı bir
 *    dilimi hak eder.
 *  - `matchmaking_tickets`'in bir TTL/temizlik mekanizması YOK — bir
 *    oyuncu kuyruğa girip uygulamayı kapatırsa bileti SÜRESİZ kalır (yeni
 *    bir `join` denemesi `AlreadyInMatchmakingQueueError` ile reddedilir,
 *    önce `DELETE /matchmaking/queue` çağırması gerekir) — At Pazarı
 *    ilanlarının on üçüncü dilimde kazandığı `expiresInHours`/tembel
 *    süpürme deseni burada henüz YOK, ayrı bir sertleştirme dilimini
 *    hak eder.
 *  - `IdempotencyInterceptor` KULLANILMAZ — bu endpoint para/mülkiyet
 *    değiştirmez (yalnızca Elo, brief §54'ün kapsamı DEĞİL); double-submit
 *    riski (aynı oyuncunun neredeyse eşzamanlı iki `join` isteği) bu
 *    dilimde KABUL EDİLMİŞ bir mimari risktir (bkz. `IdempotencyInterceptor`'ın
 *    kendi "BİLİNÇLİ SINIRLAMA" notuyla AYNI kategori) — `matchmaking_tickets.
 *    player_id` PRIMARY KEY olduğundan en kötü ihtimalle bir DB kısıtı
 *    hatası yüzeye çıkar, veri bütünlüğü BOZULMAZ.
 *
 * EŞZAMANLILIK GÜVENLİĞİ — tam bir DB transaction'ı/satır kilitleme
 * OLMADAN (bu, `RaceRepository.savePvpMatchWithRatings`'in KENDİ İÇİNDE
 * yaptığı satır kilitlemesiyle KARIŞTIRILMASIN, bkz. aşağısı): en iyi
 * rakip saf `findBestMatch` ile SEÇİLDİKTEN sonra, o rakibin bileti
 * `deleteByPlayerId` ile "CLAIM edilmeye ÇALIŞILIR" — `DELETE ...
 * RETURNING` atomik olduğundan, iki oyuncunun EŞZAMANLI olarak AYNI
 * üçüncü rakibi eşleştirmeye çalıştığı nadir durumda yalnızca BİRİ silme
 * işlemini "kazanır" (`true` döner); kaybeden, o rakibi ADAY LİSTESİNDEN
 * çıkarıp KALAN adaylar arasında YENİDEN dener (sınırlı sayıda döngü,
 * aşağıya bkz.). Elo'nun kendisi ise `savePvpMatchWithRatings` İÇİNDE,
 * satırlar KİLİTLİYKEN, en GÜNCEL reytinglerle yeniden hesaplanır
 * (`UpgradeStableUseCase`/`BuyMarketListingUseCase` ile AYNI "hesaplama
 * satır kilitliyken" kuralı).
 *
 * AUDIT_REPORT.md Bulgu E1'in PvP analogu (bu oturum) — Elo reyting
 * güncellemesi ile yarış/PvP maç kaydı ARTIK `RaceRepository.
 * savePvpMatchWithRatings` içinde TEK atomik transaction'da yazılır
 * (bkz. o metodun/portun doc yorumu) — `PlayerRepository.updateTwoWithLock`
 * ARTIK bu use-case tarafından KULLANILMAZ (yalnızca `execute()`'taki
 * oyuncu-var-mı kontrolü için `findById` KULLANILMAYA devam eder).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık
 * `@Inject()` ile enjekte edilir.
 */
@Injectable()
export class JoinMatchmakingQueueUseCase {
  private readonly logger = new Logger(JoinMatchmakingQueueUseCase.name);

  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(HORSE_SURFACE_STATS_REPOSITORY) private readonly horseSurfaceStatsRepository: HorseSurfaceStatsRepository,
    @Inject(HORSE_DISTANCE_STATS_REPOSITORY) private readonly horseDistanceStatsRepository: HorseDistanceStatsRepository,
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(MATCHMAKING_TICKET_REPOSITORY) private readonly ticketRepository: MatchmakingTicketRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    // `lobby.update` (bu turda EKLENDİ) — bkz. `race.gateway.ts`'in
    // "`lobby.update`" doc bölümü ve `lobby-notifier.ts`'in doc yorumu.
    @Inject(LOBBY_NOTIFIER) private readonly lobbyNotifier: LobbyNotifier,
  ) {}

  async execute(input: JoinMatchmakingQueueInput): Promise<JoinMatchmakingQueueResult> {
    const horse = await this.horseRepository.findById(input.horseId);
    if (horse === null) {
      throw new HorseNotFoundError(input.horseId);
    }
    if (horse.status === 'injured') {
      throw new HorseInjuredError(input.horseId);
    }

    // `sellerId`nin `horse.ownerId`'den TÜRETİLMESİ (`CreateMarketListingUseCase`
    // ile AYNI desen/gerekçe) — gövdede AYRI bir `playerId` alanı YOK.
    const playerId = horse.ownerId;

    const existingTicket = await this.ticketRepository.findByPlayerId(playerId);
    if (existingTicket !== null) {
      throw new AlreadyInMatchmakingQueueError(playerId);
    }

    const player = await this.playerRepository.findById(playerId);
    if (player === null) {
      // Veri bütünlüğü varsayımı: `horse.ownerId` her zaman var olan bir
      // oyuncuya işaret eder (bkz. AYNI dal `RunPracticeRaceUseCase`).
      throw new PlayerNotFoundError(playerId);
    }

    const now = new Date();
    const myTicket: MatchmakingTicket = {
      playerId,
      horseId: input.horseId,
      rating: player.rating,
      queuedAt: now.toISOString(),
    };

    let candidates = await this.ticketRepository.findAll();

    // bkz. sınıf üstündeki "EŞZAMANLILIK GÜVENLİĞİ" notu — en fazla
    // `candidates.length` kez dener, sonsuz döngü riski YOK.
    for (let attempt = 0; attempt < candidates.length; attempt++) {
      const opponentTicket = findBestMatch(myTicket, candidates, this.config.online, now);
      if (opponentTicket === null) {
        break;
      }

      const claimed = await this.ticketRepository.deleteByPlayerId(opponentTicket.playerId);
      if (claimed) {
        const match = await this.playMatch(playerId, input.horseId, opponentTicket, now);
        return { matched: true, match };
      }

      // Başka bir istek bu bileti bizden ÖNCE aldı — aday listesinden
      // çıkarıp kalanlar arasında yeniden dene.
      candidates = candidates.filter((candidate) => candidate.playerId !== opponentTicket.playerId);
    }

    await this.ticketRepository.save(myTicket);
    return { matched: false, ticket: myTicket };
  }

  /**
   * Bir rakip bileti BAŞARIYLA "claim" edildikten SONRA çağrılır: iki
   * atın snapshot'ını oluşturur, mevcut/doğrulanmış Race Engine'i
   * (`simulateRace`) bir "oda" bağlamında çalıştırır, Elo'yu günceller ve
   * sonucu kalıcı hale getirir. `RunPracticeRaceUseCase`'in "ÖNCE saf
   * simülasyon, SONRA satır-kilitli DB yazımı" sıralamasıyla AYNI felsefe
   * — AUDIT_REPORT.md Bulgu E1'in PvP analogu (bu oturum) DÜZELTİLDİKTEN
   * SONRA: Elo hesaplaması VE yazımı, yarış/PvP maç kaydıyla BİRLİKTE TEK
   * `raceRepository.savePvpMatchWithRatings` çağrısında, TEK atomik
   * transaction'da gerçekleşir (bkz. o metodun/portun doc yorumu) — bu
   * çağrı başarısız olursa reytingler de DB'ye hiç YAZILMAZ.
   */
  private async playMatch(
    playerId: string,
    horseId: string,
    opponentTicket: MatchmakingTicket,
    now: Date,
  ): Promise<PvpMatchResult> {
    const opponentPlayerId = opponentTicket.playerId;
    const opponentHorseId = opponentTicket.horseId;

    // AUDIT_REPORT.md Bulgu R3 (önceki oturum) — `form` alanı artık HER İKİ
    // atın da KENDİ son yarış geçmişinden türetiliyor (bkz.
    // `RunPracticeRaceUseCase`'teki AYNI ekleme/gerekçe) — bu iki sorgu da
    // salt okunur olduğundan mevcut `Promise.all`'a eklenmesi güvenli.
    //
    // R3 — Track Fit (bu turda EKLENDİ) — AYNI gerekçeyle HER İKİ atın
    // surface/distance stat'ları da bu `Promise.all`'a eklendi (bkz.
    // `RunPracticeRaceUseCase`'teki AYNI ekleme).
    const [
      horse,
      stats,
      opponentHorse,
      opponentStats,
      recentResults,
      opponentRecentResults,
      surfaceStats,
      distanceStats,
      opponentSurfaceStats,
      opponentDistanceStats,
    ] = await Promise.all([
      this.horseRepository.findById(horseId),
      this.horseStatsRepository.findByHorseId(horseId),
      this.horseRepository.findById(opponentHorseId),
      this.horseStatsRepository.findByHorseId(opponentHorseId),
      this.raceRepository.findRecentResultsByHorseId(horseId, FORM_SAMPLE_SIZE),
      this.raceRepository.findRecentResultsByHorseId(opponentHorseId, FORM_SAMPLE_SIZE),
      this.horseSurfaceStatsRepository.findByHorseId(horseId),
      this.horseDistanceStatsRepository.findByHorseId(horseId),
      this.horseSurfaceStatsRepository.findByHorseId(opponentHorseId),
      this.horseDistanceStatsRepository.findByHorseId(opponentHorseId),
    ]);

    // Veri bütünlüğü varsayımı: çağıranın kendi atı/statı bu metoda
    // gelmeden HEMEN önce `execute`'ta zaten doğrulandı; rakibin at/stat
    // satırları da (bilet DB'de var OLDUĞUNDAN) normal koşullarda her
    // zaman mevcuttur — `RunPracticeRaceUseCase`'deki AYNI kategori
    // "ulaşılamaz dal" savunması.
    if (horse === null || stats === null) {
      throw new HorseNotFoundError(horseId);
    }
    if (opponentHorse === null || opponentStats === null) {
      throw new HorseNotFoundError(opponentHorseId);
    }

    const raceId = randomUUID();
    const matchId = randomUUID();
    const seed = createRaceRoomSeed(matchId, now);

    // R3 — Track Fit (bu turda EKLENDİ) — bkz. `RunPracticeRaceUseCase`
    // ile AYNI "null dönerse trackFit: null geçilir, ÇÖKMEZ" gerekçesi.
    const myTrackFit: TrackFitInput | null =
      surfaceStats === null || distanceStats === null
        ? null
        : { surfaceStats, distanceStats, surface: PVP_MATCH_SURFACE, distanceMeters: PRACTICE_RACE_DISTANCE_METERS };
    const opponentTrackFit: TrackFitInput | null =
      opponentSurfaceStats === null || opponentDistanceStats === null
        ? null
        : {
            surfaceStats: opponentSurfaceStats,
            distanceStats: opponentDistanceStats,
            surface: PVP_MATCH_SURFACE,
            distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
          };

    const mySnapshot = buildHorseEntrantSnapshot(horse, stats, DEFAULT_RACE_TACTIC, recentResults, myTrackFit);
    const opponentSnapshot = buildHorseEntrantSnapshot(
      opponentHorse,
      opponentStats,
      DEFAULT_RACE_TACTIC,
      opponentRecentResults,
      opponentTrackFit,
    );

    // brief §41 "participant validation" — bkz. `domain/online/race-room.ts`
    // doc yorumu. İki farklı oyuncunun atları eşleştirildiğinden
    // (`findBestMatch` kendi kendine eşleşmeyi zaten engeller) bu dalda
    // normal koşullarda hiçbir hata fırlatılmaz; yine de defense-in-depth
    // ilkesi gereği (`docs/ARCHITECTURE.md` §9.1 Hata 7 ile AYNI ruh)
    // çağrılır.
    validateRaceRoomParticipants([
      { playerId, horseId, snapshot: mySnapshot },
      { playerId: opponentPlayerId, horseId: opponentHorseId, snapshot: opponentSnapshot },
    ]);

    const timeline = simulateRace({
      raceId,
      simulationSeed: seed,
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PVP_MATCH_SURFACE,
      weather: PVP_MATCH_WEATHER,
      temperatureC: null,
      entries: [mySnapshot, opponentSnapshot],
      raceConfig: this.config.race,
      weatherConfig: this.config.weather,
    });

    const myFinish = timeline.finalResult.find((finishEntry) => finishEntry.horseId === horseId);
    const opponentFinish = timeline.finalResult.find((finishEntry) => finishEntry.horseId === opponentHorseId);
    if (myFinish === undefined || opponentFinish === undefined) {
      // `simulateRace` TÜM `entries`'i işler — bu dala normal koşullarda ULAŞILMAZ.
      throw new HorseNotFoundError(horseId);
    }

    // `race-engine.ts`'in `finalResult` sıralaması TAM bir tie-break
    // zinciri içerir (bkz. o dosyanın doc yorumu "Foto-finiş tam
    // berabere") — bu yüzden `finishPosition` PRATİKTE asla eşit
    // çıkmaz; `scoreA`/`winnerId` yine de genel/güvenli biçimde yazılır.
    const scoreA: 0 | 0.5 | 1 =
      myFinish.finishPosition === opponentFinish.finishPosition
        ? 0.5
        : myFinish.finishPosition < opponentFinish.finishPosition
          ? 1
          : 0;
    const winnerId = scoreA === 0.5 ? null : scoreA === 1 ? playerId : opponentPlayerId;

    // AUDIT_REPORT.md Bulgu R3 (bu oturum) — bkz. `RunPracticeRaceUseCase`
    // ile AYNI gerekçe (`gate-assignment.ts` doc yorumu).
    const gatePositionByLabel = assignGatePositions([horseId, opponentHorseId], timeline.simulationSeed, raceId);

    const nowIso = now.toISOString();
    const race: Race = {
      id: raceId,
      trackId: null,
      name: 'PvP Eşleşmesi',
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PVP_MATCH_SURFACE,
      weather: PVP_MATCH_WEATHER,
      temperatureC: null,
      windKmh: null,
      humidityPct: null,
      participantLimit: 2,
      entryFee: 0,
      prizePool: 0,
      startTime: nowIso,
      status: 'finished',
      simulationSeed: timeline.simulationSeed,
      // AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — bkz. `RunPracticeRaceUseCase`
      // ile AYNI desen, `race-engine.ts` doc yorumu.
      engineVersion: RACE_ENGINE_VERSION,
      rulesetVersion: RACE_RULESET_VERSION,
      configVersion: this.config.race.version,
      // AUDIT_REPORT.md R1 (bu oturum) — bkz. `Race.weatherConfigVersion` doc yorumu.
      weatherConfigVersion: this.config.weather.version,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const myEntry: RaceEntry = {
      id: randomUUID(),
      raceId,
      horseId,
      // AUDIT_REPORT.md R2 (bu oturum) — PvP'de HER İKİ taraf da gerçek
      // `horses` satırlarına sahiptir (bkz. `RaceRepository.
      // savePvpMatchWithRatings` doc yorumu), bu yüzden `botLabel` burada
      // HER ZAMAN null'dur.
      botLabel: null,
      jockeyId: null,
      gatePosition: gatePositionByLabel.get(horseId) ?? null,
      tacticalStyle: DEFAULT_RACE_TACTIC.racingStyle,
      riskLevel: DEFAULT_RACE_TACTIC.riskLevel,
      horseSnapshot: mySnapshot,
      finalTimeMs: myFinish.finishTimeMs,
      finishPosition: myFinish.finishPosition,
      performanceScore: myFinish.performanceScore,
      createdAt: nowIso,
    };
    const opponentEntry: RaceEntry = {
      id: randomUUID(),
      raceId,
      horseId: opponentHorseId,
      botLabel: null,
      jockeyId: null,
      gatePosition: gatePositionByLabel.get(opponentHorseId) ?? null,
      tacticalStyle: DEFAULT_RACE_TACTIC.racingStyle,
      riskLevel: DEFAULT_RACE_TACTIC.riskLevel,
      horseSnapshot: opponentSnapshot,
      finalTimeMs: opponentFinish.finishTimeMs,
      finishPosition: opponentFinish.finishPosition,
      performanceScore: opponentFinish.performanceScore,
      createdAt: nowIso,
    };

    const segments: RaceSegmentSnapshot[] = timeline.segments.map((segment) => ({
      ...segment,
      raceEntryId: segment.raceEntryId === horseId ? myEntry.id : opponentEntry.id,
    }));

    const match: PvpMatch = {
      id: matchId,
      // `match.playerIds[0]` HER ZAMAN çağıranın kendi playerId'sidir —
      // `RaceRepository.savePvpMatchWithRatings`'in "A" tarafı (bkz. o
      // portun doc yorumu) BU SIRAYA dayanır (`scoreA` da çağıranın
      // skorudur, yukarıda hesaplandı).
      playerIds: [playerId, opponentPlayerId],
      simulationSeed: timeline.simulationSeed,
      status: 'finished',
      winnerId,
      createdAt: nowIso,
    };

    // AUDIT_REPORT.md Bulgu E1'in PvP analogu (bu oturum) — Elo reyting
    // güncellemesi ile yarış/PvP maç kaydı ARTIK TEK atomik transaction'da
    // (bkz. `RaceRepository.savePvpMatchWithRatings` doc yorumu) — biri
    // başarısız olursa `withTransaction` İKİSİNİ DE (reytingler dahil)
    // rollback eder.
    const ratingUpdate = await this.raceRepository.savePvpMatchWithRatings({
      race,
      entries: [myEntry, opponentEntry],
      segments,
      match,
      scoreA,
      onlineConfig: this.config.online,
    });

    // `lobby.update` (bu turda EKLENDİ) — bkz. `race.gateway.ts`'in
    // "`lobby.update`" doc bölümü. DB yazımı YUKARIDA ZATEN TAMAMLANDI —
    // bu bildirim, ZATEN kuyrukta bekleyen `opponentPlayerId`'ye (ÇAĞIRANIN
    // rakibi) KENDİ perspektifinden bir `PvpMatchResult` gönderir, bu
    // yüzden aşağıdaki `own`/`opponent` alanları, bu metodun EN ALTTA
    // ÇAĞIRANA döndürdüğü objeye göre TERS çevrilmiştir: `ownFinishPosition`
    // ↔ `opponentFinishPosition`, `ownRatingBefore/After` ↔
    // `opponentRatingBefore/After`. Reyting tarafı için `RaceRepository.
    // savePvpMatchWithRatings`'in "A"/"B" eşlemesi (bkz. o portun doc
    // yorumu, `SavePvpMatchWithRatingsInput` üstündeki not): `match.playerIds`
    // HER ZAMAN `[playerId (ÇAĞIRAN, A), opponentPlayerId (B)]` sırasıyla
    // doldurulur (yukarıdaki `match` nesnesi) — yani `ratingUpdate.
    // ratingABefore/AAfter` ÇAĞIRANIN (bu metodun `return`'ünde `own*`
    // olarak kullanılan) reytingidir, `ratingUpdate.ratingBBefore/BAfter`
    // İSE `opponentPlayerId`'nin (BURADA bildirim ALACAK tarafın)
    // reytingidir — bu yüzden `opponentResult.ownRatingBefore/After`
    // `ratingBBefore/BAfter`'DAN, `opponentResult.opponentRatingBefore/After`
    // İSE `ratingABefore/AAfter`'DAN okunur (aşağıdaki gibi TAM TERSİ).
    // `winnerId`/`matchId`/`raceId` MUTLAK (bir taraf değil, bir oyuncu
    // id'sine/kayda işaret eder) — DEĞİŞMEZ. `opponentPlayerId`/
    // `opponentHorseId` bu YENİ objede ÇAĞIRANIN kendi `playerId`/`horseId`'sidir
    // (alıcının rakibi artık ÇAĞIRANDIR).
    const opponentResult: PvpMatchResult = {
      matchId,
      raceId,
      opponentPlayerId: playerId,
      opponentHorseId: horseId,
      winnerId,
      ownFinishPosition: opponentFinish.finishPosition,
      ownFinishTimeMs: opponentFinish.finishTimeMs,
      opponentFinishPosition: myFinish.finishPosition,
      opponentFinishTimeMs: myFinish.finishTimeMs,
      ownRatingBefore: ratingUpdate.ratingBBefore,
      ownRatingAfter: ratingUpdate.ratingBAfter,
      opponentRatingBefore: ratingUpdate.ratingABefore,
      opponentRatingAfter: ratingUpdate.ratingAAfter,
    };
    try {
      this.lobbyNotifier.notifyMatchFound(opponentPlayerId, opponentResult);
    } catch (error) {
      // BEST-EFFORT bir yan kanal — bkz. `lobby-notifier.ts` doc yorumu.
      // Burada oluşabilecek HERHANGİ bir hata (normal koşullarda
      // `RaceGateway.notifyMatchFound`'un kendisi hiç fırlatmaz, ama
      // savunmacı bir sınır) ASLA bu use-case'in ANA sonucunu (DB yazımı
      // ZATEN TAMAMLANDI, aşağıda döndürülür) etkilememeli/yeniden
      // fırlatılmamalıdır.
      this.logger.error(
        `notifyMatchFound başarısız oldu (playerId=${opponentPlayerId}, matchId=${matchId}) — ana akış ETKİLENMEDİ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      matchId,
      raceId,
      opponentPlayerId,
      opponentHorseId,
      winnerId,
      ownFinishPosition: myFinish.finishPosition,
      ownFinishTimeMs: myFinish.finishTimeMs,
      opponentFinishPosition: opponentFinish.finishPosition,
      opponentFinishTimeMs: opponentFinish.finishTimeMs,
      ownRatingBefore: ratingUpdate.ratingABefore,
      ownRatingAfter: ratingUpdate.ratingAAfter,
      opponentRatingBefore: ratingUpdate.ratingBBefore,
      opponentRatingAfter: ratingUpdate.ratingBAfter,
    };
  }
}
