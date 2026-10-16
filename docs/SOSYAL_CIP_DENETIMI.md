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
