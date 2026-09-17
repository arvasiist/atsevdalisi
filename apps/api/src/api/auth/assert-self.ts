import { ForbiddenError } from '../../domain/auth/errors';

/**
 * `players/:id`, `horses?ownerId=`, `market/my-listings?sellerId=` gibi
 * "bu kaynak KAVRAMSAL OLARAK bir oyuncunun kendisidir" uç noktalarında
 * kullanılır — AUDIT_REPORT.md Bulgu S4 hardening (bu oturum). `targetId`
 * (route param/query'den gelen), kimlik doğrulanmış oyuncunun kendi
 * id'sine EŞİT DEĞİLSE 403 fırlatır. `HorseOwnerGuard`/`ListingOwnerGuard`'IN
 * AKSİNE bir veritabanı sorgusu GEREKTİRMEZ (id karşılaştırması yeterlidir)
 * — bu yüzden bir guard DEĞİL, controller içinde çağrılan basit bir
 * fonksiyondur.
 */
export function assertSelf(currentPlayerId: string, targetId: string): void {
  if (currentPlayerId !== targetId) {
    throw new ForbiddenError('Bu kaynağa yalnızca kendi hesabınız için erişebilirsiniz.');
  }
}
