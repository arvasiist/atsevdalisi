import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { ApiSuccess, ListingStatus, MarketListing } from '@at-sevdalisi/shared-types';
import { BuyMarketListingUseCase, type BuyMarketListingResult } from '../../application/use-cases/buy-market-listing.use-case';
import { CancelMarketListingUseCase } from '../../application/use-cases/cancel-market-listing.use-case';
import { CreateMarketListingUseCase } from '../../application/use-cases/create-market-listing.use-case';
import { GetMarketListingUseCase } from '../../application/use-cases/get-market-listing.use-case';
import { ListMarketListingsBySellerUseCase } from '../../application/use-cases/list-market-listings-by-seller.use-case';
import { ListMarketListingsUseCase } from '../../application/use-cases/list-market-listings.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { HorseOwnerGuardByBodyField } from '../auth/horse-owner.guard';
import { ListingOwnerGuard } from '../auth/listing-owner.guard';
import { Public } from '../auth/public.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { CreateMarketListingDto } from './dto/create-market-listing.dto';

const LISTING_STATUSES: readonly ListingStatus[] = ['active', 'sold', 'expired', 'cancelled'];

/** `status` sorgu parametresini doğrular. Verilmemişse `undefined` döner — varsayılan, ÇAĞIRANA aittir (bkz. `listListings`/`listMyListings`). */
function parseOptionalStatus(raw: string | undefined): ListingStatus | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!LISTING_STATUSES.includes(raw as ListingStatus)) {
    throw new BadRequestException(`status şunlardan biri olmalıdır: ${LISTING_STATUSES.join(', ')}`);
  }
  return raw as ListingStatus;
}

