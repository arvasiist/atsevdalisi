import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PracticeRaceResult, Race, RaceEntry, RaceSegmentSnapshot, RaceTacticInput } from '@at-sevdalisi/shared-types';
import { generateBotEntrants } from '../../domain/race/bot-generator';
import { buildHorseEntrantSnapshot } from '../../domain/race/entrant-snapshot';
import { simulateRace } from '../../domain/race/race-engine';
import { PRACTICE_RACE_BOT_COUNT, PRACTICE_RACE_DISTANCE_METERS } from '../../domain/race/validation';
import { HorseInjuredError, HorseNotFoundError } from '../../domain/horse/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
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
 *  - Giriş ücreti/ödül havuzu (para akışı) YOK — `races.entry_fee`/
 *    `prize_pool` her zaman 0. Bu, Ahır Özeti → Ahır Yükseltme'deki AYNI
 *    "önce oku/bağla, parayı SONRA ekle" sıralamasıdır — para akışı
 *    eklenecekse `PlayerRepository.updateWithLock` (debit giriş ücreti +
 *    credit ödül, TEK kilit altında) doğal bir sonraki adımdır ve brief
 *    §54'ün Idempotency-Key + Redis altyapısının GERÇEK ev sahibi de o
 *    zaman olabilir (Günlük Ödül/Ahır Yükseltme'de bilinçli ertelenmişti).
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
 */
@Injectable()
export class RunPracticeRaceUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
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
      entryFee: 0,
      prizePool: 0,
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
    };
  }
}
