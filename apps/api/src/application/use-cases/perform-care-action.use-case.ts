import { Inject, Injectable } from '@nestjs/common';
import type { CareActionType, Horse, PerformCareActionResult } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { applyCareAction, canRecoverFromInjury } from '../../domain/care/care';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { CARE_LOG_REPOSITORY, type CareLogRepository } from '../ports/care-log.repository';
import { HORSE_HEALTH_REPOSITORY, type HorseHealthRepository } from '../ports/horse-health.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';

/**
 * `POST /horses/{id}/care` (docs/API.md §4, brief §11).
 *
 * KAPSAM (bu dilim, bilinçli — bkz. docs/ROADMAP.md "FAZ 1 wiring —
 * Beşinci dilim: Bakım"):
 *  - docs/API.md'nin önceki taslağındaki AYRI `vet`/`farrier`/`rest`
 *    uç noktaları TEK bu uç noktaya (`actionType` alanıyla) BİRLEŞTİRİLDİ
 *    — `domain/care/care.ts`'in `applyCareAction`'ı zaten TÜM altı eylem
 *    türünü (`groom`/`water`/`clean`/`vet`/`farrier`/`rest`) TEK bir
 *    fonksiyonla ele alıyor; Antrenman dilimindeki "tek endpoint + type
 *    alanı" kararıyla AYNI gerekçe.
 *  - Bakımın bu dilimde bir PARA maliyeti YOKTUR (Economy entegrasyonu
 *    KAPSAM DIŞI — Antrenman dilimindeki "kapsam dışı" notuyla AYNI
 *    gerekçe; `getCareActionCost` zaten domain katmanında hazır).
 *  - `HorseHealth`'in yalnızca `CareableHealth` alt kümesi (injuryRisk/
 *    recoveryRate/jointCondition/weightCondition) güncellenir —
 *    `health`/`muscleCondition`/`respiratoryCondition`/`lastVetCheck`
 *    bu dilimde DOKUNULMAZ (bkz. `HorseHealthRepository` üstündeki not).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 7'nin dersi burada BAŞTAN
 * uygulanır: `domain/care/care.ts` `actionType`'ı KENDİSİ de doğrular
 * (DTO'nun `@IsIn(...)`'ine TEK BAŞINA güvenilmez).
 *
 * DÜZELTME (AUDIT_REPORT.md H1, bu oturum) — `TrainHorseUseCase` bir atı
 * `status: 'injured'`'a geçirebiliyordu ama HİÇBİR kod yolu bunu geri
 * `'active'`'e ÇEVİRMİYORDU (`vet` eylemi bile `horse.status`'a hiç
 * dokunmuyordu) — sakatlanan bir at antrenman/pratik yarış/PvP eşleştirme
 * için KALICI olarak kullanılamaz hale geliyordu. Düzeltme: bakım eylemi
 * uygulandıktan SONRAKİ (delta'lar dahil) `health`/`injuryRisk`
 * değerleriyle `canRecoverFromInjury` kontrol edilir; eşik karşılanırsa
 * (bkz. `care.config.json` `injuryRecovery`) at `active`'e döner.
 *
 * AUDIT_REPORT.md Bulgu C2 hardening (bu oturum) — `horseRepository.updateWithLock`
 * (bkz. `TrainHorseUseCase`'deki AYNI desen, `HorseRepository.updateWithLock`
 * doc yorumu): `horses` satırının vital alanları artık KİLİTLİ okunup
 * yazılır — iki eşzamanlı bakım isteği (veya bir bakım + antrenman)
 * birbirinin fatigue/health/status yazımını SESSİZCE EZEMEZ. KAPSAM NOTU:
 * `horse_health` (CareableHealth) tablosu bu kilidin DIŞINDADIR (bkz.
 * `HorseRepository.updateWithLock` doc yorumundaki dürüstlük notu) — aynı
 * ata karşı GERÇEKTEN eşzamanlı iki bakım isteğinde `injuryRisk`/
 * `recoveryRate` gibi alanlarda küçük, ayrı bir lost-update riski hâlâ
 * TEORİK olarak vardır; bu, `horses` satırının (health/fatigue/status)
 * KORUNMASINA kıyasla çok daha düşük etkili bir takip maddesi olarak
 * bilinçli şekilde bırakılmıştır (`application` katmanının `pg`
 * `PoolClient`'ı bilmemesi gereken mimari kuralı nedeniyle).
 */
@Injectable()
export class PerformCareActionUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_HEALTH_REPOSITORY) private readonly horseHealthRepository: HorseHealthRepository,
    @Inject(CARE_LOG_REPOSITORY) private readonly careLogRepository: CareLogRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string, actionType: CareActionType): Promise<PerformCareActionResult> {
    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }

    const health = await this.horseHealthRepository.findCareableHealth(horseId);
    if (health === null) {
      // Veri bütünlüğü varsayımı: her at, `save()` sırasında bir
      // `horse_health` satırıyla birlikte yaratılır (bkz.
      // `PostgresHorseRepository.save()`) — bu dala normal koşullarda
      // ULAŞILMAZ.
      throw new HorseNotFoundError(horseId);
    }

    const now = new Date();
    const lastPerformedAt = await this.careLogRepository.findLastPerformedAt(horseId, actionType);

    const lockResult = await this.horseRepository.updateWithLock(horseId, (lockedHorse) => {
      const vitals = {
        health: lockedHorse.health,
        fitness: lockedHorse.fitness,
        fatigue: lockedHorse.fatigue,
        energy: lockedHorse.energy,
        morale: lockedHorse.morale,
      };

      const result = applyCareAction(this.config.care, actionType, vitals, health, lastPerformedAt, now);

      const recoversFromInjury =
        lockedHorse.status === 'injured' &&
        canRecoverFromInjury(this.config.care, actionType, result.vitals.health, result.health.injuryRisk);
      const newStatus = recoversFromInjury ? 'active' : lockedHorse.status;

      const updatedHorse: Horse = {
        ...lockedHorse,
        health: result.vitals.health,
        fitness: result.vitals.fitness,
        fatigue: result.vitals.fatigue,
        energy: result.vitals.energy,
        morale: result.vitals.morale,
        status: newStatus,
        updatedAt: now.toISOString(),
      };

      return { horse: updatedHorse, result: { careResult: result, newStatus } };
    });

    if (lockResult === null) {
      throw new HorseNotFoundError(horseId);
    }
    const { careResult, newStatus } = lockResult;

    await this.horseHealthRepository.updateCareableFields(horseId, careResult.health);
    await this.careLogRepository.recordPerformed(horseId, actionType, now);

    return {
      horseId,
      actionType,
      newVitals: {
        health: careResult.vitals.health,
        fitness: careResult.vitals.fitness,
        fatigue: careResult.vitals.fatigue,
        energy: careResult.vitals.energy,
        morale: careResult.vitals.morale,
      },
      newHealth: careResult.health,
      newStatus,
    };
  }
}
