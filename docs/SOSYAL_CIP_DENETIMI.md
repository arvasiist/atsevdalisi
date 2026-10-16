# Sosyal + Çip Ekonomisi Brief'i — Denetim ve Plan (16.10.2026)

Referans: "101 Okey Plus benzeri arkadaşlık, çip ekonomisi ve hediye" brief'i.
Referans oyunun özellikleri doğrulanmadı; yalnızca işlevsel ilkeler alındı.
Denetim kod + test üzerinden yapıldı.

## Sahibinin kararları (16.10.2026)

1. **Çip paketleri mağazaya eklenir; SATIN ALINAN ÇİP HEDİYE EDİLEMEZ.**
   Gönderilebilir tutar = bakiye − (satın alınmış çip − iadesi alınmış çip).
   Eski kural (elmas yalnızca görünüş + kolaylık, elmas → çip yok) aynen sürer.
2. **"Birlikte yarış" arkadaşlık kuralı KALIR**, davet bağlantısıyla gelen
   oyuncu ile davet eden bu şarttan muaftır.

## Mevcut durum → açık → plan

| Brief | Mevcut | Açık | Plan |
|---|---|---|---|
| §3 Oyuncu kimliği | `players.id` (UUID, değişmez) + `username` (benzersiz, a-z0-9_) | — | — |
| §3 Arama (ID / kullanıcı adı) | YOK | uç ve ekran yok | `GET /players/search?q=` (ID tam eşleşme, kullanıcı adı ön eki; engelli çift ve silinmiş hesap gizli) + `/friends` arama kutusu |
| §3 Profil + "Arkadaş Ekle" | `/profile/[username]` (`@Public`), arkadaş düğmesi YOK | profilden istek gönderilemiyor | `GET /players/:id/relationship/:otherId` + profilde Arkadaş Ekle / Kabul et / Çip Hediye Et / Yarışa davet |
| §3 İstek gönder/kabul/ret, tekrar, kendine, çıkarma, engelleme | VAR (`social.controller.ts`, testli) | — | davet istisnası kapıya eklenir |
| §3 Çevrimiçi / son görülme / gizlilik / sıralama | YOK | | `players.last_seen_at` + `show_online_status`, `POST /presence/heartbeat`, arkadaş listesinde durum + sıralama, `PUT` gizlilik ayarı |
| §3 Oyuna davet | `POST /players/:id/race-invites` VAR | arayüz YOK | arkadaş listesi + profil: açık yarışa davet |
| §4 Arkadaşa çip transferi | `POST /players/:id/gifts` VAR: arkadaşlık + engel + bakiye `FOR UPDATE` + defter + `Idempotency-Key` + `@RateLimit` + günlük SAYI tavanı | günlük TUTAR tavanı, yeni hesap limiti, alıcı günlük tavanı, gönderene bildirim, onay ekranı, hazır tutarlar, işlem sonrası bakiye yok; web anahtarı her basışta yeniliyor (ağ hatasında tekrar = çift gönderim riski) | config + domain kuralı, kota ucu, onay ekranı, anahtar başarıya kadar saklanır |
| §5 Defter | `economy_transactions` (değiştirilemez; id, oyuncu, tür, tutar, önce/sonra bakiye, kaynak, referans, zaman) | "durum" ve "idempotency anahtarı" satırda değil | durum: defter yalnızca TAMAMLANMIŞ hareketi yazar (başarısız iş geri alınır); anahtar `idempotency_keys` tablosunda — belgelenir |
| §6 Çip mağazası | elmas paketleri + imzalı webhook (sağlayıcı yok → 503) | çip paketi yok | çip SKU, `chip_purchase` / iade, hediye kuralı |
| §7 Davet bağlantısı + ödül | YOK | | migration + config koşulları + `/invite` ekranı (WhatsApp/paylaş) + risk kontrolleri |
| §8 Bildirimler | istek, kabul, gelen hediye (`gift_received`), yarış daveti VAR; canlı akış (0088) VAR | gönderene "transfer başarılı", davet ödülü | yeni türler |
| §9 Ekranlar | `/friends`, `/profile`, `/wallet`, `/store`, `/notifications` VAR | arama, transfer onayı, davet | yukarıdaki planla |

