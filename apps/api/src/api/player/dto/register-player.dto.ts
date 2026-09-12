import { IsOptional, IsString, Length, Matches } from 'class-validator';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '../../../domain/player/validation';

/**
 * `POST /players` gövde şeması. Bu, sadece FORMAT ön-kontrolüdür
 * (docs/SECURITY.md §2 "girdi doğrulama API katmanında yapılır") —
 * `domain/player/validation.ts`'teki gerçek iş kuralları BAĞIMSIZ OLARAK
 * yine çalışır; bu bilinçli bir tekrardır (bkz. `domain/online/anti-cheat.ts`'teki
 * "hiçbir tek katmana güvenme" ilkesiyle aynı gerekçe). Sınır DEĞERLERİ
 * (3/20/2/30) burada tekrar sabit sayı olarak YAZILMAZ — tek doğruluk
 * kaynağı olarak domain katmanından içe aktarılır (docs/CODING_CONVENTIONS.md
 * #6/7 "magic number yasak, config/sabit kullan").
 */
export class RegisterPlayerDto {
  @IsString()
  @Length(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'username yalnızca küçük harf, rakam ve alt çizgi (_) içerebilir.',
  })
  username!: string;

  @IsString()
  @Length(DISPLAY_NAME_MIN_LENGTH, DISPLAY_NAME_MAX_LENGTH)
  displayName!: string;

  @IsOptional()
  @IsString()
  avatarId?: string;
}
