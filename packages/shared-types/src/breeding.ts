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
