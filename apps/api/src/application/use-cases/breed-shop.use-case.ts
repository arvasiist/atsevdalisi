import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Horse, HorseGender } from '@at-sevdalisi/shared-types';
import { deriveAppearance } from '../../domain/horse/appearance';
import { deriveBreedInitialStats, getBreed, InvalidHorseGenderError } from '../../domain/horse/breeds';
import { createStarterHorse, generateStarterHorseWeightKg, STARTER_HORSE_GENDERS } from '../../domain/horse/horse';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { BREED_SHOP_REPOSITORY, type BreedShopRepository } from '../ports/breed-shop.repository';

export interface BuyBreedHorseInput {
  playerId: string;
  breedKey: unknown;
  name: unknown;
  gender: unknown;
  idempotencyKey: string | null;
}

/**
 * IRK MAĞAZASI (07.10.2026). Sahibinin kuralı: ücretsiz başlangıç atı en
 * zayıf ırktır; güçlü ırklar burada OYUN PARASIYLA alınır (elmasla değil —
 * `economy.gemShopWhitelist` yalnızca kozmetiktir) ve seviye kapısı vardır.
 *
 * Fiyat, seviye şartı ve statlar YALNIZCA config'ten gelir; istemci yalnızca
 * ırk anahtarı, ad ve cinsiyet gönderir. Aynı isteğin tekrarı ikinci bir at +
 * ikinci bir ödeme olurdu → uç `Idempotency-Key` ister.
 */
@Injectable()
export class BreedShopUseCase {
  constructor(
    @Inject(BREED_SHOP_REPOSITORY) private readonly shop: BreedShopRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async buy(input: BuyBreedHorseInput): Promise<{ horse: Horse; price: number; money: number }> {
    const breed = getBreed(this.config.breeds, input.breedKey);
    if (typeof input.gender !== 'string' || !(STARTER_HORSE_GENDERS as readonly string[]).includes(input.gender)) {
      // esbuild altında DTO doğrulaması atlanır (CLAUDE.md kural 5) — kapı burada.
      throw new InvalidHorseGenderError();
    }
    const id = randomUUID();
    // `createStarterHorse` adı doğrular (`validateHorseName`) ve ırkın
    // kalite/potansiyelini yazar — başlangıç atıyla AYNI fabrika.
    const horse = createStarterHorse({
      id,
      ownerId: input.playerId,
      breed,
      ageMonths: this.config.breeds.shopHorseAgeMonths,
      name: input.name as string,
      gender: input.gender as HorseGender,
      appearance: deriveAppearance(id, this.config.horseAppearance, breed.coatWeights),
      weightKg: generateStarterHorseWeightKg([Math.random(), Math.random(), Math.random()]),
    });
    const { money } = await this.shop.purchase({
      playerId: input.playerId,
      breed,
      horse,
      initial: deriveBreedInitialStats(id, breed, this.config.breeds.statJitter),
      idempotencyKey: input.idempotencyKey,
    });
    return { horse, price: breed.priceMoney, money };
  }
}
