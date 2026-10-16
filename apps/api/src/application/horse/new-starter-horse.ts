import { randomUUID } from 'node:crypto';
import type { Horse } from '@at-sevdalisi/shared-types';
import { deriveAppearance } from '../../domain/horse/appearance';
import { deriveBreedInitialStats, getStarterBreed, type BreedInitialStats } from '../../domain/horse/breeds';
import {
  createStarterHorse,
  generateStarterHorseWeightKg,
  pickStarterHorseGender,
  pickStarterHorseName,
} from '../../domain/horse/horse';
import type { AppConfigService } from '../../infrastructure/config/config.service';

/**
 * Yeni oyuncunun ÜCRETSİZ başlangıç atı (07.10.2026'dan beri ortak). Kayıt
 * (`RegisterPlayerUseCase`) ve sağlayıcı girişi (`LoginWithProviderUseCase`)
 * aynı atı vermelidir — iki kopya bir gün ayrışırdı.
 *
 * Irk `breeds.starterBreed`dır: sahibinin kuralıyla EN ZAYIF ırk
 * (`validateBreedsConfig` kilitler); güçlü ırklar mağazadan alınır.
 * Rastgelelik (ad, ağırlık, cinsiyet) burada, Application katmanında üretilir;
 * görünüş ve ırk statları atın kimliğinden determinist türetilir.
 */
export function newStarterHorse(ownerId: string, config: AppConfigService): { horse: Horse; initial: BreedInitialStats } {
  const id = randomUUID();
  const breed = getStarterBreed(config.breeds);
  const horse = createStarterHorse({
    id,
    ownerId,
    breed,
    appearance: deriveAppearance(id, config.horseAppearance, breed.coatWeights),
    name: pickStarterHorseName(Math.random()),
    weightKg: generateStarterHorseWeightKg([Math.random(), Math.random(), Math.random()]),
    gender: pickStarterHorseGender(Math.random()),
  });
  return { horse, initial: deriveBreedInitialStats(id, breed, config.breeds.statJitter) };
}
