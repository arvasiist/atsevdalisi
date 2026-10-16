import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { ApiSuccess, HorseEquipment, PurchaseHorseEquipmentResult } from '@at-sevdalisi/shared-types';
import { EquipHorseEquipmentUseCase } from '../../application/use-cases/equip-horse-equipment.use-case';
import { ListHorseEquipmentUseCase } from '../../application/use-cases/list-horse-equipment.use-case';
import { PurchaseHorseEquipmentUseCase } from '../../application/use-cases/purchase-horse-equipment.use-case';
import { UnequipHorseEquipmentUseCase } from '../../application/use-cases/unequip-horse-equipment.use-case';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { PurchaseHorseEquipmentDto } from './dto/purchase-horse-equipment.dto';

/**
 * docs/API.md §4 Horses (Ahır) — Ekipman (brief §14/§17,
 * `claude/hizli-bitirme-plani.md`'nin proje sahibi tarafından
 * önceliklendirdiği dilim). `@Controller('horses')` `TrainingController`
 * ile AYNI prefix'i paylaşır (tam rota yolları çakışmaz, bkz. o dosyanın
 * doc yorumu) — kendi `EquipmentModule`'ünde tutulur çünkü kendi
 * `HORSE_EQUIPMENT_REPOSITORY`'sine sahiptir.
 *
 * Rotalarda `:equipmentId`'ye BİLEREK `ParseUUIDPipe` uygulanır (`:id`
 * ile AYNI savunma) — `HorseOwnerGuardByParam` yalnızca `:id`'yi
 * doğrular, `:equipmentId`'nin GERÇEKTEN bu ata ait olup olmadığı
 * kontrolü ilgili use-case'e/repository'ye devredilir (bkz.
 * `equip-horse-equipment.use-case.ts` doc yorumu).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık
 * `@Inject()` ile enjekte edilir.
 */
@Controller('horses')
export class EquipmentController {
  constructor(
    @Inject(PurchaseHorseEquipmentUseCase) private readonly purchaseHorseEquipmentUseCase: PurchaseHorseEquipmentUseCase,
    @Inject(ListHorseEquipmentUseCase) private readonly listHorseEquipmentUseCase: ListHorseEquipmentUseCase,
    @Inject(EquipHorseEquipmentUseCase) private readonly equipHorseEquipmentUseCase: EquipHorseEquipmentUseCase,
    @Inject(UnequipHorseEquipmentUseCase) private readonly unequipHorseEquipmentUseCase: UnequipHorseEquipmentUseCase,
  ) {}

  @UseGuards(HorseOwnerGuardByParam)
  @Get(':id/equipment')
  async list(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<HorseEquipment[]>> {
    const items = await this.listHorseEquipmentUseCase.execute(id);
    return { success: true, data: items };
  }

  // KATALOGDAN ALIM (08.10.2026) — yeni bir KAYNAK yaratır, 201 Created.
  // PARA YOLU: `Idempotency-Key` ZORUNLU (yanıt ağda kaybolursa tekrar ikinci
  // parçayı ALMASIN) + `@RateLimit`. Gövdede yalnızca `catalogKey`.
  @RateLimit({ name: 'equipment-purchase', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @UseGuards(HorseOwnerGuardByParam)
  @Post(':id/equipment')
  @UseInterceptors(IdempotencyInterceptor)
  async purchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseHorseEquipmentDto,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PurchaseHorseEquipmentResult>> {
    const result = await this.purchaseHorseEquipmentUseCase.execute(
      player.id,
      id,
      dto?.catalogKey,
      idempotencyKey ?? null,
    );
    return { success: true, data: result };
  }

  // Kuşanma/çıkarma yeni bir KAYNAK yaratmaz (yalnızca var olan bir
  // ekipman satırını günceller) — `TrainingController.train` ile AYNI
  // gerekçeyle 200 OK döner.
  @UseGuards(HorseOwnerGuardByParam)
  @Post(':id/equipment/:equipmentId/equip')
  @HttpCode(HttpStatus.OK)
  async equip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('equipmentId', ParseUUIDPipe) equipmentId: string,
  ): Promise<ApiSuccess<HorseEquipment>> {
    const item = await this.equipHorseEquipmentUseCase.execute(id, equipmentId);
    return { success: true, data: item };
  }

  @UseGuards(HorseOwnerGuardByParam)
  @Post(':id/equipment/:equipmentId/unequip')
  @HttpCode(HttpStatus.OK)
  async unequip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('equipmentId', ParseUUIDPipe) equipmentId: string,
  ): Promise<ApiSuccess<HorseEquipment>> {
    const item = await this.unequipHorseEquipmentUseCase.execute(id, equipmentId);
    return { success: true, data: item };
  }
}
