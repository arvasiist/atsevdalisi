import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Player, PracticeRaceResult, Race, RaceEntry, RaceSegmentSnapshot, RaceTacticInput } from '@at-sevdalisi/shared-types';
import { generateBotEntrants } from '../../domain/race/bot-generator';
import { buildHorseEntrantSnapshot } from '../../domain/race/entrant-snapshot';
import { applyPracticeRaceStakes, getPracticeRaceEntryFee, getPracticeRacePrize } from '../../domain/race/prize';
import { simulateRace } from '../../domain/race/race-engine';
import { PRACTICE_RACE_BOT_COUNT, PRACTICE_RACE_DISTANCE_METERS } from '../../domain/race/validation';
import { HorseInjuredError, HorseNotFoundError } from '../../domain/horse/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

export interface RunPracticeRaceInput {
  tactic: RaceTacticInput;
}

/** Bu dilimde SABİT bir zemin/hava kullanılır — bkz. use-case doc yorumu "KAPSAM DIŞI" maddesi. */
const PRACTICE_RACE_SURFACE = 'grass' as const;
const PRACTICE_RACE_WEATHER = 'sunny' as const;

/**
 * `POST /horses/{id}/practice-race` (docs/API.md §4, brief §6 Race
 * Engine, §75 MVP kriteri "temel yarış motoru çalışıyor").
 *
 * FAZ 1 wiring, SEKİZİNCİ dilim — önceki yedi dilimden (Player/Horse/Ahır
 * Özeti/Antrenman/Bakım/Ahır Yükseltme/Günlük Ödül) FARKLI bir zorluk:
 * Race Engine'in kendisi (`domain/race/race-engine.ts`, `simulateRace`)
 * zaten FAZ 5'te yazılıp test edilmişti (bkz. `race-engine.spec.ts`), ama
 * onu ÇAĞIRACAK hiçbir orkestrasyon (bir `Horse`'u `RaceEntrantSnapshot`'a
 * çevirme, rakip üretme, sonucu DB'ye yazma) yoktu — bu dilim bu boşluğu
 * dolduruyor.
 *
 * KAPSAM (bu dilim, bilinçli — sonraki dilimler için bkz. docs/ROADMAP.md):
 *  - Gerçek çok oyunculu eşleştirme/zamanlanmış yarışlar (FAZ 7
 *    Matchmaking) YOK — oyuncunun atı sabit sayıda (`PRACTICE_RACE_BOT_COUNT`)
 *    deterministik yapay zeka rakibe karşı SOLO yarışır. Botlar gerçek
 *    `horses` satırları DEĞİLDİR, `race_entries`'e AYRI satır olarak
 *    YAZILMAZLAR (bkz. `RaceRepository.savePracticeRace` doc yorumu).
 *  - Sabit zemin (grass) + hava (sunny) + mesafe (1600m) kullanılır —
 *    gerçek pist/program seçimi (`tracks` tablosu, `Race.trackId`) henüz
 *    wiring edilmedi.
 *  - `jockeySkillComposite`/`surfaceCompatibility`/`distanceCompatibility`
 *    nötr (50) — bkz. `domain/race/entrant-snapshot.ts` üstündeki
 *    "BULUNAN ama KAPSAM DIŞI" notu (horse_surface_stats/horse_distance_stats
 *    tabloları var ama hiç doldurulmuyor).
 *  - Yarışın atın health/fitness/fatigue/morale'ini etkilemesi YOK
 *    (Antrenman'ın kendi ilk diliminde `energy`/`morale`'i BİLİNÇLİ
 *    olarak dışarıda bıraktığı gerekçeyle AYNI — domain algoritmaları
 *    ileride genişlerse buraya yansıtılabilir).
 *  - `race_entry_segments` (telemetri) yalnızca OYUNCUNUN atı için
 *    yazılır — botlar için DB satırı yok, bu yüzden telemetrileri de yok.
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık
 * `@Inject()` ile enjekte edilir.
 *
 * FAZ 1 wiring, DOKUZUNCU dilim — giriş ücreti + ödül eklendi (brief §31
 * Economy, docs/SECURITY.md §5). Sıralama BİLEREK şöyledir: ÖNCE
 * `simulateRace` (SAF, hiçbir yan etkisi yok) çalıştırılır, SONRA tek bir
 * `PlayerRepository.updateWithLock` çağrısı İÇİNDE `domain/race/prize.ts`
 * `applyPracticeRaceStakes` ile hem giriş ücreti `debit` edilir HEM DE
 * sonuca göre ödül `credit` edilir (`UpgradeStableUseCase` ile AYNI
 * "hesaplama satır kilitliyken" kuralı — bkz. `PlayerRepository`
 * doc yorumundaki "stale değer" uyarısı). BULUNAN HATA (CI, bu oturum):
 * bu mantık başta doğrudan burada, `credit(afterEntryFee, prizeWon, ...)`
 * olarak yazılmıştı — ödül tablosunun son sırası BİLEREK 0 olduğundan
 * (`prize.ts`), son sırayı bitiren her oyuncu `wallet.ts`nin sıfır
 * miktarı reddeden kuralına takılıp `500` alıyordu; `applyPracticeRaceStakes`e
 * çıkarılıp sıfır miktarda `credit`/`debit`'in hiç ÇAĞRILMAMASI sağlanarak
 * düzeltildi (bkz. o fonksiyonun doc yorumu). Bakiye güncellemesi
 * BAŞARISIZ olursa (`InsufficientFundsError`) transaction ROLLBACK olur
 * VE `raceRepository.savePracticeRace` hiç ÇAĞRILMAZ — yarış hiç
 * "olmamış" sayılır, ne para alınır ne de DB'ye yazılır. Bu, bu projenin
 * PARA/mülkiyet değiştiren İKİNCİ use-case'idir (`UpgradeStableUseCase`den
 * sonra) ve brief §54'ün Idempotency-Key + Redis altyapısının GERÇEK ev
 * sahibidir (Günlük Ödül/Ahır Yükseltme'de bilinçli ertelenmişti) —
 * BUNUNLA BİRLİKTE idempotency kontrolünün KENDİSİ burada DEĞİL, API
 * katmanında (`api/idempotency/idempotency.interceptor.ts`) uygulanır;
 * bu use-case'in tekrar (retry) güvenliği bilmesine GEREK YOKTUR — bkz.
 * docs/ARCHITECTURE.md §4 katman ayrımı.
 *
 * KAPSAM (bilinçli, dokuzuncu dilim): giriş ücreti + ödül SADECE
 * `money`'dir (gem YOK); ödül tablosu (`prizeByFinishPosition`) sabit ve
 * önceden belirlenmiştir, GERÇEK bir çok-oyunculu ödül havuzu DEĞİLDİR
 * (bkz. `domain/race/prize.ts` doc yorumu) — botlar para yatırmaz.
 * Ahır Yükseltme'nin KENDİ endpoint'i hâlâ Idempotency-Key KORUMASI
 * OLMADAN çalışıyor (bkz. docs/ROADMAP.md "FAZ 1 wiring — Dokuzuncu
 * dilim" — bilinçli olarak bu dilimin kapsamı DIŞINDA bırakıldı, ayrı
 * bir sertleştirme dilimini hak ediyor).
 */
