-- 0094 — ÇİFTLEŞTİRME MERKEZİ + DOĞURGANLIK + GEBELİK (16.10.2026, brief §4–§5).
-- Yalnızca EKLEME: mevcut atlara, çift kayıtlarına ve defter satırlarına
-- dokunulmaz. Eski atların doğurganlığı kimlikten türetilen TEK SEFERLİK bir
-- değerle doldurulur (55..85); yeni atlar `deriveFertility` (TS) ile doğar.

ALTER TABLE horses ADD COLUMN fertility SMALLINT NOT NULL DEFAULT 70;
ALTER TABLE horses ADD CONSTRAINT horses_fertility_range CHECK (fertility BETWEEN 0 AND 100);
UPDATE horses SET fertility = 55 + (get_byte(decode(md5(id::text), 'hex'), 0) % 31);

-- Aygır ilanı: sahibi ücretini kendisi belirler (sınırlar config'te, uygulama
-- denetler). Tek satır / aygır; geri çekilen ilan `withdrawn` kalır (geçmiş).
CREATE TABLE stud_listings (
  stallion_id UUID PRIMARY KEY REFERENCES horses(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fee         BIGINT NOT NULL CHECK (fee >= 0),
  status      TEXT NOT NULL CHECK (status IN ('active', 'withdrawn')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stud_listings_active ON stud_listings (fee) WHERE status = 'active';

-- Teklif: ücret teklif anında EMANETE alınır (`breeding_offer_hold`); ret,
-- iptal, süre dolumu TAM iade (`breeding_offer_refund`); kabulde döllenme
-- zarı. Kısrak başına en fazla BİR bekleyen teklif (çift emanet yok).
CREATE TABLE breeding_offers (
  id                UUID PRIMARY KEY,
  mare_id           UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  stallion_id       UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  mare_owner_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stallion_owner_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fee               BIGINT NOT NULL CHECK (fee >= 0),
  foal_name         TEXT NOT NULL CHECK (char_length(foal_name) BETWEEN 1 AND 64),
  status            TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  outcome           TEXT CHECK (outcome IN ('conceived', 'not_conceived')),
  refunded_amount   BIGINT NOT NULL DEFAULT 0,
  pregnancy_id      UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  responded_at      TIMESTAMPTZ,
  CONSTRAINT breeding_offers_distinct_owners CHECK (mare_owner_id <> stallion_owner_id),
  CONSTRAINT breeding_offers_outcome_only_when_accepted CHECK ((status = 'accepted') = (outcome IS NOT NULL)),
  CONSTRAINT breeding_offers_refund_range CHECK (refunded_amount >= 0 AND refunded_amount <= fee)
);
CREATE UNIQUE INDEX breeding_offers_one_pending_per_mare ON breeding_offers (mare_id) WHERE status = 'pending';
CREATE INDEX idx_breeding_offers_stallion_owner ON breeding_offers (stallion_owner_id, created_at DESC);
CREATE INDEX idx_breeding_offers_mare_owner ON breeding_offers (mare_owner_id, created_at DESC);
CREATE INDEX idx_breeding_offers_pending_expiry ON breeding_offers (expires_at) WHERE status = 'pending';
CREATE INDEX idx_breeding_offers_stallion_pending ON breeding_offers (stallion_id) WHERE status = 'pending';

-- Gebelik: tayın genetiği DÖLLENME ANINDA hesaplanır ve `genetics`te YALNIZCA
-- sunucuda tutulur (istemciye dönmez). `foal_id` doğacak tayın ayrılmış
-- kimliğidir; `horses` satırı yalnızca `status = 'born'` iken vardır.
CREATE TABLE pregnancies (
  id                UUID PRIMARY KEY,
  mare_id           UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  stallion_id       UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  owner_id          UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  offer_id          UUID REFERENCES breeding_offers(id),
  foal_id           UUID NOT NULL UNIQUE,
  foal_name         TEXT NOT NULL,
  genetics          JSONB NOT NULL,
  fee               BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0),
  conceived_at      TIMESTAMPTZ NOT NULL,
  expected_birth_at TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('gestating', 'born')),
  born_at           TIMESTAMPTZ,
  CONSTRAINT pregnancies_born_at_iff_born CHECK ((status = 'born') = (born_at IS NOT NULL)),
  CONSTRAINT pregnancies_birth_after_conception CHECK (expected_birth_at > conceived_at)
);
CREATE UNIQUE INDEX pregnancies_one_gestating_per_mare ON pregnancies (mare_id) WHERE status = 'gestating';
CREATE INDEX idx_pregnancies_due ON pregnancies (expected_birth_at) WHERE status = 'gestating';
CREATE INDEX idx_pregnancies_owner ON pregnancies (owner_id, conceived_at DESC);
CREATE INDEX idx_pregnancies_stallion_gestating ON pregnancies (stallion_id) WHERE status = 'gestating';

ALTER TABLE breeding_offers ADD CONSTRAINT breeding_offers_pregnancy_fk
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id);

-- Her döllenme denemesi (kendi çifti ya da kabul edilen teklif). Başarısız
-- deneme kısrağı `failedAttemptCooldownHours` dinlendirir (sınırsız tekrar yok).
CREATE TABLE breeding_attempts (
  id           UUID PRIMARY KEY,
  mare_id      UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  stallion_id  UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  offer_id     UUID REFERENCES breeding_offers(id),
  chance       NUMERIC(5,4) NOT NULL CHECK (chance > 0 AND chance < 1),
  succeeded    BOOLEAN NOT NULL,
  pregnancy_id UUID REFERENCES pregnancies(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT breeding_attempts_pregnancy_iff_success CHECK (succeeded = (pregnancy_id IS NOT NULL))
);
CREATE INDEX idx_breeding_attempts_mare ON breeding_attempts (mare_id, created_at DESC);

-- Gebelik veteriner kontrolü (ücretli; `pregnancy_vet_check` defter satırı).
CREATE TABLE pregnancy_checkups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregnancy_id UUID NOT NULL REFERENCES pregnancies(id) ON DELETE CASCADE,
  performed_by UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cost         BIGINT NOT NULL CHECK (cost >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pregnancy_checkups_pregnancy ON pregnancy_checkups (pregnancy_id, created_at DESC);

-- Bildirim türleri (CHECK ADIYLA düşürülüp genişletilir; `notification-types.spec.ts`
-- en son migration'ı okur).
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'friend_request',
  'friend_accepted',
  'race_invite',
  'gift_received',
  'message_received',
  'race_starting',
  'race_finished',
  'prize_won',
  'auction_outbid',
  'auction_won',
  'auction_sold',
  'auction_unsold',
  'auction_refunded',
  'tribune_gift_received',
  'listing_expired',
  'club_invite',
  'race_cancelled',
  'stud_service',
  'friend_gift_received',
  'gift_sent',
  'referral_reward',
  'breeding_offer_received',
  'breeding_offer_answered',
  'foal_born'
));
