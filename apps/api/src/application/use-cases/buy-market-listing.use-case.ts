import { Inject, Injectable } from '@nestjs/common';
import type { MarketListing, Player } from '@at-sevdalisi/shared-types';
import { purchaseListing } from '../../domain/market/market';
import { ListingNotFoundError } from '../../domain/market/errors';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { MARKET_LISTING_REPOSITORY, type MarketListingRepository } from '../ports/market-listing.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

export interface BuyMarketListingResult {
  listing: MarketListing;
  buyerBalance: { money: number; gems: number };
  sellerBalance: { money: number; gems: number };
}

/**
 * `POST /market/listings/{id}/buy` (docs/API.md §5, brief §30/§31) —
 * `Idempotency-Key` ZORUNLU (bkz. `api/market/market.controller.ts`).
 *
 * FAZ 1 wiring, on birinci dilim — `domain/market/market.ts`'teki
 * `purchaseListing` (FAZ 0'dan beri hazır, `wallet.transfer`'i çağırır)
 * BURADA İLK KEZ gerçekten orkestre edilir. Bu, `transfer`'in ve
 * `PlayerRepository.updateTwoWithLock`'un İLK gerçek kullanıcısıdır —
 * Ahır Yükseltme/Günlük Ödül/Pratik Yarış'ın hepsi TEK oyuncunun kendi
 * bakiyesini değiştiriyordu, bu ise İKİ oyuncu arasında (bkz.
 * `updateTwoWithLock` doc yorumu, docs/SECURITY.md §5).
 *
 * SIRALAMA — bilerek üç AYRI adımda, üç AYRI transaction'da:
 *  1. `updateTwoWithLock` İÇİNDE: `purchaseListing` çağrılır (self-satın
 *     alma/aktif-değil/süresi-dolmuş kontrolleri + `transfer` — hepsi
 *     satırlar kilitliyken); bu adım BAŞARISIZ olursa (`InsufficientFundsError`
 *     dahil TÜM domain hataları) transaction ROLLBACK olur, PARA HİÇ
 *     el değiştirmez, sonraki adımlar hiç ÇALIŞMAZ.
 *  2. `horseRepository.update(...)`: atın `ownerId`'si alıcıya geçer.
 *  3. `marketListingRepository.update(...)`: ilan `sold` durumuna geçer.
 *
 * BİLİNÇLİ KABUL EDİLMİŞ RİSK (bu dilim): 2. ve 3. adımlar 1. adımla AYNI
 * transaction'da DEĞİLDİR (`PlayerRepository`/`HorseRepository`/
 * `MarketListingRepository` üç AYRI port'tur, aralarında ortak bir
 * transaction sınırı YOKTUR) — `run-practice-race.use-case.ts`'in wallet
 * güncellemesini yarış kaydından AYRI yapmasıyla AYNI, önceden kabul
 * edilmiş mimari desen (bkz. o use-case'in doc yorumu). AYRICA: `listing`
 * kilitlenmeden (`SELECT ... FOR UPDATE` OLMADAN) okunur — bu yüzden
 * AYNI ilana iki FARKLI alıcının TAM OLARAK aynı anda `buy` çağırması
 * (bu projenin henüz gerçek eşzamanlı bir kullanıcı tabanı olmadığından
 * son derece nadir) teorik olarak ikisinin de parasını çekebilir; bu,
 * `IdempotencyInterceptor`'ın KENDİ "dağıtık kilit yok" sınırlamasıyla
 * AYNI kategori bir kabul edilmiş risktir — ayrı bir sertleştirme
 * dilimini hak eder (docs/ROADMAP.md).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık
 * `@Inject()` ile enjekte edilir.
 */
@Injectable()
export class BuyMarketListingUseCase {
  constructor(
    @Inject(MARKET_LISTING_REPOSITORY) private readonly marketListingRepository: MarketListingRepository,
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
  ) {}

  async execute(listingId: string, buyerId: string): Promise<BuyMarketListingResult> {
    const listing = await this.marketListingRepository.findById(listingId);
    if (listing === null) {
      throw new ListingNotFoundError(listingId);
    }

    const walletResult = await this.playerRepository.updateTwoWithLock(buyerId, listing.sellerId, (buyer, seller) => {
      const purchase = purchaseListing(
        listing,
        buyerId,
        { money: buyer.money, gems: buyer.gems },
        { money: seller.money, gems: seller.gems },
      );

      const now = new Date().toISOString();
      const updatedBuyer: Player = { ...buyer, money: purchase.buyerBalance.money, gems: purchase.buyerBalance.gems, updatedAt: now };
      const updatedSeller: Player = { ...seller, money: purchase.sellerBalance.money, gems: purchase.sellerBalance.gems, updatedAt: now };

      return { buyer: updatedBuyer, seller: updatedSeller, result: purchase };
    });

    if (walletResult === null) {
      throw new PlayerNotFoundError(buyerId);
    }

    const horse = await this.horseRepository.findById(listing.horseId);
    if (horse === null) {
      // Veri bütünlüğü varsayımı ihlali: `market_listings.horse_id` FK'i
      // `horses(id)` üzerinde `ON DELETE CASCADE`'dir — at silinirse ilan
      // da CASCADE ile silinir; bu dala normal koşullarda ULAŞILMAZ.
      throw new HorseNotFoundError(listing.horseId);
    }
    await this.horseRepository.update({ ...horse, ownerId: buyerId, updatedAt: new Date().toISOString() });
    await this.marketListingRepository.update(walletResult.listing);

    return {
      listing: walletResult.listing,
      buyerBalance: walletResult.buyerBalance,
      sellerBalance: walletResult.sellerBalance,
    };
  }
}
