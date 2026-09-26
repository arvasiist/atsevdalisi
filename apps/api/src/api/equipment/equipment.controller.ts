import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { ApiSuccess, HorseEquipment } from '@at-sevdalisi/shared-types';
import { CreateHorseEquipmentUseCase } from '../../application/use-cases/create-horse-equipment.use-case';
import { EquipHorseEquipmentUseCase } from '../../application/use-cases/equip-horse-equipment.use-case';
import { ListHorseEquipmentUseCase } from '../../application/use-cases/list-horse-equipment.use-case';
import { UnequipHorseEquipmentUseCase } from '../../application/use-cases/unequip-horse-equipment.use-case';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { CreateHorseEquipmentDto } from './dto/create-horse-equipment.dto';

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
    @Inject(CreateHorseEquipmentUseCase) private readonly createHorseEquipmentUseCase: CreateHorseEquipmentUseCase,
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

  // Yeni bir ekipman parçası, yeni bir KAYNAK yaratır (`PlayerController`nin
  // `/players` KAYIT ile AYNI kategori) — bu yüzden `TrainingController.train`'in
  // AKSİNE (günceller, 200 döner) NestJS'in POST için varsayılanı olan
  // 201 Created BİLEREK KORUNUR.
  @UseGuards(HorseOwnerGuardByParam)
  @Post(':id/equipment')
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateHorseEquipmentDto,
  ): Promise<ApiSuccess<HorseEquipment>> {
    const item = await this.createHorseEquipmentUseCase.execute(id, {
      equipmentType: dto.equipmentType,
      name: dto.name,
      quality: dto.quality,
    });
    return { success: true, data: item };
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
