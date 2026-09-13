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

/**
 * AUDIT_AND_HARDENING Öncelik 3 (bu oturum) — `IdempotencyInterceptor`nin
 * PostgreSQL'e taşınan REZERVASYON adımının (bkz. o dosyanın doc yorumu,
 * migration 0020) ürettiği YENİ bir hata: aynı `(scopeId, idempotencyKey)`
 * çifti ile GERÇEKTEN eşzamanlı (milisaniyeler içinde çakışan) iki istek
 * geldiğinde, `idempotency_keys` tablosunun `PRIMARY KEY`'i ikinciyi
 * reddeder — bu istek işleyiciyi HİÇ ÇALIŞTIRMAZ (dokuzuncu dilimin kendi
 * "dağıtık kilit yok" sınırlamasının kapatılmasıdır). İstemci kısa bir
 * süre sonra AYNI anahtarla tekrar deneyebilir (birinci istek o zamana
 * kadar tamamlanmış olacaktır ve normal "aynı anahtar → aynı sonuç"
 * yoluna girer).
 */
export class IdempotencyKeyInProgressError extends Error {
  constructor() {
    super('Bu Idempotency-Key ile bir istek hâlâ işleniyor — kısa bir süre sonra tekrar deneyin.');
    this.name = 'IdempotencyKeyInProgressError';
  }
}
