import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { RACE_ENGINE_VERSION, RACE_RULESET_VERSION } from '../../domain/race/race-engine';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { RACE_REPOSITORY, type RaceRepository, type TournamentInfo } from '../ports/race.repository';

const MS_PER_HOUR = 60 * 60 * 1000;
/** `YYYY-MM-DD HH:MM` — `toISOString()`in ilk 16 karakteri (UTC, sunucu saatinden bağımsız). */
const ISO_MINUTE_LENGTH = 16;

const TIER_LABELS: Record<TournamentInfo['tier'], string> = {
  bronze: 'Bronz',
  silver: 'Gümüş',
  gold: 'Altın',
};

export interface ScheduleTournamentsResult {
  opened: string[];
  cancelledEmpty: number;
}

/**
 * OTOMATİK TURNUVA TAKVİMİ (30.09.2026, `FINAL_PROJECT_AUDIT.md` #50 —
 * proje sahibinin kararı: "sunucu her kademe için otomatik açsın, turnuva
 * tek büyük final olsun").
 *
 * Her tur:
 *  1. Başlangıcı geçmiş ve hiç katılımı olmayan turnuvaları iptal eder
 *     (kilit zamanlayıcısı katılımsız yarışı seçmez; iptal edilmezse o
 *     kademede yeni turnuva hiç açılmazdı).
 *  2. `online.tournament.tiers`teki HER kademe için kaydı açık turnuva yoksa
 *     yenisini `schedule.registrationHours` sonra başlamak üzere açar.
 *
 * Kilitleme, READY şartı, "en az katılımcı" iptali ve kesinleşme bu sınıfın
 * işi DEĞİLDİR: turnuva finali bir lobi yarışıdır ve onları
 * `RaceLockScheduler` (`LockRaceUseCase` + `SettleDueRacesUseCase`) yapar.
 */
@Injectable()
export class ScheduleTournamentsUseCase {
  private readonly logger = new Logger(ScheduleTournamentsUseCase.name);

  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(now: Date = new Date()): Promise<ScheduleTournamentsResult> {
    const tournamentConfig = this.config.online.tournament;
    const cancelledEmpty = await this.raceRepository.cancelEmptyDueTournaments(now);

    const openTiers = new Set(await this.raceRepository.findOpenTournamentTiers());
    const opened: string[] = [];
    for (const [tierName, tier] of Object.entries(tournamentConfig.tiers)) {
      if (openTiers.has(tierName) || !(tierName in TIER_LABELS)) {
        continue;
      }
      const typedTier = tierName as TournamentInfo['tier'];
      const startTime = new Date(now.getTime() + tournamentConfig.schedule.registrationHours * MS_PER_HOUR);
      const raceId = await this.raceRepository.createTournamentRace({
        raceId: randomUUID(),
        tier: typedTier,
        name: `${TIER_LABELS[typedTier]} Kupası · ${startTime.toISOString().slice(0, ISO_MINUTE_LENGTH).replace('T', ' ')} UTC`,
        startTime,
        entryFee: tier.entryFee,
        maxParticipants: tier.maxParticipants,
        minPlayerLevel: tier.minPlayerLevel,
        distanceMeters: tournamentConfig.race.distanceMeters,
        surface: tournamentConfig.race.surface,
        weather: tournamentConfig.race.weather,
        tribuneFee: tournamentConfig.race.tribuneFee,
        spectatorCapacity: tournamentConfig.race.spectatorCapacity,
        engineVersion: RACE_ENGINE_VERSION,
        rulesetVersion: RACE_RULESET_VERSION,
        configVersion: this.config.race.version,
        weatherConfigVersion: this.config.weather.version,
      });
      if (raceId !== null) {
        opened.push(raceId);
      }
    }
    if (opened.length > 0 || cancelledEmpty > 0) {
      this.logger.log(`Turnuva takvimi: ${opened.length} açıldı, ${cancelledEmpty} boş turnuva iptal edildi.`);
    }
    return { opened, cancelledEmpty };
  }
}
