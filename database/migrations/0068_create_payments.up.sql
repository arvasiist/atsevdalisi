-- 0068 — GERÇEK PARA ÖDEMESİ (07.10.2026, Faz 12, brief §20/§88).
--
-- Gerçek para OYUN İÇİ DEFTERDEN AYRI tutulur:
--   * payment_orders — sipariş/makbuz. Tutar kuruş (BIGINT). Elmas yalnızca
--     sağlayıcının İMZALI webhook'u `paid` yazınca verilir (aynı transaction'da
--     `gem_purchase` defter satırıyla).
--   * payment_events — işlenmiş webhook olayları. `(provider, event_id)`
--     birincil anahtarı aynı olayın İKİNCİ kez işlenmesini (tekrar saldırısı,
--     sağlayıcının yeniden göndermesi) keser.
-- Hesap silinince satırlar SİLİNMEZ (mali kayıt); kişisel veri taşımazlar.
-- Yalnızca ekleme: mevcut tablolara dokunulmaz.
CREATE TABLE payment_orders (
  id                       UUID PRIMARY KEY,
  player_id                UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  sku                      TEXT NOT NULL,
  gems                     BIGINT NOT NULL CHECK (gems > 0),
  amount_minor             BIGINT NOT NULL CHECK (amount_minor > 0),
  currency                 TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status                   TEXT NOT NULL CHECK (status IN ('created', 'pending', 'paid', 'failed', 'cancelled', 'refunded')),
  provider                 TEXT NOT NULL,
  provider_session_id      TEXT UNIQUE,
  provider_payment_id      TEXT UNIQUE,
  failure_code             TEXT,
  clawback_shortfall_gems  BIGINT NOT NULL DEFAULT 0 CHECK (clawback_shortfall_gems >= 0),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                  TIMESTAMPTZ,
  refunded_at              TIMESTAMPTZ,
  CONSTRAINT payment_orders_paid_check CHECK ((status IN ('paid', 'refunded')) = (paid_at IS NOT NULL)),
  CONSTRAINT payment_orders_refunded_check CHECK ((status = 'refunded') = (refunded_at IS NOT NULL))
);

CREATE INDEX idx_payment_orders_player ON payment_orders (player_id, created_at DESC);

CREATE TABLE payment_events (
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  order_id     UUID REFERENCES payment_orders(id) ON DELETE RESTRICT,
  event_type   TEXT NOT NULL,
  outcome      TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

COMMENT ON TABLE payment_orders IS 'Gerçek para siparişi/makbuzu (Faz 12). Elmas yalnızca imzalı webhook ile verilir.';
COMMENT ON TABLE payment_events IS 'İşlenmiş ödeme webhook olayları (Faz 12). PK tekrar işlemeyi keser.';
