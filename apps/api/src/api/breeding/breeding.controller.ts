import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type {
  ApiSuccess,
  BreedingAttemptView,
  BreedingCenterView,
  BreedingOfferView,
  MyStudView,
  PregnancyView,
  StudListingView,
} from '@at-sevdalisi/shared-types';
import { BreedHorsesUseCase } from '../../application/use-cases/breed-horses.use-case';
import { BreedingCenterUseCase } from '../../application/use-cases/breeding-center.use-case';
import { ListStudsUseCase } from '../../application/use-cases/list-studs.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { HorseOwnerGuard } from '../auth/horse-owner.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { BreedHorsesDto } from './dto/breed-horses.dto';
import { CreateBreedingOfferDto, StudListingDto } from './dto/breeding-center.dto';

const BREED_KEY_PATTERN = /^[a-z0-9-]{1,40}$/;

/**
 * Çiftleştirme + çiftleştirme merkezi (brief §4–§5, 16.10.2026).
 *
 * İKİNCİ SAVUNMA HATTI: gövdedeki UUID alanları elle `isUUID()` ile denetlenir
 * — Vitest/esbuild `design:paramtypes` üretmediği için `ValidationPipe` gövde
 * doğrulamasını SESSİZCE atlar (CLAUDE.md kural 5; geçersiz UUID 500 olurdu).
 */
@Controller()
export class BreedingController {
  constructor(
    @Inject(BreedHorsesUseCase) private readonly breedHorsesUseCase: BreedHorsesUseCase,
    @Inject(ListStudsUseCase) private readonly listStudsUseCase: ListStudsUseCase,
    @Inject(BreedingCenterUseCase) private readonly center: BreedingCenterUseCase,
  ) {}

  /** İlandaki aygırlar; `breed` (ırk anahtarı) ve `maxFee` ile süzülür. */
  @Get('breeding/studs')
  async listStuds(
    @Query('breed') breed: string | undefined,
    @Query('maxFee') maxFee: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<StudListingView[]>> {
    if (breed !== undefined && !BREED_KEY_PATTERN.test(breed)) {
      throw new BadRequestException('breed geçerli bir ırk anahtarı olmalıdır.');
    }
    const parsedMaxFee = maxFee === undefined ? null : Number(maxFee);
    if (parsedMaxFee !== null && (!Number.isInteger(parsedMaxFee) || parsedMaxFee < 0)) {
      throw new BadRequestException('maxFee negatif olmayan bir tam sayı olmalıdır.');
    }
    const data = await this.listStudsUseCase.execute(currentPlayer.id, { breed: breed ?? null, maxFee: parsedMaxFee });
    return { success: true, data };
  }

  /** Çağıranın merkezi: kurallar, aygırları/ilanları, gelen + giden teklifler, gebelikler. */
  @Get('breeding/center')
  async getCenter(@CurrentPlayer() currentPlayer: AuthenticatedPlayer): Promise<ApiSuccess<BreedingCenterView>> {
    return { success: true, data: await this.center.getCenter(currentPlayer.id) };
  }

  @RateLimit({ name: 'stud-listing', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @UseGuards(HorseOwnerGuard('param', 'stallionId'))
  @Put('breeding/studs/:stallionId')
  async putListing(
    @Param('stallionId', ParseUUIDPipe) stallionId: string,
    @Body() dto: StudListingDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<MyStudView>> {
    // Ücret HAM geçer: tam sayı + sınır denetimi depoda (kilitli aygırla).
    return { success: true, data: await this.center.putListing(currentPlayer.id, stallionId, dto?.fee) };
  }

  @RateLimit({ name: 'stud-listing-withdraw', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @Delete('breeding/studs/:stallionId')
  async withdrawListing(
    @Param('stallionId', ParseUUIDPipe) stallionId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<{ cancelledOffers: number }>> {
    return { success: true, data: await this.center.withdrawListing(currentPlayer.id, stallionId) };
  }

  /** PARA YOLU — ücret emanete alınır; `Idempotency-Key` ZORUNLU. */
  @RateLimit({ name: 'breeding-offer', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post('breeding/offers')
  @UseInterceptors(IdempotencyInterceptor)
  async createOffer(
    @Body() dto: CreateBreedingOfferDto,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BreedingOfferView>> {
    if (!dto?.mareId || !isUUID(dto.mareId)) {
      throw new BadRequestException('mareId geçerli bir UUID olmalıdır.');
    }
    if (!dto.stallionId || !isUUID(dto.stallionId)) {
      throw new BadRequestException('stallionId geçerli bir UUID olmalıdır.');
    }
    const offer = await this.center.createOffer(
      currentPlayer.id,
      dto.mareId,
      dto.stallionId,
      dto.foalName,
      idempotencyKey ?? null,
    );
    return { success: true, data: offer };
  }

  /** Tekrar koruması `pending → accepted` geçişidir (ikinci kabul 409). */
  @RateLimit({ name: 'breeding-offer-answer', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @Post('breeding/offers/:offerId/accept')
  @HttpCode(200)
  async accept(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BreedingOfferView>> {
    return { success: true, data: await this.center.acceptOffer(currentPlayer.id, offerId) };
  }

  @RateLimit({ name: 'breeding-offer-answer', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @Post('breeding/offers/:offerId/reject')
  @HttpCode(200)
  async reject(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BreedingOfferView>> {
    return { success: true, data: await this.center.rejectOffer(currentPlayer.id, offerId) };
  }

  @RateLimit({ name: 'breeding-offer-cancel', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @Post('breeding/offers/:offerId/cancel')
  @HttpCode(200)
  async cancel(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BreedingOfferView>> {
    return { success: true, data: await this.center.cancelOffer(currentPlayer.id, offerId) };
  }

  /** PARA YOLU — gebelik veteriner kontrolü; `Idempotency-Key` ZORUNLU. */
  @RateLimit({ name: 'pregnancy-checkup', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post('breeding/pregnancies/:pregnancyId/checkups')
  @UseInterceptors(IdempotencyInterceptor)
  async checkup(
    @Param('pregnancyId', ParseUUIDPipe) pregnancyId: string,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PregnancyView>> {
    return { success: true, data: await this.center.performCheckup(currentPlayer.id, pregnancyId, idempotencyKey ?? null) };
  }

  /**
   * Kendi kısrağı × KENDİ aygırı. Başkasının aygırı → 409
   * `BREEDING_REQUIRES_AGREEMENT` (önce teklif). Tay anında doğmaz.
   */
  @RateLimit({ name: 'breeding', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post('players/:id/breeding')
  @UseInterceptors(IdempotencyInterceptor)
  async breed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BreedHorsesDto,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<BreedingAttemptView>> {
    assertSelf(currentPlayer.id, id);
    if (!dto?.mareId || !isUUID(dto.mareId)) {
      throw new BadRequestException('mareId geçerli bir UUID olmalıdır.');
    }
    if (!dto.stallionId || !isUUID(dto.stallionId)) {
      throw new BadRequestException('stallionId geçerli bir UUID olmalıdır.');
    }
    const result = await this.breedHorsesUseCase.execute(id, dto.mareId, dto.stallionId, dto.foalName);
    return { success: true, data: result };
  }
}
