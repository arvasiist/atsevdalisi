import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { MarketListing } from '@at-sevdalisi/shared-types';
import { createListingDraft } from '../../domain/market/market';
import { HorseAlreadyListedError } from '../../domain/market/errors';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { MARKET_LISTING_REPOSITORY, type MarketListingRepository } from '../ports/market-listing.repository';

export interface CreateMarketListingInput {
  horseId: string;
  price: number;
  /** FAZ 1 wiring, on üçüncü dilim (bu oturum) — verilmezse ilan süresizdir. */
  expiresInHours?: number;
}

/**
 * `POST /market/listings` (docs/API.md §5, brief §30 At Pazarı).
 *
 * FAZ 1 wiring, on birinci dilim — `domain/market/market.ts`'teki
 * `createListingDraft` FAZ 0'dan beri hazırdı ama hiç ÇAĞRILMIYORDU; bu
 * use-case onu gerçek `HorseRepository`/`MarketListingRepository`'ye
 * bağlayan orkestrasyondur (`RunPracticeRaceUseCase`'in FAZ 5'te hazır
 * `simulateRace`'i ilk kez orkestre etmesiyle AYNI kategori).
 *
 * `sellerId` request GÖVDESİNDEN ALINMAZ — atın `ownerId`'sinden
 * TÜRETİLİR (bir at yalnızca TEK bir oyuncuya ait olduğundan, ayrı bir
 * `sellerId` alanı hem gereksizdir hem de sahte/uyumsuz bir değer
 * gönderilmesine açık bir kapı olurdu — `IdempotencyInterceptor`'ın
 * `horseId`'den `playerId` türetmesiyle AYNI gerekçe).
 *
 * KAPSAM (bu dilim, bilinçli):
 *  - `listingType` her zaman `fixed_price`'tır — `auction` şemada VAR
 *    ama teklif verme/kazanma mantığı domain katmanında hiç YOK (bkz.
 *    `domain/market/README.md` "Kapsam dışı"), bu yüzden API'den hiç
 *    kabul EDİLMEZ (yanıltıcı olurdu).
 *  - Bir atın aynı anda yalnızca TEK aktif ilanı olabilir — `HORSE_
 *    ALREADY_LISTED` (bkz. `domain/market/errors.ts`
 *    `HorseAlreadyListedError` doc yorumu — bu, `purchaseListing`'in
 *    "ilk alıcıdan SONRA da başka bir ilan satın alınabilir kalır" hatasını
 *    ÖNLER).
 *  - Sakat/çok genç/damızlıkta olan bir at satışa çıkarılabilir mi gibi
 *    ek iş kuralları YOK (brief bunu ayrıca belirtmiyor) — KAPSAM DIŞI.
 *
 * FAZ 1 wiring, on üçüncü dilim (bu oturum) — `expiresInHours` (opsiyonel)
 * YENİ eklendi; verilmezse ilan öncekiyle AYNI şekilde süresizdir. Bir
 * ilanın süresi dolduğunda gerçekten `expired`'a çevrilmesi BURADA değil,
 * `PostgresMarketListingRepository`'nin okuma yollarındaki TEMBEL
 * süpürmede olur (bkz. o dosyanın doc yorumu, `domain/market/market.ts`
 * `expireListingIfNeeded` doc yorumu) — bu ÖNEMLİDİR: `findActiveByHorseId`
 * BU KULLANIM DURUMUNUN (yeni ilan oluşturma) da içinden çağrıldığı için,
 * süresi YENİ dolmuş eski bir ilan artık "aktif" sayılmaz ve aynı at için
 * yeni bir ilan oluşturmayı YANLIŞLIKLA engellemez.
 */
@Injectable()
export class CreateMarketListingUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository,
  ) {}

  async execute(input: CreateMarketListingInput): Promise<MarketListing> {
    const horse = await this.horseRepository.findById(input.horseId);
    if (horse === null) {
      throw new HorseNotFoundError(input.horseId);
    }

    const existingActiveListing = await this.marketListingRepository.findActiveByHorseId(input.horseId);
    if (existingActiveListing !== null) {
      throw new HorseAlreadyListedError(input.horseId);
    }

    const listing = createListingDraft({
      id: randomUUID(),
      sellerId: horse.ownerId,
      horseId: input.horseId,
      price: input.price,
      listingType: 'fixed_price',
      expiresInHours: input.expiresInHours,
    });

    await this.marketListingRepository.save(listing);

    return listing;
  }
}