Başarısız transfer için bildirim YAZILMAZ: işlem geri alındığında aynı
transaction'daki bildirim de geri alınır; hata ekranda gösterilir.

---

# Uygulama raporu (16.10.2026, F2–F7)

Commit'ler: F2 `2697a71` · F3 `7c337d3` · F4 `4606d16` · F5 `ed9c3ca` · F6-F7
(bu commit). Dal `fix/project-audit` → PR arvasiist/atsevdalisi#2.

## 1. Ne yapıldı (brief bölümü → karşılığı)

| Brief | Durum | Nerede |
|---|---|---|
| §3 Arama (ID / kullanıcı adı) | YAPILDI | `GET /social/search?q=` — UUID tam eşleşme ya da kullanıcı adı ön eki; kendisi, engelli çift (iki yön), silinmiş hesap gizli; `LIKE` jokerleri kaçırılır. `/friends` → arama kutusu |
| §3 Profil + Arkadaş Ekle | YAPILDI | `GET /players/:id/relationship/:otherId` (yalnızca kendi kimliğinle) → profilde Arkadaş Ekle / Kabul / Çip Gönder / Yarışa Davet |
| §3 İstek / kabul / ret / çıkarma / engel | VARDI, korundu | arkadaşlık kapısı artık `meetsFriendshipGate`: birlikte yarış **veya** davet çifti (sahibinin kararı) |
| §3 Çevrimiçi / son görülme / gizlilik / sıralama | YAPILDI | migration 0090; `POST /presence/heartbeat` (üst bar, `social.presence.heartbeatSeconds`), `GET/PUT /players/:id/privacy`; gizleyen oyuncu herkese "çevrimdışı", son görülme yok; liste çevrimiçi → son görülme sırasıyla |
| §3 Oyuna davet | YAPILDI (arayüz) | mevcut `POST /players/:id/race-invites` → arkadaş listesi + profilde açık yarış seçici |
| §4 Transfer akışı + onay ekranı | YAPILDI | `ChipTransferPanel`: hazır tutarlar (`gift.presetAmounts`), alıcı + tutar + işlem sonrası bakiye ile ONAY adımı, sunucu yanıtındaki gerçek bakiye; anahtar BAŞARIYA kadar saklanır, çift tıklama kilitli |
| §4 Limitler (config) | YAPILDI | `config/gift.config.json`: günlük tutar, alıcı günlük tutar, yeni hesap (yaş, işlem başı, günlük); hepsi kilit altında sayılır → 409 `GIFT_LIMIT_EXCEEDED` (`kind`, `limit`, `remaining`); `GET /players/:id/gifts/quota` |
| §4 Bildirim iki tarafa | YAPILDI | `gift_sent` (gönderene, işlem sonrası bakiye) + `gift_received`, para ile AYNI transaction (migration 0091) |
| §5 Kaynak bazında takip + ücretli çip kuralı | YAPILDI | tek kural `giftableBalance` (`domain/gift/gift.ts`), anahtarı `store.purchasedChipsGiftable` (false); satın alınmış net = defterdeki `chip_purchase` + `chip_purchase_refund` |
| §6 Çip paketleri + "+" | YAPILDI (sağlayıcı YOK) | üç çip SKU'su, migration 0093; üst bardaki çip "+" → `/store`; webhook imzası + `(provider, event_id)` tekrar koruması + tutar birebir kontrolü mevcut hattan; iade `chip_purchase_refund`, harcanmışsa `clawback_shortfall_chips` |
| §7 Davet kodu + ödül | YAPILDI | migration 0092, `config/referral.config.json`; `/invite` (kopyala / WhatsApp / paylaş), `?ref=` yakalama; koşul: e-posta doğrulama + N bitmiş yarış; tavan ömür boyu + günlük; ödül iki tarafa tek transaction |
| §8 Bildirimler | YAPILDI | istek, kabul, gelen çip, transfer başarılı, yarış daveti, davet ödülü (`referral_reward`). Başarısız transfer bildirimi BİLİNÇLİ YOK: geri alınan iş bildirim de bırakmaz, hata ekranda |
| §9 Ekranlar | YAPILDI | Arkadaşlarım/arama/istekler/transfer/onay `/friends`; profil `/profile/[username]`; geçmiş `/wallet`; mağaza `/store`; davet + ödüller `/invite`; bildirimler `/notifications` |

