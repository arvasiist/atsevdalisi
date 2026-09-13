-- AUDIT_AND_HARDENING — Öncelik 2: Economy Ledger (bu oturum). Proje
-- sahibinin talebi: "Sadece wallet debit/credit/transfer var. Kalıcı
-- ledger yok." — brief §65'in audit trail gereğiyle AYNI ruh (bkz.
-- docs/SECURITY.md §8), ama BURADA amaç loglama değil, PARA HAREKETLERİNİN
-- KENDİSİNİN muhasebe defteri gibi izlenebilir/denetlenebilir olmasıdır
-- (docs/ECONOMY.md §5'in "BEGIN...COMMIT" akışına EK bir kalıcı kayıt
-- adımı — mevcut hiçbir para akışının DAVRANIŞINI değiştirmez).
--
-- `player_id` tek bir tarafı gösterir (bir transfer İKİ satır üretir: biri
-- alıcı için negatif `amount` [debit], biri satıcı için pozitif `amount`
-- [credit], AYNI `reference_id` ile eşleştirilebilir) — çift-kayıt (double-
-- entry) muhasebenin basitleştirilmiş bir versiyonu, brief'in istediği
-- "izlenebilirlik" için yeterli, tam bir defter-i kebir (general ledger)
-- sistemi KAPSAM DIŞI (yeni özellik değil, sertleştirme).
CREATE TABLE economy_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Örn: 'market_purchase_debit', 'market_purchase_credit', 'daily_reward',
  -- 'stable_upgrade', 'practice_race_entry_fee', 'practice_race_prize'.
  -- Serbest metin (enum DEĞİL) — `race_entries.tactical_style` gibi diğer
  -- "kategori" alanlarıyla AYNI desen; yeni bir tür eklemek migration
  -- gerektirmez.
  type              TEXT NOT NULL,
  -- İMZALI (signed): negatif = düşüm (debit), pozitif = ekleme (credit).
  -- `CHECK (amount <> 0)` — sıfır miktarlı bir "hareket" muhasebe
  -- anlamında hiç gerçekleşmemiştir, ledger'a hiç yazılmaz (bkz.
  -- `domain/economy/wallet.ts`'in "sıfır olmayan pozitif miktar" kuralı —
  -- ledger sadece GERÇEKTEN olan hareketleri kaydeder).
  amount            BIGINT NOT NULL CHECK (amount <> 0),
  currency          TEXT NOT NULL CHECK (currency IN ('money', 'gems')),
  -- Hangi kaynağın (ilan/yarış/vb.) bu hareketi tetiklediği — `reference_id`
  -- kasıtlı olarak bir FOREIGN KEY DEĞİLDİR: farklı `type`'lar farklı
  -- tablolara işaret eder (market_listings, races, ...) ve bazı hareketlerin
  -- (günlük ödül) hiç referansı yoktur (`NULL`).
  reference_type    TEXT,
  reference_id      UUID,
  balance_before    BIGINT NOT NULL CHECK (balance_before >= 0),
  balance_after     BIGINT NOT NULL CHECK (balance_after >= 0),
  -- Tutarlılık: bakiye HER ZAMAN öncekinin + hareketin miktarı kadarıdır —
  -- bu kısıt, ledger satırının KENDİSİNİN yanlış hesaplanmış bir tutarla
  -- yazılmasını veritabanı seviyesinde imkansız kılar (docs/SECURITY.md
  -- §2'nin "üçüncü katman: DB CHECK" ilkesiyle AYNI).
  CHECK (balance_after = balance_before + amount),
  -- Yazan use-case'in (varsa) Idempotency-Key'i — AUDIT_AND_HARDENING
  -- Öncelik 3 ile birlikte, aynı anahtarla tekrarlanan bir isteğin ledger'a
  -- İKİNCİ kez yazılmadığının sonradan denetlenebilmesi için.
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE economy_transactions IS 'Kalıcı ekonomi defteri (ledger) — her para hareketi buraya yazılır (AUDIT_AND_HARDENING Öncelik 2)';

-- Bir oyuncunun kendi işlem geçmişini kronolojik sırayla sorgulamak için
-- (ileride bir "işlem geçmişi" ekranı eklenirse, bu index HAZIR olur —
-- ekranın kendisi bu dilimin kapsamı DIŞINDADIR, yeni özellik değildir).
CREATE INDEX idx_economy_transactions_player_id ON economy_transactions (player_id, created_at DESC);

-- Belirli bir kaynağa (örn. bir market ilanına) ait TÜM hareketleri
-- bulmak için (denetim/hata ayıklama).
CREATE INDEX idx_economy_transactions_reference ON economy_transactions (reference_type, reference_id);
