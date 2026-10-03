import { Inject, Injectable } from '@nestjs/common';
import type { RaceEntrantSnapshot, RaceSurface, RaceTacticInput } from '@at-sevdalisi/shared-types';
import { buildHorseEntrantSnapshot, FORM_SAMPLE_SIZE, type TrackFitInput } from '../../domain/race/entrant-snapshot';
import { effectiveJockeySkill } from '../../domain/jockey/jockey';
import { DEFAULT_RACE_TACTIC } from '../../domain/race/validation';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { HORSE_SURFACE_STATS_REPOSITORY, type HorseSurfaceStatsRepository } from '../ports/horse-surface-stats.repository';
import { HORSE_DISTANCE_STATS_REPOSITORY, type HorseDistanceStatsRepository } from '../ports/horse-distance-stats.repository';
import { HORSE_EQUIPMENT_REPOSITORY, type HorseEquipmentRepository } from '../ports/horse-equipment.repository';
import { JOCKEY_REPOSITORY, type JockeyRepository } from '../ports/jockey.repository';
import { RACE_REPOSITORY, type LobbySettlementEntrant, type RaceRepository } from '../ports/race.repository';

/**
 * `EntrantSnapshotBuilder.build` sonucu (PHASE 6.2).
 *
 * **NEDEN İKİ ALAN.** `snapshot` motora gider; `jockeyId` ise `race_entries.
 * jockey_id` sütununa yazılır. İkisi AYNI okumadan doğar ve ayrılmaları
 * mümkün değildir: jokeyi ayrıca sorgulamak, "snapshot'ta 78 yazan jokey
 * puanı ile sonuç ekranında görünen jokey farklı kişiler" durumunu
 * üretebilirdi — ve bu hiçbir yerde hata vermezdi.
 *
 * `jockeyId` `null` = oyuncunun kiralı jokeyi yok (nötr 50 ile koşar).
 */
export interface BuiltEntrantSnapshot {
  snapshot: RaceEntrantSnapshot;
  jockeyId: string | null;
}

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
    // PHASE 6.2 — jokey zincirinin motora bağlandığı yer.
    @Inject(JOCKEY_REPOSITORY) private readonly jockeyRepository: JockeyRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * **TAKTİK: `DEFAULT_RACE_TACTIC` TABANI + KATILIM SATIRININ İKİ ALANI.**
   * `joinLobbyRace` yalnızca `tactical_style`/`risk_level` saklar;
   * `startApproach`/`finalStretchPlan` HİÇ YAZILMAZ (bkz. `RaceJoinInput`).
   * Onları uydurmak yerine varsayılanları kullanmak, "kaydedilmemiş bir
   * kararı sonradan icat etmemek" demektir. **BU CÜMLE PHASE 6.1'DE
   * BAYATLADI ve düzeltildi:** motor artık bu iki alanı OKUYOR (bkz.
   * `race-engine.ts` `startApproach`/`finalStretchPlan` tüketimi,
   * PROJE_DURUMU.md §13.29) — yani varsayılana düşmek "etkisiz" değil,
   * "nötr plan" demektir. Katılım formu bu iki alanı toplamaya
   * başladığında buranın da güncellenmesi gerekir; bu bilinçli bir açık
   * uçtur.
   *
   * `surface`/`distanceMeters` `string`/`number` olarak alınır çünkü
   * `LobbySettlementContext` veritabanından gelen HAM değerleri taşır
   * (repository portu domain tiplerini bilmez). `RaceSurface`e daraltma
   * çağıranın sorumluluğundadır — `races` sütunları
   * `validateRaceCreation`'dan geçmiş değerler tutar, yani bu bir
   * varsayım değil bir sözleşmedir.
   */
  async build(
    entrant: Pick<LobbySettlementEntrant, 'horseId' | 'playerId' | 'tacticalStyle' | 'riskLevel'>,
    surface: string,
    distanceMeters: number,
  ): Promise<BuiltEntrantSnapshot> {
    const horse = await this.horseRepository.findById(entrant.horseId);
    if (horse === null) {
      throw new HorseNotFoundError(entrant.horseId);
    }
    const stats = await this.horseStatsRepository.findByHorseId(entrant.horseId);
    if (stats === null) {
      throw new HorseNotFoundError(entrant.horseId);
    }

    const recentResults = await this.raceRepository.findRecentResultsByHorseId(entrant.horseId, FORM_SAMPLE_SIZE);
    const [surfaceStats, distanceStats, equippedItems, jockey] = await Promise.all([
      this.horseSurfaceStatsRepository.findByHorseId(entrant.horseId),
      this.horseDistanceStatsRepository.findByHorseId(entrant.horseId),
      this.horseEquipmentRepository.findEquippedByHorseId(entrant.horseId),
      // JOKEY (PHASE 6.2) — oyuncunun KİRALADIĞI jokey. `null` ise nötr 50.
      // Bu sorgu ATIN değil OYUNCUNUN jokeyini arar (`findByOwnerId`):
      // jokey bir atın değil bir oyuncunun varlığıdır, oyuncu istediği
      // atına biner ve yarış anında hangi ata bindiği
      // `race_entries.jockey_id` ile kaydedilir.
      this.jockeyRepository.findByOwnerId(entrant.playerId),
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

    // JOKEY PUANI — ağırlıklı toplam (altı beceri × config ağırlıkları).
    // `null` jokey AÇIKÇA nötre düşer; `buildHorseEntrantSnapshot` da
    // `null`u nötre çevirir. İki yerde birden `?? NEUTRAL` yazmak bilinçli:
    // buradaki, `jockeyId`i de `null` bırakarak "jokeyi yok" olgusunu
    // KAYDEDER; oradaki, parametreyi hiç vermeyen çağıranlar (botlar) için
    // güvenli varsayılandır.
    // 02.10.2026 — jokey-at UYUMU beceriye işler (`effectiveJockeySkill`);
    // dondurulan kadroya yazılır, motor değişmez.
    const jockeySkillComposite =
      jockey === null
        ? null
        : effectiveJockeySkill(
            {
              jockey,
              horse: { temperament: stats.temperament, racingStyle: entrant.tacticalStyle },
              previousPairAveragePerformance:
                await this.raceRepository.findJockeyPairAveragePerformance(entrant.horseId, jockey.id),
            },
            this.config.jockey,
          );

    return {
      snapshot: buildHorseEntrantSnapshot(
        horse,
        stats,
        tactic,
        recentResults,
        trackFit,
        equippedItems,
        jockeySkillComposite,
      ),
      jockeyId: jockey === null ? null : jockey.id,
    };
  }
}
