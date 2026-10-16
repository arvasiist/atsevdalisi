-- 16.10.2026 — sosyal brief §7: arkadaş daveti + davet ödülü.
--   * player_referral_codes — oyuncu başına TEK davet kodu (sunucu üretir).
--   * referrals — davetle gelen oyuncu (invitee) EN FAZLA BİR KEZ bağlanır
--     (PK benzeri tekillik). Ödül koşulları config'te (`referral.config.json`)
--     ve SAYAÇ TUTULMADAN mevcut tablolardan türetilir; ödül bir kez yazılır
--     (`rewarded_at` kilit altında), defter satırı aynı transaction'da.
-- Hesap silinince satır SİLİNMEZ (ödenmiş ödül defteri açıklar); ödenmemiş
-- bağlantı hesap silmede silinir. Yalnızca ekleme: mevcut tablolara dokunulmaz.
CREATE TABLE player_referral_codes (
  player_id   UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-9]{6,16}$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitee_id      UUID NOT NULL UNIQUE REFERENCES players(id) ON DELETE RESTRICT,
  inviter_id      UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  code            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  rewarded_at     TIMESTAMPTZ,
  inviter_reward  BIGINT CHECK (inviter_reward IS NULL OR inviter_reward >= 0),
  invitee_reward  BIGINT CHECK (invitee_reward IS NULL OR invitee_reward >= 0),
  CONSTRAINT referrals_not_self CHECK (invitee_id <> inviter_id),
  CONSTRAINT referrals_reward_consistent CHECK (
    (rewarded_at IS NULL) = (inviter_reward IS NULL) AND (rewarded_at IS NULL) = (invitee_reward IS NULL)
  )
);

CREATE INDEX idx_referrals_inviter ON referrals (inviter_id, created_at DESC);
CREATE INDEX idx_referrals_inviter_rewarded ON referrals (inviter_id, rewarded_at) WHERE rewarded_at IS NOT NULL;

COMMENT ON TABLE referrals IS 'Davet bağlantısı (16.10.2026). Davetle gelen oyuncu bir kez bağlanır; ödül koşul + tavan kilit altında denetlenerek bir kez ödenir.';
