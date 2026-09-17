import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TOKEN_SERVICE, type TokenService } from '../../application/ports/token.service';
import { MissingAuthTokenError } from '../../domain/auth/errors';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthenticatedRequest } from './current-player.decorator';

const BEARER_PREFIX = 'Bearer ';

/**
 * `APP_GUARD` olarak global kaydedilir (bkz. `auth.module.ts`) — `@Public()`
 * işaretli olmayan HER rota için `Authorization: Bearer <token>` header'ını
 * ZORUNLU kılar (AUDIT_REPORT.md Bulgu S1, Critical: "hiçbir uç noktada
 * kimlik doğrulama yok"). Doğrulanan token'ın `sub` claim'i
 * (`request.player.id`) `@CurrentPlayer()` ile controller'a enjekte edilir.
 *
 * SAHİPLİK kontrolü (ör. "bu at GERÇEKTEN bu oyuncuya mı ait") BİLEREK bu
 * guard'ın işi DEĞİLDİR — o, daha özel guard'ların (`HorseOwnerGuard`,
 * `ListingOwnerGuard`) veya controller içindeki basit self-check'lerin
 * (`assertSelf`) sorumluluğudur (docs/ARCHITECTURE.md'nin "her guard tek
 * sorumluluk" ilkesi — kimlik doğrulama ile yetkilendirme AYRI katmanlardır).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık `@Inject()`
 * ile enjekte edilir.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new MissingAuthTokenError();
    }

    const payload = this.tokenService.verify(token);
    request.player = { id: payload.sub };
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      return null;
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    return token.length > 0 ? token : null;
  }
}