/** `minPrice`/`maxPrice` gibi negatif olmayan tam sayı sorgu parametrelerini doğrular. */
function parseOptionalNonNegativeInt(raw: string | undefined, paramName: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${paramName} negatif olmayan bir tam sayı olmalıdır.`);
  }
  return value;
}

/** `page`/`pageSize` gibi 1'den başlayan (opsiyonel üst sınırlı) tam sayı sorgu parametrelerini doğrular. */
function parseBoundedInt(raw: string | undefined, paramName: string, defaultValue: number, max?: number): number {
  if (raw === undefined) {
    return defaultValue;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || (max !== undefined && value > max)) {
    throw new BadRequestException(`${paramName}, 1${max !== undefined ? `-${max}` : ''} aralığında bir tam sayı olmalıdır.`);
  }
  return value;
}

/**
 * docs/API.md §5 "Market (At Pazarı)" (brief §30). FAZ 1 wiring, on
 * birinci dilim — `domain/market/market.ts`'in FAZ 0'dan beri hazır ama
 * hiç ÇAĞRILMAYAN saf fonksiyonlarını (`createListingDraft`/
 * `purchaseListing`/`cancelListing`) gerçek veritabanına bağlayan İLK
 * dilim; ayrıca `wallet.transfer`'in ve `PlayerRepository.
 * updateTwoWithLock`'un İLK gerçek kullanıcısı (bkz. o use-case'lerin
 * doc yorumları). On ikinci dilim — tarama (`listListings`) ve
 * "İlanlarım" (`listMyListings`) salt-okunur uç noktaları eklendi;
 * `listListings`, docs/API.md §1.4'te FAZ 0'dan beri belgelenmiş ama
 * HİÇBİR endpoint'te kullanılmamış sayfalama zarfının İLK kullanıcısıdır.
 * On üçüncü dilim — ilan oluşturma artık opsiyonel `expiresInHours` kabul
 * eder; süresi dolan ilanların gerçekten `expired`'a çevrilmesi
 * `PostgresMarketListingRepository`'nin TEMBEL süpürmesiyle olur (bu
 * controller'da GÖRÜNMEZ bir davranıştır — bkz. o dosyanın doc yorumu).
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
    @Inject(ListMarketListingsUseCase) private readonly listMarketListingsUseCase: ListMarketListingsUseCase,
    @Inject(ListMarketListingsBySellerUseCase)
    private readonly listMarketListingsBySellerUseCase: ListMarketListingsBySellerUseCase,
  ) {}

  // `PlayerController.register` ile AYNI gerekçeyle 201 Created — bu,
  // train/care/upgrade'in aksine, kendi id'sine sahip YENİ bir kaynak
  // (bir ilan) yaratır.
  //
  // AUDIT_REPORT.md Bulgu S2/S4 hardening (bu oturum) — `HorseOwnerGuard('body')`:
  // yalnızca KENDİ atını satışa çıkarabilir (bkz. o dosyanın doc yorumu).
  @UseGuards(HorseOwnerGuardByBodyField)
  @Post('listings')
  @HttpCode(HttpStatus.CREATED)
  async createListing(@Body() dto: CreateMarketListingDto): Promise<ApiSuccess<MarketListing>> {
    const listing = await this.createMarketListingUseCase.execute({
      horseId: dto.horseId,
      price: dto.price,
      expiresInHours: dto.expiresInHours,
    });
    return { success: true, data: listing };
  }

  // Tarama (browse) ekranı — `status` verilmezse yalnızca `active` ilanlar
  // döner (bir alıcının satın ALABİLECEĞİ ilanlar varsayılan görünümdür;
  // `HorseController.listByOwner` ile AYNI gerekçeyle `@Query()` +
  // elle doğrulama kullanılır, henüz hiçbir GET uç noktasında bir DTO
  // sınıfı yok). docs/API.md §1.4'teki sayfalama zarfının İLK kullanıcısı.
  @Public()
  @Get('listings')
  async listListings(
    @Query('status') statusRaw: string | undefined,
    @Query('minPrice') minPriceRaw: string | undefined,
    @Query('maxPrice') maxPriceRaw: string | undefined,
    @Query('page') pageRaw: string | undefined,
    @Query('pageSize') pageSizeRaw: string | undefined,
  ): Promise<ApiSuccess<MarketListing[]>> {
    const status = parseOptionalStatus(statusRaw) ?? 'active';
    const minPrice = parseOptionalNonNegativeInt(minPriceRaw, 'minPrice');
    const maxPrice = parseOptionalNonNegativeInt(maxPriceRaw, 'maxPrice');
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      throw new BadRequestException('minPrice, maxPrice değerinden büyük olamaz.');
    }
    const page = parseBoundedInt(pageRaw, 'page', 1);
    const pageSize = parseBoundedInt(pageSizeRaw, 'pageSize', 20, 100);

    const result = await this.listMarketListingsUseCase.execute({ status, minPrice, maxPrice, page, pageSize });
    return { success: true, data: result.items, meta: result.meta };
  }

  // "İlanlarım" ekranı — `sellerId` sorgu parametresi olarak AÇIKÇA alınır
  // (geriye dönük uyumluluk için — istemci zaten kendi id'sini gönderir),
  // ama artık AUDIT_REPORT.md Bulgu S4 hardening'i (bu oturum) gereği
  // `assertSelf` ile kimlik doğrulanmış oyuncuya EŞİT olması ZORUNLUDUR.
  // `status` verilmezse TÜM durumlardaki ilanlar döner (sayfalama YOK —
  // bkz. `MarketListingRepository.findBySellerId` doc yorumu).
  //
  // NOT — bu route `GET /market/listings/:id` ile ÇAKIŞMAZ: NestJS,
  // rotaları segment SAYISINA göre eşleştirir ("my-listings" tek segment,
  // "listings/:id" iki segment), bu yüzden bildirim SIRASI önemsizdir.
  @Get('my-listings')
  async listMyListings(
    @Query('sellerId') sellerId: string | undefined,
    @Query('status') statusRaw: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<MarketListing[]>> {
    if (!sellerId || !isUUID(sellerId)) {
      throw new BadRequestException('sellerId geçerli bir UUID olmalıdır.');
    }
    assertSelf(currentPlayer.id, sellerId);
    const status = parseOptionalStatus(statusRaw);
    const listings = await this.listMarketListingsBySellerUseCase.execute(sellerId, status);
    return { success: true, data: listings };
  }

  @Public()
  @Get('listings/:id')
  async getListing(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<MarketListing>> {
    const listing = await this.getMarketListingUseCase.execute(id);
    return { success: true, data: listing };
  }

  // Para değiştiren bir endpoint (brief §54) — `Idempotency-Key` header'ı
  // ZORUNLUDUR (bkz. `IdempotencyInterceptor` doc yorumu). Yeni bir
  // KAYNAK yaratmaz (var olan ilanın durumunu değiştirir) — Pratik
  // Yarış/Ahır Yükseltme ile AYNI gerekçeyle 200 OK.
  //
  // AUDIT_REPORT.md Bulgu S2/S4 hardening (bu oturum) — `buyerId` artık
  // gövdede GÖNDERİLMEZ (eskiden client'ın gönderdiği HERHANGİ bir
  // `buyerId` doğrudan kullanılıyordu — başka bir oyuncu adına, o oyuncu
  // HİÇ HABERSİZ, satın alma yapılabiliyordu). Alıcı kimliği artık
  // YALNIZCA `AuthGuard`'ın doğruladığı `@CurrentPlayer()`'dan gelir.
  // `@IdempotencyScope('player')`: kapsam artık `request.player.id`'dir
  // (eski `body.buyerId` özel durumunun YERİNİ alır, bkz.
  // `idempotency-scope.decorator.ts` doc yorumu — E3'ün "alıcıya göre
  // kapsam" korumasını KAYBETMEDEN).
  @IdempotencyScope('player')
  @Post('listings/:id/buy')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async buyListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BuyMarketListingResult>> {
    // AUDIT_AND_HARDENING Öncelik 2 (bu oturum) — header burada zaten
    // `IdempotencyInterceptor` tarafından ZORUNLU kılınmıştır (yoksa bu
    // satıra hiç ULAŞILMAZ); değer yalnızca ledger satırına İZ olarak
    // taşınır (bkz. `BuyMarketListingUseCase` doc yorumu), replay
    // KONTROLÜ hâlâ interceptor'ın kendi sorumluluğudur.
    const result = await this.buyMarketListingUseCase.execute(id, currentPlayer.id, idempotencyKey ?? null);
    return { success: true, data: result };
  }

  // AUDIT_REPORT.md Bulgu S4 hardening (bu oturum) — `ListingOwnerGuard`
  // (bkz. o dosyanın doc yorumu): yalnızca KENDİ ilanını iptal edebilir.
  @UseGuards(ListingOwnerGuard)
  @Delete('listings/:id')
  @HttpCode(HttpStatus.OK)
  async cancelListing(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<MarketListing>> {
    const listing = await this.cancelMarketListingUseCase.execute(id);
    return { success: true, data: listing };
  }
}
