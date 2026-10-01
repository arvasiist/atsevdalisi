import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { RACE_ENGINE_VERSION, RACE_RULESET_VERSION } from '../../domain/race/race-engine';
import { validateRaceCreation } from '../../domain/race/lobby';
import {
  calendarProgramToCreationInput,
  computeCalendarSlotTimes,
} from '../../domain/race/race-calendar';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

export interface ScheduleRaceCalendarResult {
  opened: string[];
  cancelledEmpty: number;
  /** Doğrulamadan geçemeyen programların yuvaları (config hatası — loglanır, açılmaz). */
  rejected: number;
}

/**
 * YARIŞ TAKVİMİ (01.10.2026) — `race-lobby.config.json` → `calendar`.
 *
 * Her tur:
 *  1. Başlangıcı geçmiş, katılımsız takvim yarışlarını iptal eder.
 *  2. Her programın penceredeki yuvalarından açılmamış olanları açar.
 *
 * Her yuva OYUNCUNUN yarış açma kuralından (`validateRaceCreation`) geçer:
 * sunucu, oyuncuya yasak bir yarışı kendisi de açamaz. Kilit, READY, bot
 * dolgusu ve kesinleşme sıradan lobi yarışıyla aynıdır (`RaceLockScheduler`).
 */
@Injectable()
export class ScheduleRaceCalendarUseCase {
  private readonly logger = new Logger(ScheduleRaceCalendarUseCase.name);

  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(now: Date = new Date()): Promise<ScheduleRaceCalendarResult> {
    const { raceLobby } = this.config;
    const { calendar } = raceLobby;
    const cancelledEmpty = await this.raceRepository.cancelEmptyDueCalendarRaces(now);
    const opened: string[] = [];
    let rejected = 0;

    for (const program of calendar.programs) {
      const slots = computeCalendarSlotTimes(now, program, calendar);
      const existing = new Set(
        (await this.raceRepository.findExistingCalendarSlots(program.id, slots)).map((time) =>
          time.getTime(),
        ),
      );
      for (const startTime of slots) {
        if (existing.has(startTime.getTime())) {
          continue;
        }
        const { problems, value } = validateRaceCreation(
          calendarProgramToCreationInput(program, startTime),
          raceLobby,
          now,
        );
        if (value === null) {
          rejected += 1;
          this.logger.error(`Takvim programı "${program.id}" geçersiz: ${problems.join(' ')}`);
          continue;
        }
        const raceId = await this.raceRepository.createCalendarRace({
          raceId: randomUUID(),
          programId: program.id,
          name: value.name,
          startTime: value.startTime,
          fieldSize: value.fieldSize,
          maxPlayers: value.maxPlayers,
          entryFee: value.entryFee,
          raceType: value.raceType,
          distanceMeters: value.distanceMeters,
          surface: value.surface,
          weather: value.weather,
          tribuneFee: value.tribuneFee,
          spectatorCapacity: value.spectatorCapacity,
          engineVersion: RACE_ENGINE_VERSION,
          rulesetVersion: RACE_RULESET_VERSION,
          configVersion: this.config.race.version,
          weatherConfigVersion: this.config.weather.version,
        });
        if (raceId !== null) {
          opened.push(raceId);
        }
      }
    }
    if (opened.length > 0 || cancelledEmpty > 0) {
      this.logger.log(
        `Yarış takvimi: ${opened.length} açıldı, ${cancelledEmpty} boş yarış iptal edildi.`,
      );
    }
    return { opened, cancelledEmpty, rejected };
  }
}