## 2. Migration'lar (hepsi ekleyici, mevcut veri bozulmaz)

| No | İçerik | Geri alma |
|---|---|---|
| 0090 | `players.last_seen_at` (NULL), `players.show_online_status` (varsayılan true) + indeks | sütunları düşürür |
| 0091 | `notifications_type_check` ADIYLA yeniden yazılır: `gift_sent`, `referral_reward` | önceki küme |
| 0092 | `player_referral_codes` (kod TEKİL), `referrals` (davetli TEKİL, kendine yasak, ödül tutarlılığı CHECK'i), FK'ler + indeksler | tabloları düşürür |
| 0093 | `payment_orders.chips`, `clawback_shortfall_chips`; `payment_orders_one_reward` (ya elmas ya çip); eski `gems > 0` kısıtı ADIYLA düşer, yerine `gems >= 0` | eski kısıt |

## 3. Yeni / değişen uçlar

| Yöntem | Yol | Not |
|---|---|---|
| GET | `/social/search?q=` | `@RateLimit`, `social.playerSearch.limit` |
| GET | `/players/:id/relationship/:otherId` | yalnızca kendi `:id` (403) |
| POST | `/presence/heartbeat` | `@RateLimit`; son görülmeyi sunucu saatiyle yazar |
| GET/PUT | `/players/:id/privacy` | `{ showOnlineStatus: boolean }` (tip denetimi controller'da) |
| GET | `/players/:id/gifts/quota` | hazır tutarlar, kalan günlük hak, gönderilebilir bakiye |
| GET | `/referrals` | kendi kodun, koşullar, davet ettiklerin, seni davet eden |
| POST | `/referrals/attach` | `{ code }`; pencere `attachWindowHours`; engelli/karşılıklı/ikinci bağlama reddedilir |
| POST | `/referrals/claim` | koşulları KİLİT ALTINDA yeniden denetler; tekrar → 0 |
| GET | `/store` | ürün artık `chips` taşır |
| GET | `/admin/payments` | satır `chips` + `clawbackShortfallChips` taşır |

Hata kodları: `GIFT_LIMIT_EXCEEDED` (409), `REFERRAL_CODE_NOT_FOUND` (404),
`REFERRAL_SELF` (400), `REFERRAL_ALREADY_ATTACHED` (409),
`REFERRAL_ATTACH_WINDOW_CLOSED` (409). Defter türleri: `referral_reward`,
`referral_welcome_reward` (ödül), `chip_purchase` (yatırma), `chip_purchase_refund` (iade).

## 4. Brief §11 senaryosu → test

| Senaryo | Test |
|---|---|
| Başarılı istek / tekrar / kabul / ret | `social.e2e-spec.ts` (istek, kanonik çift 409, accept, reject, çift yanıt 404) |
| Engelli oyuncuya işlem | `moderation.e2e-spec.ts`, `gift.e2e-spec.ts`, `referral.e2e-spec.ts` (engelli çift bağlanamaz / ödül yok), `player-discovery.e2e-spec.ts` (aramada görünmez) |
| Yetersiz çip | `gift.e2e-spec.ts` → `INSUFFICIENT_FUNDS`, satır yok |
| Başarılı transfer + iki bildirim | `gift.e2e-spec.ts`, `chip-transfer.e2e-spec.ts` |
| Aynı istek tekrar | `gift.e2e-spec.ts` (aynı `Idempotency-Key` → tek hediye, tek bildirim) |
| Eşzamanlı transfer bakiyesi | `chip-transfer.e2e-spec.ts` (yetmeyen ikinci 409; A→B + B→A birlikte biter; günlük tavan iki katına çıkmaz) |
| Veritabanı hatası | `chip-transfer.e2e-spec.ts` (tetikleyiciyle yapay hata → bakiye, defter, bildirim geri alınır) |
| Geçersiz gönderen/alıcı | `gift.e2e-spec.ts` (kendine, biçimsiz UUID, arkadaş olmayan), `chip-transfer.e2e-spec.ts` (silinmiş alıcı) |
| Limit aşımı | `chip-transfer.e2e-spec.ts` (yeni hesap, günlük, alıcı günlük), `test/domain/gift/gift-limits.spec.ts` |
| Başkasının bakiyesi | `gift.e2e-spec.ts` / `social.e2e-spec.ts` (assertSelf 403), `chip-transfer.e2e-spec.ts` (başkasının kotası 403) |
| Davet ödülü iki kez | `referral.e2e-spec.ts` (ikinci talep 0, eşzamanlı iki talep tek ödeme, günlük tavan) |
| Ödeme doğrulanmadan çip | `payments.e2e-spec.ts` (sipariş ve sahte imzalı webhook çip/elmas vermez) |
| Aynı ödeme iki kez | `payments.e2e-spec.ts` (aynı olay ×3 + ikinci başarı olayı → tek ödül) |
| Geçmiş ↔ bakiye tutarlılığı | `payments.e2e-spec.ts` (bakiye = başlangıç + defter), `player-journey.e2e-spec.ts`, `economy-reconciliation.e2e-spec.ts` |

## 5. Güvenlik riskleri → önlem

- **Çoklu hesapla değer aktarma** (en büyük risk): yeni hesap tavanı, alıcı
  günlük tavanı (çok hesaptan tek hesaba huni), satın alınan çip hediye
  edilemez, davet ödülü koşullu + tavanlı + karşılıklı davet yasak, mevcut
  anomali listesi (`/admin` → Şüpheli).
- **Çift ödeme / yarış koşulu**: oyuncu satırları id sırasıyla `FOR UPDATE`,
  sayımlar kilit altında, `Idempotency-Key` (transfer), DB tekilliği (davet
  çifti, webhook olayı), durum geçişi (sipariş).
- **İstemciye güven**: bakiye, ödül, limit, kod, koşul hep sunucuda; "ödendi"
  diyen istemci ucu yok; arama sonuçları bakiye taşımaz.
- **Enumerasyon / gizlilik**: arama engelli çifti ve silinmiş hesabı göstermez,
  durumunu gizleyen oyuncunun son görülmesi dönmez; davet kodu tahmin
  edilemez alfabeden (`crypto.randomBytes`).
- **Hız sınırı**: arama, kalp atışı, transfer, davet bağlama/talep `@RateLimit`.
- **Kişisel veri**: `referrals` hesap silme ve dışa aktarma listelerinde.

## 6. Gerçek servis gerektiren / doğrulanmamış

- **Gerçek ödeme sağlayıcısı YOK.** `PAYMENT_PROVIDER` boşken mağaza
  "satın alma kapalı" yazar, sipariş 503. Çip/elmas akışı yalnızca sahte
  imzalı sağlayıcıyla (e2e `FakeGateway`) kanıtlandı; canlı ödeme denenmedi.
- **Mobil mağaza doğrulaması (App Store / Google Play) YOK** — uygulama web/PWA.
- **Davet koşulundaki e-posta doğrulaması** üretimde `RESEND_API_KEY` ister;
  yoksa doğrulama e-postası giden kutusunda kalır ve davet ödülü açılmaz.
- **WhatsApp paylaşımı** yalnızca `wa.me` bağlantısıdır (API anahtarı yok);
  gerçek cihazda denenmedi. Arayüz değişiklikleri tarayıcıda gözle görülmedi.

## 7. Bilinçli olarak yapılmayanlar

- Başarısız transfer için bildirim satırı (geri alınan transaction'a yazılamaz;
  hata ekranda gösterilir).
- Referans oyunun görselleri/markası kullanılmadı; mevcut altın-lacivert tema.
- Elmas politikası değişmedi: elmas → çip dönüşümü ve elmas hediyesi YOK.
