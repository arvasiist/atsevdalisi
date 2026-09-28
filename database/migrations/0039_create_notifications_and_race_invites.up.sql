-- Bildirim altyapısı + yarış daveti (brief §16 RACE INVITE, §28 SOCIAL
-- NOTIFICATIONS, §29 "Notification / RaceInvite" domainleri, §42 PHASE 11).
--
-- NEDEN TEK MIGRATION'DA İKİ TABLO: brief §16'nın istediği şey "davet
-- GÖNDER" değil, "davet BİLDİRİMİ gelsin"dir — yani `race_invites` satırı
-- tek başına ürün gereksinimini KARŞILAMAZ. İkisi birlikte tasarlanmıştır
-- ve ayrı migration'lara bölünmeleri, arada "davet var ama bildirim yok"
-- diye tutarsız bir şema bırakırdı.
--
-- NEDEN GENEL BİR `notifications` TABLOSU (davete özel bir tablo değil):
-- brief §28 SEKİZ bildirim türü sayar ve §29 `Notification`ı ayrı bir
-- domain olarak ister. Yalnızca davet için bir tablo kurmak, kalan yedi
-- tür geldiğinde ikinci bir tablo (ya da göç) gerektirirdi. Bu turda
-- YALNIZCA `race_invite` ÜRETİLİR; kalan yedi tür CHECK'te tanımlıdır ama
-- üreticisi HENÜZ YOKTUR (bkz. `domain/social/notification.ts` doc yorumu
-- ve PROJE_DURUMU.md §13.11).

-- ── Bildirimler (brief §28) ───────────────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ALICI. `ON DELETE CASCADE`: oyuncu silinirse bildirimleri de gider —
  -- bildirim, sahibi olmayan bir satır olarak yaşayamaz.
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Tür listesi `domain/social/notification.ts` → `NOTIFICATION_TYPES` ile
  -- BİREBİR olmak zorundadır; kayma `notification-types.spec.ts` ile
  -- denetlenir (brief §28'in sekiz türü).
  type        TEXT NOT NULL CHECK (type IN (
                'friend_request',
                'friend_accepted',
                'race_invite',
                'gift_received',
                'message_received',
                'race_starting',
                'race_finished',
                'prize_won'
              )),
  -- Türe özel veri (davet için: inviteId, raceId, raceName, inviterId,
  -- inviterDisplayName). JSONB bilinçlidir: sekiz tür için sekiz ayrı
  -- kolon seti açmak, her yeni türde bir migration gerektirirdi. Şekil
  -- sözleşmesi TİP tarafında (`NotificationPayloadByType`) zorlanır —
  -- veritabanı yalnızca "geçerli JSON" garantisi verir, bu bilinçli bir
  -- sınırlamadır (bkz. `docs/SECURITY.md`'nin config/veri doğrulama notu).
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- `NULL` = okunmadı. Zaman damgası (boolean değil) — `direct_messages.read_at`
  -- ile AYNI desen: "ne zaman okundu" sorusu sonradan sorulabilir olmalı.
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE notifications IS
  'Oyuncuya giden sosyal bildirimler (brief §28); okunmamış = read_at IS NULL';

-- Ekranın TEK sorgusu "benim bildirimlerim, en yeniden eskiye"dir.
CREATE INDEX notifications_player_created_idx
  ON notifications (player_id, created_at DESC);

-- Okunmamış rozeti (`unreadCount`) her açılışta sayılır; kısmi indeks
-- yalnızca okunmamış satırları taşır ve tablo büyüdükçe KÜÇÜK kalır.
CREATE INDEX notifications_player_unread_idx
  ON notifications (player_id) WHERE read_at IS NULL;

-- ── Yarış davetleri (brief §16) ───────────────────────────────────────────
CREATE TABLE race_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id       UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  -- Davet EDEN. `players`e FK: var olmayan bir oyuncu davet gönderemez.
  inviter_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  invitee_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  -- Kendini davet etmek anlamsızdır (uygulama katmanı da reddeder —
  -- `CannotInviteSelfError`; bu, `friendships_not_self` ile AYNI çift
  -- katmanlı savunma: CHECK + domain).
  CONSTRAINT race_invites_not_self_ck CHECK (inviter_id <> invitee_id),
  -- `pending` bir davetin `responded_at`i OLAMAZ; yanıtlanmış bir davetin
  -- de OLMALIDIR. Bu, "yanıtlandı ama zamanı yazılmadı" diye yarım bir
  -- satırı yapısal olarak imkânsız kılar (friendships'teki
  -- `responded_at` disiplininin CHECK'e dönüşmüş hâli).
  CONSTRAINT race_invites_responded_at_ck CHECK (
    (status = 'pending' AND responded_at IS NULL) OR
    (status <> 'pending' AND responded_at IS NOT NULL)
  )
);

COMMENT ON TABLE race_invites IS
  'Arkadaşın arkadaşı yarışa daveti (brief §16); yanıt her zaman DAVET EDİLEN taraftan gelir';

-- Aynı yarışa aynı oyuncu YALNIZCA BİR KEZ davet edilebilir. Bu kısıt
-- `saveInvite`in `ON CONFLICT DO NOTHING`ıyla birlikte çalışır: iki
-- eşzamanlı davet isteğinden yalnızca biri satır yazar, diğeri `null`
-- döner (çağıran bunu 409 `RACE_INVITE_ALREADY_EXISTS`e çevirir).
-- `friendships_unique_pair` (migration 0033) ile AYNI desen.
CREATE UNIQUE INDEX race_invites_race_invitee_uq
  ON race_invites (race_id, invitee_id);

-- "Bana gelen bekleyen davetler" sorgusu — kısmi indeks.
CREATE INDEX race_invites_invitee_pending_idx
  ON race_invites (invitee_id) WHERE status = 'pending';

-- Spam tavanı sorgusu (`countOutgoingPending`) — davet eden tarafından.
CREATE INDEX race_invites_inviter_pending_idx
  ON race_invites (inviter_id) WHERE status = 'pending';
