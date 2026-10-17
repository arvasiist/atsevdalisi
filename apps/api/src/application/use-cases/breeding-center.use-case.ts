import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { BreedingCenterView, BreedingOfferView, MyStudView, PregnancyView } from '@at-sevdalisi/shared-types';
import { gestationDurationMs } from '../../domain/breeding/breeding-center';
import { BreedingOfferNotFoundError } from '../../domain/breeding/errors';
import { validateHorseName } from '../../domain/horse/validation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import {
  BREEDING_OFFER_REPOSITORY,
  BREEDING_RANDOM,
  BREEDING_REPOSITORY,
  type BreedingOfferRepository,
  type BreedingRandomSource,
  type BreedingRepository,
} from '../ports/breeding.repository';
import { FarmEffectsService } from './farm-effects.service';

const MS_PER_DAY = 86_400_000;

export interface BreedingDueResult {
  expiredOffers: number;
  births: number;
}

/**
 * 16.10.2026 — ÇİFTLEŞTİRME MERKEZİ (brief §4–§5): aygır ilanı, teklif
 * (emanet), kabul/ret/iptal, gebelik bakımı, süre dolumu + doğum turu.
 * Kurallar ve para hareketleri depodadır (kilit altında); burası girdiyi
 * doğrular ve oyuncuya önceden gösterilen kuralları üretir.
 */
@Injectable()
export class BreedingCenterUseCase {
  constructor(
    @Inject(BREEDING_REPOSITORY) private readonly breeding: BreedingRepository,
    @Inject(BREEDING_OFFER_REPOSITORY) private readonly offers: BreedingOfferRepository,
    @Inject(BREEDING_RANDOM) private readonly random: BreedingRandomSource,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(FarmEffectsService) private readonly farmEffects: FarmEffectsService,
  ) {}

  async getCenter(playerId: string, now: Date = new Date()): Promise<BreedingCenterView> {
    const genetics = this.config.genetics;
    const limit = genetics.breedingCenter.historyLimit;
    const [myStuds, offers, pregnancies] = await Promise.all([
      this.offers.findMyStuds(playerId, now),
      this.offers.listOffers(playerId, limit),
      this.breeding.listPregnancies(playerId, limit, now),
    ]);
    return {
      rules: {
        gestationDays: Math.round(gestationDurationMs(genetics) / MS_PER_DAY),
        offerExpiryHours: genetics.breedingCenter.offerExpiryHours,
        failedConceptionRefundPercent: genetics.breedingCenter.failedConceptionRefundPercent,
        ownerSharePercent: genetics.studFeeOwnerSharePercent,
        checkupCost: genetics.pregnancyCare.checkupCost,
        checkupIntervalHours: genetics.pregnancyCare.checkupIntervalHours,
        failedAttemptCooldownHours: genetics.conception.failedAttemptCooldownHours,
        minConceptionChance: genetics.conception.minChance,
        maxConceptionChance: genetics.conception.maxChance,
      },
      myStuds,
      incomingOffers: offers.filter((offer) => offer.direction === 'incoming'),
      outgoingOffers: offers.filter((offer) => offer.direction === 'outgoing'),
      pregnancies,
    };
  }

  /** Ücret HAM geçirilir; tam sayı + sınır denetimi depoda (kilitli aygırla). */
  putListing(ownerId: string, stallionId: string, fee: unknown): Promise<MyStudView> {
    return this.offers.upsertStudListing({ ownerId, stallionId, fee, now: new Date() });
  }

  withdrawListing(ownerId: string, stallionId: string): Promise<{ cancelledOffers: number }> {
    return this.offers.withdrawStudListing({ ownerId, stallionId, now: new Date() });
  }

  createOffer(
    mareOwnerId: string,
    mareId: string,
    stallionId: string,
    rawFoalName: unknown,
    idempotencyKey: string | null,
  ): Promise<BreedingOfferView> {
    const foalName = validateHorseName(rawFoalName);
    return this.offers.createOffer({
      offerId: randomUUID(),
      mareOwnerId,
      mareId,
      stallionId,
      foalName,
      idempotencyKey,
      now: new Date(),
    });
  }

  async acceptOffer(actorId: string, offerId: string): Promise<BreedingOfferView> {
    const mareOwnerId = await this.offers.findOfferMareOwner(offerId);
    if (mareOwnerId === null) throw new BreedingOfferNotFoundError(offerId);
    // Üreme merkezi etkisi TAYIN SAHİBİNİN (kısrak sahibi) çiftliğinden gelir.
    const { birthHealthRiskMultiplier } = await this.farmEffects.effectsFor(mareOwnerId);
    return this.offers.acceptOffer({
      offerId,
      actorId,
      now: new Date(),
      random: () => this.random.next(),
      birthHealthRiskMultiplier,
    });
  }

  rejectOffer(actorId: string, offerId: string): Promise<BreedingOfferView> {
    return this.offers.rejectOffer({ offerId, actorId, now: new Date() });
  }

  cancelOffer(actorId: string, offerId: string): Promise<BreedingOfferView> {
    return this.offers.cancelOffer({ offerId, actorId, now: new Date() });
  }

  performCheckup(actorId: string, pregnancyId: string, idempotencyKey: string | null): Promise<PregnancyView> {
    return this.breeding.performCheckup({ pregnancyId, actorId, now: new Date(), idempotencyKey });
  }

  /** Zamanlayıcı turu: süresi dolan teklifler iade, vakti gelen doğumlar. */
  async runDue(now: Date): Promise<BreedingDueResult> {
    const batch = this.config.genetics.breedingCenter.scheduler.batchSize;
    const expiredOffers = await this.offers.expireDueOffers(now, batch);
    const births = await this.breeding.deliverDueBirths(now, batch);
    return { expiredOffers, births };
  }
}
