import type { ISODateTimeString, UUID } from './common';

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
