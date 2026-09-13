import { IsInt, IsUUID, Min } from 'class-validator';

/**
 * `POST /market/listings` gövde şeması (docs/API.md §5). `train-horse.dto.ts`
 * ile AYNI desen — bu yalnızca FORMAT ön-kontrolüdür, gerçek doğrulama
 * (`price` sıfır/negatif/tam sayı değilse) `domain/market/market.ts`'teki
 * `createListingDraft` BAĞIMSIZ olarak da yapar (bkz. docs/ARCHITECTURE.md
 * §9.1 Hata 7). `listingType` BİLEREK BURADA YOK — bu dilimde her ilan
 * `fixed_price`'tır (bkz. `CreateMarketListingUseCase` doc yorumu).
 */
export class CreateMarketListingDto {
  @IsUUID()
  horseId!: string;

  @IsInt()
  @Min(0)
  price!: number;
}
