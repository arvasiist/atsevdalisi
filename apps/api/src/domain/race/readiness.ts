import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { HorseStatus } from '@at-sevdalisi/shared-types';
import type { VitalSigns } from '../horse/vital-signs';

/**
 * "Hazır olan kişiler yarışabilsinler" (proje sahibinin açık talebi,
 * 27.09.2026) — bir atın yarışa girip giremeyeceğinin TEK karar noktası.
 *
 * NEDEN AYRI BİR MODÜL: `domain/horse/vital-signs.ts`'teki
 * `checkTrainingReadiness` ile AYNI ŞEKLİ paylaşır ama AYNI EŞİKLERİ
 * PAYLAŞMAZ ve bu bilinçlidir: yorgun bir at hafif bir antrenmana
 * sokulabilir (eşikler: enerji ≥ 15, yorgunluk ≤ 90) ama yarışa
 * sokulamaz (enerji ≥ 30, yorgunluk ≤ 70). Ayrıca yarışın, antrenmanda
 * KARŞILIĞI OLMAYAN iki ek koşulu vardır: atın `active` durumda olması ve
 * yeterli SAĞLIĞA sahip olması. Bu yüzden eşikler `race.config.json`
 * içindeki KENDİ `readiness` bloğundan gelir (SİHİRLİ SAYI YOK kuralı).
 *
 * Çağıran taraf (`RunPracticeRaceUseCase`) `status === 'injured'` için
 * AYRICA `HorseInjuredError` fırlatmaya devam eder: o, `docs/API.md`de
 * `HORSE_INJURED` koduyla SABİTLENMİŞ, istemcinin zaten tanıdığı bir
 * sözleşmedir (bkz. `apps/api/test/api/race.e2e-spec.ts`). Buradaki
 * `HORSE_NOT_ACTIVE` dalı onun YERİNE geçmez, onu TAMAMLAR: sakatlık
 * dışındaki `resting`/`retired` durumlarını da kapsar.
 */

/** Atın yarışa girmesini engelleyen ilk neden — sırayla kontrol edilir, İLK uyan döner. */
export type RaceNotReadyReason = 'HORSE_NOT_ACTIVE' | 'INSUFFICIENT_HEALTH' | 'HORSE_TOO_TIRED' | 'INSUFFICIENT_ENERGY';

export interface RaceReadiness {
  ready: boolean;
  reason: RaceNotReadyReason | null;
}

/**
 * Eşikler config tipinden TÜRETİLİR (`RaceBalanceConfig['readiness']`) —
 * burada elle yazılmış ikinci bir `{ minEnergy; maxFatigue; minHealth }`
 * tanımı YOKTUR, yani config'e bir alan eklenip buradan unutulması
 * derleme zamanında hata verir.
 */
export type RaceReadinessThresholds = RaceBalanceConfig['readiness'];

/**
 * Kontrol SIRASI bilinçlidir ve DETERMİNİSTİKTİR: birden fazla koşul
 * birden ihlal edilse bile oyuncuya HER ZAMAN tek bir neden gösterilir
 * (istemci tek bir mesaj göstereceği için). Sıra "en kalıcıdan en geçiciye"
 * doğrudur — önce atın durumu (kullanıcı müdahalesi gerekir), sonra
 * sağlık, sonra yorgunluk, en son enerji (birkaç saat dinlenmeyle
 * kendiliğinden düzelir).
 */
export function checkRaceReadiness(
  status: HorseStatus,
  vitals: VitalSigns,
  thresholds: RaceReadinessThresholds,
): RaceReadiness {
  if (status !== 'active') {
    return { ready: false, reason: 'HORSE_NOT_ACTIVE' };
  }
  if (vitals.health < thresholds.minHealth) {
    return { ready: false, reason: 'INSUFFICIENT_HEALTH' };
  }
  if (vitals.fatigue > thresholds.maxFatigue) {
    return { ready: false, reason: 'HORSE_TOO_TIRED' };
  }
  if (vitals.energy < thresholds.minEnergy) {
    return { ready: false, reason: 'INSUFFICIENT_ENERGY' };
  }
  return { ready: true, reason: null };
}
