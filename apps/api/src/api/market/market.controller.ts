import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, UseInterceptors } from '@nestjs/common';
import type { ApiSuccess, MarketListing } from '@at-sevdalisi/shared-types';
import { BuyMarketListingUseCase, type BuyMarketListingResult } from '../../application/use-cases/buy-market-listing.use-case';
import { CancelMarketListingUseCase } from '../../application/use-cases/cancel-market-listing.use-case';
import { CreateMarketListingUseCase } from '../../application/use-cases/create-market-listing.use-case';
import { GetMarketListingUseCase } from '../../application/use-cases/get-market-listing.use-case';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { BuyMarketListingDto } from './dto/buy-market-listing.dto';
import { CreateMarketListingDto } from './dto/create-market-listing.dto';

/**
 * docs/API.md §5 "Market (At Pazarı)" (brief §30). FAZ 1 wiring, on
 * birinci dilim — `domain/market/market.ts`'in FAZ 0'dan beri hazır ama
 * hiç ÇAĞRILMAYAN saf fonksiyonlarını (`createListingDraft`/
 * `purchaseListing`/`cancelListing`) gerçek veritabanına bağlayan İLK
 * dilim; ayrıca `wallet.transfer`'in ve `PlayerRepository.
 * updateTwoWithLock`'un İLK gerçek kullanıcısı (bkz. o use-case'lerin
 * doc yorumları).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık
 * `@Inject()` ile enjekte edilir.
 */
@Controller('market')
export class MarketController {
  constructor(
    @Inject(CreateMarketListingUseCase) private readonly createMarketListingUseCase: CreateMarketListingUseCase,
    @Inject(GetMarketListingUseCase) private readonly getMarketListingUseCase: GetMarketListingUseCase,
    @Inject(BuyMarketListingUseCase) private readonly buyMarketListingUseCase: BuyMarketListingUseCase,
    @Inject(CancelMarketListingUseCase) private readonly cancelMarketListingUseCase: CancelMarketListingUseCase,
  ) {}

  // `PlayerController.register` ile AYNI gerekçeyle 201 Created — bu,
  // train/care/upgrade'in aksine, kendi id'sine sahip YENİ bir kaynak
  // (bir ilan) yaratır.
  @Post('listings')
  @HttpCode(HttpStatus.CREATED)
  async createListing(@Body() dto: CreateMarketListingDto): Promise<ApiSuccess<MarketListing>> {
    const listing = await this.createMarketListingUseCase.execute({ horseId: dto.horseId, price: dto.price });
    return { success: true, data: listing };
  }

  @Get('listings/:id')
  async getListing(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<MarketListing>> {
    const listing = await this.getMarketListingUseCase.execute(id);
    return { success: true, data: listing };
  }

  // Para değiştiren bir endpoint (brief §54) — `Idempotency-Key` header'ı
  // ZORUNLUDUR (bkz. `IdempotencyInterceptor` doc yorumu). Yeni bir
  // KAYNAK yaratmaz (var olan ilanın durumunu değiştirir) — Pratik
  // Yarış/Ahır Yükseltme ile AYNI gerekçeyle 200 OK.
  @Post('listings/:id/buy')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async buyListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BuyMarketListingDto,
  ): Promise<ApiSuccess<BuyMarketListingResult>> {
    const result = await this.buyMarketListingUseCase.execute(id, dto.buyerId);
    return { success: true, data: result };
  }

  @Delete('listings/:id')
  @HttpCode(HttpStatus.OK)
  async cancelListing(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<MarketListing>> {
    const listing = await this.cancelMarketListingUseCase.execute(id);
    return { success: true, data: listing };
  }
}
