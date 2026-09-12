import { IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * `POST /players` gövde şeması. Bu, sadece FORMAT ön-kontrolüdür
 * (docs/SECURITY.md §2 "girdi doğrulama API katmanında yapılır") —
 * `domain/player/validation.ts`'teki gerçek iş kuralları (aynı sınır
 * değerlerle) BAĞIMSIZ OLARAK yine çalışır; bu bilinçli bir tekrardır (bkz.
 * `domain/online/anti-cheat.ts`'teki "hiçbir tek katmana güvenme" ilkesiyle
 * aynı gerekçe).
 */
export class RegisterPlayerDto {
  @IsString()
  @Length(3, 20)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'username yalnızca küçük harf, rakam ve alt çizgi (_) içerebilir.',
  })
  username!: string;

  @IsString()
  @Length(2, 30)
  displayName!: string;

  @IsOptional()
  @IsString()
  avatarId?: string;
}
