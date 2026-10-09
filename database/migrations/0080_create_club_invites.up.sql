-- 0080 — KULÜP DAVETİ (09.10.2026).
--
-- Subay/lider bir oyuncuyu kulübe davet eder; davetli kabul eder ya da
-- reddeder. Tek kulüp kuralı DEĞİŞMEZ: kabul, katılımla aynı yoldan
-- (`club_members.player_id` birincil anahtarı + kapasite kilit altında)
-- geçer. Aynı kulüp + aynı oyuncu için en fazla BİR bekleyen davet
-- (kısmi tekil indeks). Satırlar silinmez; durum değişir.
CREATE TABLE club_invites (
  id            UUID PRIMARY KEY,
  club_id       UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  inviter_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  invitee_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CONSTRAINT club_invites_status_valid CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  responded_at  TIMESTAMPTZ NULL,
  CONSTRAINT club_invites_not_self CHECK (inviter_id <> invitee_id)
);

CREATE UNIQUE INDEX club_invites_pending_uq ON club_invites (club_id, invitee_id) WHERE status = 'pending';
CREATE INDEX club_invites_invitee_idx ON club_invites (invitee_id) WHERE status = 'pending';

-- Bildirim türü CHECK'i ADIYLA düşürülüp genişletilir
-- (`notification-types.spec.ts` en son migration'ı okur).
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
  'club_invite'
));
