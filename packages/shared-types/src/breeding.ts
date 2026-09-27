import type { ISODateTimeString, UUID } from './common';
import type { HorseGender } from './horse';

/** brief §7 BreedingPair, §28 */
export interface BreedingPrediction {
  // Örn. { speed: [78, 84], potential: [85, 92] } - brief §34 scout mantığıyla tutarlı aralıklar
  [statName: string]: [min: number, max: number];
}

export interface BreedingPair {
  id: UUID;
  mareId: UUID;
  stallionId: UUID;
  prediction: BreedingPrediction | null;
  fee: number;
  foalId: UUID | null;
  createdAt: ISODateTimeString;
}

/** brief §7 Pedigree */
export interface Pedigree {
  horseId: UUID;
  sireId: UUID | null;
  damId: UUID | null;
  grandSireId: UUID | null;
  grandDamId: UUID | null;
  bloodline: string | null;
}

/**
 * `GET /horses/{id}/pedigree` yanıtı (bu dilimde EKLENDİ).
 *
 * `pedigree` **her zaman** doludur — soy kaydı OLMAYAN bir at için de
 * (başlangıç atları hiçbir zaman çiftleştirilmediği için `pedigrees`
 * satırları yoktur) tüm ata alanları `null` olan bir `Pedigree` döner.
 * İstemcinin "kayıt yok" durumunu ayrı bir `null` kontrolüyle ele alması
 * YERİNE, aynı şekli (`PedigreeTree`'nin beklediği) her zaman alması
 * bilinçli bir tercihtir — `pedigree-tree.ts` zaten `null` alanları
 * "Bilinmiyor" düğümüne çevirir.
 *
 * `horseNamesById` — ağaçta GÖRÜNEN her ata ID'si için at adı. Yalnızca
 * GERÇEKTEN bulunan atlar girer (uydurma ad yok); bir ID burada yoksa
 * `pedigree-tree.ts` ham ID'yi gösterir.
 */
export interface HorsePedigreeView {
  pedigree: Pedigree;
  horseNamesById: Record<string, string>;
}

/**
 * `POST /players/{id}/breeding` yanıtı (çiftleştirme yazma yolu dilimi).
 *
 * **Tay ANINDA doğar** — bu projede gebelik süresi modellenmez (bkz.
 * `domain/breeding/breeding.ts`: `breedHorses` sonucu doğrudan bir tay
 * üretir). `breedingCooldownDays` kısrağın BİR SONRAKİ çiftleştirmesine
 * kadar geçen süredir, gebelik süresi değildir.
 *
 * **`seed` BİLİNÇLİ OLARAK DÖNMEZ.** Tayın statları deterministiktir
 * (brief §18) ve seed `pairId`'ye EŞİTTİR; `pairId` zaten yanıttadır ve
 * `breeding_pairs.id` olarak SAKLANIR — yani sonuç, kayıttan bağımsız
 * olarak yeniden üretilebilir. Seed'i ayrıca dönmek ikinci bir doğruluk
 * kaynağı yaratırdı.
 */
export interface BreedingResultView {
  /** `breeding_pairs.id` — aynı zamanda tayın genetik seed'idir (bkz. üstteki not). */
  pairId: UUID;
  foalId: UUID;
  foalName: string;
  foalGender: HorseGender;
  mareId: UUID;
  stallionId: UUID;
  /** Damızlık ücreti. Aynı sahip kendi atlarını çiftleştirirse 0'dır (kendine ödeme yapılmaz). */
  fee: number;
  inbreedingDetected: boolean;
  /** Doğum sağlık riski, [0, 1] — tayın `horse_health.injury_risk` sütununa ×100 olarak yazılır. */
  birthHealthRisk: number;
  /**
   * Ücret ÖDENDİYSE ödeyenin (kısrak sahibinin) çiftleştirme SONRASI
   * bakiyesi; ücret 0 ise `null` (hiçbir para hareketi olmadı).
   */
  payerBalance: { money: number; gems: number } | null;
}
