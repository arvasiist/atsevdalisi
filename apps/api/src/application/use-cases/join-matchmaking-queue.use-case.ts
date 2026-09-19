import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  JoinMatchmakingQueueResult,
  MatchmakingTicket,
  Player,
  PvpMatch,
  PvpMatchResult,
  Race,
  RaceEntry,
  RaceSegmentSnapshot,
} from '@at-sevdalisi/shared-types';
import { buildHorseEntrantSnapshot } from '../../domain/race/entrant-snapshot';
import { applyEloUpdate } from '../../domain/online/elo';
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
import { MATCHMAKING_TICKET_REPOSITORY, type MatchmakingTicketRepository } from '../ports/matchmaking-ticket.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

export interface JoinMatchmakingQueueInput {
  horseId: string;
}

/** `RunPracticeRaceUseCase`'in KENDİ sabitleriyle AYNI — bkz. o dosyanın doc yorumu "KAPSAM DIŞI" maddesi; PvP maçları da AYNI gerekçeyle şimdilik sabit zemin/hava/mesafe kullanır. */
const PVP_MATCH_SURFACE = 'grass' as const;
const PVP_MATCH_WEATHER = 'sunny' as const;

interface RatingUpdateResult {
  ownRatingBefore: number;
  ownRatingAfter: number;
  opponentRatingBefore: number;
  opponentRatingAfter: number;
}

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
 * BİLEREK KAPSAM DIŞI bırakılmıştır — bkz. docs/API.md §10 "lobby.update"
 * önerisi, docs/ROADMAP.md.
 *
 * ÖNEMLİ, BİLİNÇLİ SINIRLAMA (bu dilim): kuyrukta ÖNCE bekleyen oyuncu,
 * eşleşme SONRADAN gelen bir oyuncunun `join` isteği İÇİNDE gerçekleşse
 * bile bunu KENDİ BAŞINA öğrenemez — bu dilimde bir status/polling/
 * WebSocket uç noktası YOK (docs/API.md §9'da yalnızca 2 endpoint
 * belgelenmiştir: `POST`/`DELETE /matchmaking/queue`). Rakibin bileti
 * eşleşme anında kuyruktan SİLİNİR, bu yüzden o oyuncu daha sonra tekrar
 * `join` çağırırsa (maçın kendisiyle ilgili hiçbir bilgi almadan) YENİ,
 * bağımsız bir kuyruk girişi başlatmış olur — bu, brief'in gerçek zamanlı
 * bildirim gereksinimini TAM karşılamayan, ama iki oyuncu (neredeyse)
 * eşzamanlı `join` çağırdığında tam çalışan, kademeli bir ilk adımdır
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
 * OLMADAN (bu, `PlayerRepository.updateTwoWithLock` gibi tam bir kilit
 * DEĞİLDİR, o yalnızca Elo YAZIMI için aşağıda AYRICA kullanılır): en
 * iyi rakip saf `findBestMatch` ile SEÇİLDİKTEN sonra, o rakibin bileti
 * `deleteByPlayerId` ile "CLAIM edilmeye ÇALIŞILIR" — `DELETE ...
 * RETURNING` atomik olduğundan, iki oyuncunun EŞZAMANLI olarak AYNI
 * üçüncü rakibi eşleştirmeye çalıştığı nadir durumda yalnızca BİRİ silme
 * işlemini "kazanır" (`true` döner); kaybeden, o rakibi ADAY LİSTESİNDEN
 * çıkarıp KALAN adaylar arasında YENİDEN dener (sınırlı sayıda döngü,
 * aşağıya bkz.). Elo'nun kendisi ise `updateTwoWithLock` İÇİNDE, satırlar
 * KİLİTLİYKEN, en GÜNCEL reytinglerle yeniden hesaplanır
 * (`UpgradeStableUseCase`/`BuyMarketListingUseCase` ile AYNI "hesaplama
 * satır kilitliyken" kuralı, bkz. `PlayerRepository` doc yorumu).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık
 * `@Inject()` ile enjekte edilir.
 */
@Injectable()
export class JoinMatchmakingQueueUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(MATCHMAKING_TICKET_REPOSITORY) private readonly ticketRepository: MatchmakingTicketRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
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
   * simülasyon, SONRA satır-kilitli Elo/DB yazımı" sıralamasıyla AYNI
   * felsefe: `updateTwoWithLock` BAŞARISIZ olursa (normal koşullarda
   * ulaşılmaz) `raceRepository.savePvpMatch` hiç ÇAĞRILMAZ.
   */
  private async playMatch(
    playerId: string,
    horseId: string,
    opponentTicket: MatchmakingTicket,
    now: Date,
  ): Promise<PvpMatchResult> {
    const opponentPlayerId = opponentTicket.playerId;
    const opponentHorseId = opponentTicket.horseId;

    const [horse, stats, opponentHorse, opponentStats] = await Promise.all([
      this.horseRepository.findById(horseId),
      this.horseStatsRepository.findByHorseId(horseId),
      this.horseRepository.findById(opponentHorseId),
      this.horseStatsRepository.findByHorseId(opponentHorseId),
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

    const mySnapshot = buildHorseEntrantSnapshot(horse, stats, DEFAULT_RACE_TACTIC);
    const opponentSnapshot = buildHorseEntrantSnapshot(opponentHorse, opponentStats, DEFAULT_RACE_TACTIC);

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

    // Elo, satırlar KİLİTLİYKEN, EN GÜNCEL reytinglerle hesaplanır (bkz.
    // sınıf üstündeki doc yorumu) — `buyer`/`seller` adları burada
    // `updateTwoWithLock`'un GENEL sözleşmesinden gelir (bkz. o metodun
    // port doc yorumu), parasal bir anlamları YOK.
    const ratingUpdate = await this.playerRepository.updateTwoWithLock<RatingUpdateResult>(
      playerId,
      opponentPlayerId,
      (me, opponent) => {
        const eloResult = applyEloUpdate(me.rating, opponent.rating, scoreA, this.config.online);
        const updatedAt = new Date().toISOString();
        const updatedMe: Player = { ...me, rating: eloResult.ratingA, updatedAt };
        const updatedOpponent: Player = { ...opponent, rating: eloResult.ratingB, updatedAt };
        return {
          buyer: updatedMe,
          seller: updatedOpponent,
          result: {
            ownRatingBefore: me.rating,
            ownRatingAfter: eloResult.ratingA,
            opponentRatingBefore: opponent.rating,
            opponentRatingAfter: eloResult.ratingB,
          },
        };
      },
    );

    if (ratingUpdate === null) {
      // Veri bütünlüğü varsayımı: her iki oyuncu da bu noktaya kadar
      // zaten doğrulandı (bkz. `PlayerRepository.updateTwoWithLock` doc
      // yorumundaki AYNI kategori "ulaşılamaz dal").
      throw new PlayerNotFoundError(playerId);
    }

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
      // `horses` satırlarına sahiptir (bkz. `RaceRepository.savePvpMatch`
      // doc yorumu), bu yüzden `botLabel` burada HER ZAMAN null'dur.
      botLabel: null,
      jockeyId: null,
      gatePosition: null,
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
      gatePosition: null,
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
      playerIds: [playerId, opponentPlayerId],
      simulationSeed: timeline.simulationSeed,
      status: 'finished',
      winnerId,
      createdAt: nowIso,
    };

    await this.raceRepository.savePvpMatch(race, [myEntry, opponentEntry], segments, match);

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
      ownRatingBefore: ratingUpdate.ownRatingBefore,
      ownRatingAfter: ratingUpdate.ownRatingAfter,
      opponentRatingBefore: ratingUpdate.opponentRatingBefore,
      opponentRatingAfter: ratingUpdate.opponentRatingAfter,
    };
  }
}
