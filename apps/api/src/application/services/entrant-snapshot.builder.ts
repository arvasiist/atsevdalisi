import { Inject, Injectable } from '@nestjs/common';
import type { RaceEntrantSnapshot, RaceSurface, RaceTacticInput } from '@at-sevdalisi/shared-types';
import { buildHorseEntrantSnapshot, FORM_SAMPLE_SIZE, type TrackFitInput } from '../../domain/race/entrant-snapshot';
import { DEFAULT_RACE_TACTIC } from '../../domain/race/validation';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { HORSE_SURFACE_STATS_REPOSITORY, type HorseSurfaceStatsRepository } from '../ports/horse-surface-stats.repository';
import { HORSE_DISTANCE_STATS_REPOSITORY, type HorseDistanceStatsRepository } from '../ports/horse-distance-stats.repository';
import { HORSE_EQUIPMENT_REPOSITORY, type HorseEquipmentRepository } from '../ports/horse-equipment.repository';
import { RACE_REPOSITORY, type LobbySettlementEntrant, type RaceRepository } from '../ports/race.repository';

/**
 * Bir lobi katılımcısının KOŞTUĞU ANDAKİ snapshot'ını kuran PAYLAŞILAN
 * servis (§42 PHASE 1, 28.09.2026).
 *
 * **NEDEN VAR — ve neden use-case'in içinde kalmadı.** Bu mantık önce
 * `SettleRaceUseCase.buildEntrantSnapshot` özel metodu olarak yazılmıştı.
 * PHASE 1 ile snapshot'ın `startTime` ANINDA dondurulması gerekince AYNI
 * mantık ikinci bir yerden (`LockRaceUseCase`) çağrılır oldu. İki kopya
 * bırakmak, `buildHorseEntrantSnapshot`'ın girdileri değiştiğinde
 * (PHASE 6'da jokey/kişilik eklenmesi PLANLANIYOR) birinin güncellenip
 * diğerinin unutulması demekti — ve bu, "dondurulmuş snapshot" ile
 * "kesinleşme anında kurulan snapshot"ın SESSİZCE ayrışması olurdu: iki
 * farklı kod yolu, iki farklı sonuç, hiçbir yerde hata yok.
 *
 * **`application/services/` ALTINDADIR, `domain/` ALTINDA DEĞİL:** bu sınıf
 * repository portlarına bağımlıdır (I/O yapar) ve `@Injectable()` taşır —
 * `domain/` framework'süz saf TS olmak zorundadır (CLAUDE.md "KATMAN YÖNÜ
 * TEK YÖNLÜ"). Aynı gerekçeyle `use-cases/` altına da konmadı: bu bir
 * senaryo değil, iki senaryonun paylaştığı bir YETENEKTİR.
 *
 * **`@Inject()` HER ZAMAN AÇIK** — vitest/esbuild `design:paramtypes`
 * üretmez (CLAUDE.md kural 5).
 */
@Injectable()
export class EntrantSnapshotBuilder {
  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(HORSE_SURFACE_STATS_REPOSITORY) private readonly horseSurfaceStatsRepository: HorseSurfaceStatsRepository,
    @Inject(HORSE_DISTANCE_STATS_REPOSITORY) private readonly horseDistanceStatsRepository: HorseDistanceStatsRepository,
    @Inject(HORSE_EQUIPMENT_REPOSITORY) private readonly horseEquipmentRepository: HorseEquipmentRepository,
  ) {}

  /**
   * **TAKTİK: `DEFAULT_RACE_TACTIC` TABANI + KATILIM SATIRININ İKİ ALANI.**
   * `joinLobbyRace` yalnızca `tactical_style`/`risk_level` saklar;
   * `startApproach`/`finalStretchPlan` HİÇ YAZILMAZ (bkz. `RaceJoinInput`).
   * Onları uydurmak yerine varsayılanları kullanmak, "kaydedilmemiş bir
   * kararı sonradan icat etmemek" demektir — motor bu iki alanı bugün
   * zaten OKUMUYOR (bkz. `InvalidRaceTacticError` doc yorumu). Katılım
   * formu bu iki alanı toplamaya başladığında buranın da güncellenmesi
   * gerekir; bu bilinçli bir açık uçtur (PHASE 6).
   *
   * `surface`/`distanceMeters` `string`/`number` olarak alınır çünkü
   * `LobbySettlementContext` veritabanından gelen HAM değerleri taşır
   * (repository portu domain tiplerini bilmez). `RaceSurface`e daraltma
   * çağıranın sorumluluğundadır — `races` sütunları
   * `validateRaceCreation`'dan geçmiş değerler tutar, yani bu bir
   * varsayım değil bir sözleşmedir.
   */
  async build(
    entrant: Pick<LobbySettlementEntrant, 'horseId' | 'tacticalStyle' | 'riskLevel'>,
    surface: string,
    distanceMeters: number,
  ): Promise<RaceEntrantSnapshot> {
    const horse = await this.horseRepository.findById(entrant.horseId);
    if (horse === null) {
      throw new HorseNotFoundError(entrant.horseId);
    }
    const stats = await this.horseStatsRepository.findByHorseId(entrant.horseId);
    if (stats === null) {
      throw new HorseNotFoundError(entrant.horseId);
    }

    const recentResults = await this.raceRepository.findRecentResultsByHorseId(entrant.horseId, FORM_SAMPLE_SIZE);
    const [surfaceStats, distanceStats, equippedItems] = await Promise.all([
      this.horseSurfaceStatsRepository.findByHorseId(entrant.horseId),
      this.horseDistanceStatsRepository.findByHorseId(entrant.horseId),
      this.horseEquipmentRepository.findEquippedByHorseId(entrant.horseId),
    ]);

    const trackFit: TrackFitInput | null =
      surfaceStats === null || distanceStats === null
        ? null
        : { surfaceStats, distanceStats, surface: surface as RaceSurface, distanceMeters };

    const tactic: RaceTacticInput = {
      racingStyle: entrant.tacticalStyle,
      riskLevel: entrant.riskLevel,
      startApproach: DEFAULT_RACE_TACTIC.startApproach,
      finalStretchPlan: DEFAULT_RACE_TACTIC.finalStretchPlan,
    };

    return buildHorseEntrantSnapshot(horse, stats, tactic, recentResults, trackFit, equippedItems);
  }
}
