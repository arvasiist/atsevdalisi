import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedPlayer {
  id: string;
}

export interface AuthenticatedRequest extends Request {
  /** `AuthGuard` tarafından doldurulur (bkz. o dosyanın doc yorumu) — `@Public()` rotalarında YOKTUR. */
  player?: AuthenticatedPlayer;
}

/**
 * `AuthGuard`'ın doğruladığı JWT'den türetilen, KİMLİĞİ DOĞRULANMIŞ
 * oyuncuyu controller metoduna enjekte eder. `@Public()` işaretli olmayan
 * HER rotada `request.player` ZATEN dolu OLMALIDIR (`AuthGuard` global
 * olarak `APP_GUARD` ile kayıtlıdır, bkz. `auth.module.ts`) — burada
 * `undefined` çıkması bir PROGRAMLAMA HATASIDIR (guard hiç çalışmamış veya
 * `@Public()` bir rotada yanlışlıkla kullanılmış demektir), bu yüzden
 * sessizce geçersiz bir değer DÖNMEK yerine BİLİNÇLİ olarak fırlatılır.
 */
export const CurrentPlayer = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedPlayer => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.player) {
    throw new Error(
      'CurrentPlayer() bir @Public() rotada veya AuthGuard hiç çalışmamış bir rotada kullanıldı — bu bir programlama hatasıdır.',
    );
  }
  return request.player;
});
