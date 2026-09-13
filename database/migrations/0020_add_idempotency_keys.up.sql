-- AUDIT_AND_HARDENING — Öncelik 3: Idempotency Güçlendirme (bu oturum).
-- Mevcut durum: `IdempotencyInterceptor` yalnızca Redis'te 24 saatlik bir
-- TTL ile saklıyordu (dokuzuncu dilim, bkz. o dosyanın doc yorumu) — TTL
-- dolduktan sonra AYNI anahtarla gelen bir tekrar isteği artık hiç
-- tanınmaz ve işlemi TEKRAR çalıştırır. Redis ayrıca kalıcı bir depolama
-- GARANTİSİ vermez (restart/eviction ile veri kaybolabilir).
--
-- Bu tablo KALICI (TTL'siz) kaydı sağlar — Redis "hızlı kontrol" katmanı
-- olarak KALMAYA devam eder (bkz. docs/SECURITY.md / AUDIT_AND_HARDENING
-- Öncelik 7 "Redis sadece cache/lock, Postgres her zaman authoritative"),
-- bu tablo ise kalıcı, tekrar sorgulanabilir doğruluk kaynağıdır.
--
-- `status = 'pending'` satırı, `IdempotencyInterceptor`'ın işleyiciyi
-- ÇAĞIRMADAN ÖNCE bu satırı REZERVE ETMESİYLE (INSERT ... ON CONFLICT DO
-- NOTHING) oluşur — `(scope_id, idempotency_key)` üzerindeki PRIMARY KEY,
-- aynı anahtarla GERÇEKTEN eşzamanlı iki isteğin İKİSİNİN DE işleyiciyi
-- çalıştırmasını (dokuzuncu dilimin kendi "BİLİNÇLİ SINIRLAMA" notunda
-- kabul edilen, dağıtık kilit eksikliği riskini) veritabanı seviyesinde
-- ORTADAN KALDIRIR — yalnızca biri satırı "kazanır", diğeri anında
-- `IDEMPOTENCY_KEY_IN_PROGRESS` (409) alır (bkz. `IdempotencyInterceptor`
-- doc yorumu).
CREATE TABLE idempotency_keys (
  scope_id         TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  -- Yalnızca `status = 'completed'` iken doludur (yanıt gövdesi, JSON).
  response_body    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  PRIMARY KEY (scope_id, idempotency_key)
);

COMMENT ON TABLE idempotency_keys IS 'Idempotency-Key kalıcı kaydı (AUDIT_AND_HARDENING Öncelik 3) — Redis yalnızca hızlı ön-kontrol içindir, bu tablo authoritative kaynaktır';
