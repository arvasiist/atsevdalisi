import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Bu route'u global `AuthGuard`'ın (bkz. `auth.guard.ts`) zorunlu kıldığı
 * `Authorization: Bearer <token>` gereksiniminden MUAF tutar. AUDIT_REPORT.md
 * Bulgu S1 hardening (bu oturum) — yalnızca GERÇEKTEN herkese açık olması
 * GEREKEN uç noktalarda kullanılır: kayıt (`POST /players`), giriş
 * (`POST /auth/login`), sağlık kontrolü (`GET /health`) ve tarama amaçlı
 * salt-okunur pazar/at uç noktaları (`GET /market/listings`,
 * `GET /market/listings/:id`, `GET /horses/:id`).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
