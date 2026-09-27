-- Tribün bileti (proje sahibinin açık talebi, 27.09.2026: "yarış yapılan
-- yerlerde tribüne ücretli girişler olsun insanlar yarışları izleyebilsin").
--
-- GEREKÇE: Bugüne kadar bir yarışın tam alan (full-field) replay verisini
-- görmenin TEK yolu o yarışa ATINLA katılmaktı — `GetRaceTimelineUseCase`
-- `isPlayerParticipant` false ise 403 döner (bkz. o use-case'in doc
-- yorumu). Bu tablo, o kapıya İKİNCİ bir meşru gerekçe ekler: "bu yarışı
-- izlemek için BİLET ALDIM".
--
-- NEDEN AYRI TABLO (neden `race_entries`'e bir sütun değil): seyirci bir
-- YARIŞMACI DEĞİLDİR — `race_entries`'e yazmak onu sıralamaya/yarış
-- sonucuna/bot sayaçlarına dahil ederdi ve `races.participant_limit`
-- kontrolünü bozardı. Bilet, katılımdan TAMAMEN AYRI bir olgudur.
--
-- NEDEN `races.id`'ye bağlı (neden `track_id`'ye DEĞİL): `races.track_id`
-- şu an HER ZAMAN NULL'dur (`insertRaceRow` sabit NULL yazar, bkz.
-- `postgres-race.repository.ts`) ve bir `TrackModule`/`TrackRepository`
-- hiç yoktur — hipodrom bazlı bir tribün, önce o zincirin kurulmasını
-- gerektirirdi. Yarış bazlı bilet ise mevcut `race:${raceId}` Socket.IO
-- odasını ve mevcut timeline uç noktasını OLDUĞU GİBİ yeniden kullanır.

CREATE TABLE race_tickets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id    UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Ödeme ANINDAKİ fiyat (kayan nokta yok — `economy_transactions.amount`
  -- ile AYNI BIGINT kuralı). Config sonradan değişse bile geçmiş biletler
  -- ne kadar ödendiğini doğru gösterir.
  price      BIGINT NOT NULL CHECK (price >= 0),
  currency   TEXT NOT NULL CHECK (currency IN ('money', 'gems')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Bir oyuncu aynı yarışa EN FAZLA bir bilet alabilir. Bu kısıt yalnızca
  -- veri temizliği değildir: `PurchaseRaceTicketUseCase`'in "zaten biletin
  -- var" kontrolü ile YARIŞ DURUMUNA (race condition) girmesini DB
  -- seviyesinde de İMKANSIZ kılar — iki eşzamanlı istek gelirse ikincisi
  -- 23505 ile düşer ve transaction'ı (dolayısıyla ÇİFT tahsilatı) geri
  -- alır.
  CONSTRAINT race_tickets_unique_per_player UNIQUE (race_id, player_id)
);

COMMENT ON TABLE race_tickets IS 'Ücretli tribün girişi (proje sahibinin talebi, 27.09.2026). Bilet, yarışın tam alan replay verisini görme yetkisi verir — katılım DEĞİLDİR, yarış sonucunu etkilemez.';
COMMENT ON COLUMN race_tickets.price IS 'Satın alma anındaki fiyat (config/grandstand.config.json → ticketPrice). Ledger''daki (economy_transactions) tutarla AYNI olmalıdır.';

-- "Benim biletlerim" sorgusunun doğrudan karşılığı (bkz.
-- `PostgresGrandstandRepository.findTicketsByPlayerId`).
CREATE INDEX idx_race_tickets_player_time ON race_tickets (player_id, created_at DESC);

-- `hasTicket(raceId, playerId)` kontrolü ve yarış bazlı "kaç bilet satıldı"
-- sayımı için — yukarıdaki index'in ön eki olmadığından AYRI gerekir.
CREATE INDEX idx_race_tickets_race ON race_tickets (race_id);
