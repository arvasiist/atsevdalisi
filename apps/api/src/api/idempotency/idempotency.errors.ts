/**
 * FAZ 1 wiring, dokuzuncu dilim — brief §54, docs/SECURITY.md §4,
 * docs/API.md §1.3. `ErrorCode.IdempotencyKeyRequired` (`IDEMPOTENCY_
 * KEY_REQUIRED`) `packages/shared-types/src/error-codes.ts`de FAZ 0'dan
 * beri taslakta duruyordu ama hiçbir hata sınıfı onu üretmiyordu — bu,
 * `ioredis`'in `package.json`da hazır ama hiç import edilmemiş olmasıyla
 * AYNI "önceden hazırlanmış iskelet" örneğidir.
 */
export class IdempotencyKeyRequiredError extends Error {
  constructor() {
    super('Bu işlem için Idempotency-Key header\'ı zorunludur.');
    this.name = 'IdempotencyKeyRequiredError';
  }
}
