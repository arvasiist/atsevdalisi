/**
 * AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum) — docs/SECURITY.md
 * §7'de proje sahibinin onayına sunulmuş ama hiç uygulanmamış rate
 * limiting önerisinin ilk dilimi (kayıt/giriş). `api/idempotency/
 * idempotency.errors.ts` ile AYNI desen: API/altyapı katmanına özgü,
 * bir domain iş kuralı OLMAYAN (bkz. docs/ARCHITECTURE.md §4) bir kısıt
 * bu yüzden `domain/` altında DEĞİL, `api/rate-limit/` altında yaşar.
 */
export class RateLimitExceededError extends Error {
  constructor(
    message: string,
    /** İstemcinin ne kadar sonra tekrar deneyebileceği (saniye) — `Retry-After` header'ına yazılır. */
    public readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}