@Injectable()
export class RunPracticeRaceUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string, input: RunPracticeRaceInput): Promise<PracticeRaceResult> {
    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }
    if (horse.status === 'injured') {
      throw new HorseInjuredError(horseId);
    }

    const stats = await this.horseStatsRepository.findByHorseId(horseId);
    if (stats === null) {
      // Veri bütünlüğü varsayımı: her at `save()` sırasında bir
      // `horse_stats` satırıyla birlikte yaratılır — bkz. AYNI dal
      // `TrainHorseUseCase`'de.
      throw new HorseNotFoundError(horseId);
    }

    const raceId = randomUUID();
    const playerEntrant = buildHorseEntrantSnapshot(horse, stats, input.tactic);
    const botEntrants = generateBotEntrants(PRACTICE_RACE_BOT_COUNT, raceId);

    const timeline = simulateRace({
      raceId,
      simulationSeed: raceId,
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PRACTICE_RACE_SURFACE,
      weather: PRACTICE_RACE_WEATHER,
      temperatureC: null,
      entries: [playerEntrant, ...botEntrants],
      raceConfig: this.config.race,
      weatherConfig: this.config.weather,
    });

    const playerFinish = timeline.finalResult.find((finishEntry) => finishEntry.horseId === horseId);
    if (playerFinish === undefined) {
      // simulateRace TÜM `entries`'i işler ve her biri için bir
      // `RaceFinishEntry` üretir — bu dala normal koşullarda ULAŞILMAZ.
      throw new HorseNotFoundError(horseId);
    }

    // BİLEREK satır kilitliyken (callback İÇİNDE) hesaplanır — bkz. bu
    // sınıfın üstündeki doc yorumu ve `UpgradeStableUseCase`'deki AYNI
    // desen. `simulateRace` (yukarıda) ZATEN çalıştı — burada sadece
    // sonucuna göre bakiye güncellenir, yeniden simüle EDİLMEZ.
    const entryFee = getPracticeRaceEntryFee(this.config.economy);
    const prizeWon = getPracticeRacePrize(playerFinish.finishPosition, this.config.economy);
    const walletResult = await this.playerRepository.updateWithLock(horse.ownerId, (player) => {
      const afterStakes = applyPracticeRaceStakes({ money: player.money, gems: player.gems }, entryFee, prizeWon);

      const updated: Player = {
        ...player,
        money: afterStakes.money,
        gems: afterStakes.gems,
        updatedAt: new Date().toISOString(),
      };

      return { player: updated, result: afterStakes };
    });

    if (walletResult === null) {
      // Veri bütünlüğü varsayımı: `horse.ownerId` her zaman var olan bir
      // oyuncuya işaret eder (bkz. AYNI dal `GetStableSummaryUseCase`).
      throw new PlayerNotFoundError(horse.ownerId);
    }

    const now = new Date();
    const race: Race = {
      id: raceId,
      trackId: null,
      name: 'Pratik Yarış',
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PRACTICE_RACE_SURFACE,
      weather: PRACTICE_RACE_WEATHER,
      temperatureC: null,
      windKmh: null,
      humidityPct: null,
      participantLimit: botEntrants.length + 1,
      entryFee,
      prizePool: prizeWon,
      startTime: now.toISOString(),
      status: 'finished',
      simulationSeed: timeline.simulationSeed,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const raceEntry: RaceEntry = {
      id: randomUUID(),
      raceId,
      horseId,
      jockeyId: null,
      gatePosition: null,
      tacticalStyle: input.tactic.racingStyle,
      riskLevel: input.tactic.riskLevel,
      horseSnapshot: playerEntrant,
      finalTimeMs: playerFinish.finishTimeMs,
      finishPosition: playerFinish.finishPosition,
      performanceScore: playerFinish.performanceScore,
      createdAt: now.toISOString(),
    };

    const playerSegments: RaceSegmentSnapshot[] = timeline.segments
      .filter((segment) => segment.raceEntryId === horseId)
      .map((segment) => ({ ...segment, raceEntryId: raceEntry.id }));

    await this.raceRepository.savePracticeRace(race, raceEntry, playerSegments);

    return {
      raceId,
      horseId,
      distanceMeters: PRACTICE_RACE_DISTANCE_METERS,
      surface: PRACTICE_RACE_SURFACE,
      weather: PRACTICE_RACE_WEATHER,
      finalResult: timeline.finalResult,
      explanations: timeline.explanations,
      entryFee,
      prizeWon,
      newBalance: walletResult,
    };
  }
}
