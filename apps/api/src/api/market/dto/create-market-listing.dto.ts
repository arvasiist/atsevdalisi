import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_LISTING_EXPIRY_HOURS, MIN_LISTING_EXPIRY_HOURS } from '../../../domain/market/validation';

/**
 * `POST /market/listings` gövde şeması (docs/API.md §5). `train-horse.dto.ts`
 * ile AYNI desen — bu yalnızca FORMAT ön-kontrolüdür, gerçek doğrulama
 * (`price` sıfır/negatif/tam sayı değilse, `expiresInHours` aralık
 * dışındaysa) `domain/market/market.ts`'teki `createListingDraft`
 * BAĞIMSIZ olarak da yapar (bkz. docs/ARCHITECTURE.md §9.1 Hata 7).
 * `listingType` BİLEREK BURADA YOK — bu dilimde her ilan `fixed_price`'tır
 * (bkz. `CreateMarketListingUseCase` doc yorumu).
 *
 * FAZ 1 wiring, on üçüncü dilim (bu oturum) — `expiresInHours` YENİ
 * eklendi (bkz. `domain/market/validation.ts` sınır sabitleri — bu
 * sabitler burada TEKRAR YAZILMAZ, `train-horse.dto.ts`'in
 * `MAX_TRAINING_DURATION_MINUTES`'ı içe aktarmasıyla AYNI desen).
 */
export class CreateMarketListingDto {
  @IsUUID()
  horseId!: string;

  @IsInt()
  @Min(0)
  price!: number;

  /** Verilmezse ilan süresizdir (`expiresAt: null`) — bkz. `CreateMarketListingUseCase` doc yorumu. */
  @IsOptional()
  @IsInt()
  @Min(MIN_LISTING_EXPIRY_HOURS)
  @Max(MAX_LISTING_EXPIRY_HOURS)
  expiresInHours?: number;
}
