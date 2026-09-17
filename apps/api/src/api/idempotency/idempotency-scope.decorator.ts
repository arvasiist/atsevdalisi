import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENCY_SCOPE_KEY = 'idempotencyScope';

/**
 * `param` (varsayılan) — `IdempotencyInterceptor` mevcut davranışını
 * korur: kapsam `req.params.id`'dir (train/care/feed/practice-race'te
 * horseId, stable-upgrade/daily-reward'da playerId — rota şekline göre
 * değişir, bkz. o dosyaların doc yorumları). `player` — AUDIT_REPORT.md
 * Bulgu S4 hardening'i (bu oturum) sonrası artık body'de `buyerId`
 * GÖNDERİLMEDİĞİNDEN (bkz. `market.controller.ts` `buyListing`), yalnızca
 * `MarketController.buyListing` için: kapsam `AuthGuard`'ın doldurduğu
 * `request.player.id`'dir (`req.params.id` burada LİSTİNG id'sidir, alıcıyı
 * AYIRT ETMEZ — eski `body.buyerId` özel durumunun YERİNİ alır, bkz.
 * AUDIT_REPORT.md Bulgu E3'ün orijinal düzeltmesi).
 */
export type IdempotencyScopeSource = 'param' | 'player';

export const IdempotencyScope = (source: IdempotencyScopeSource): MethodDecorator =>
  SetMetadata(IDEMPOTENCY_SCOPE_KEY, source);
