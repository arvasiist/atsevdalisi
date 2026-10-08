import { IsString } from 'class-validator';

/**
 * Ekipman alım gövdesi (08.10.2026) — YALNIZCA katalog anahtarı. Kalite, ad,
 * tip ya da fiyat gönderilemez (`forbidNonWhitelisted` 400'ler); hepsi
 * `config/equipment.config.json`ten okunur. Anahtar use-case'te ayrıca
 * çözülür (esbuild e2e'de dekoratör atlanır).
 */
export class PurchaseHorseEquipmentDto {
  @IsString()
  catalogKey!: string;
}
