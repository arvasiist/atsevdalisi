# Arkadaşlık + Çip Hediyesi — Gerçek Durum Denetimi (16.10.2026)

Yöntem: kod (migration, controller → use-case → repository), göç uygulanmış
veritabanı, otomatik testler, GitHub Actions kayıtları ve **gerçek tarayıcıda
iki oyunculu yolculuk** (`tools/dev/friends-gift-journey.mjs`, Chromium).
Belgelere bakılarak hiçbir madde "tamam" sayılmadı.

| # | Madde | Sınıf | Kanıt |
|---|---|---|---|
| 1 | Migration 0033 (arkadaşlık + mesaj) | IMPLEMENTED | `0033_create_friendships_and_messages.up.sql`: `friendships` (kanonik çift `low < high`, kendine yasak, isteyen taraflardan biri, durum CHECK), `direct_messages` (1–500 karakter, kendine yasak). Göç uygulanmış test DB'sinde iki tablo da var |
| 2 | Migration 0034 (çip hediyesi) | IMPLEMENTED | `0034_create_gift_sends.up.sql`: `gift_sends` (`amount > 0`, kendine yasak, birim CHECK, FK). Test DB'sinde var |
| 3 | `/friends`: ekle, kabul, çip gönder | IMPLEMENTED | Tarayıcı yolculuğu 11/11: arama → "Arkadaş Ekle" → karşı tarafta "Kabul Et" → "Çip Hediye Et" → hazır tutar → onay ekranı (alıcı, tutar, işlem sonrası bakiye) → sonuç; sayfa hatası 0 |
| 4 | `POST`/`GET /players/:id/gifts` gerçek backend | IMPLEMENTED | `gift.controller.ts` → `SendGiftUseCase`/`ListMyGiftsUseCase` → `PostgresGiftRepository`; e2e gerçek Postgres'e koşar; yolculukta iki tarafın geçmişi aynı `giftId` |
| 5 | Gönderenden düşer, alıcıya eklenir | IMPLEMENTED | `gift.e2e-spec.ts` "TRANSFER" (iki satır + iki defter satırı, önce/sonra bakiye); yolculuk A 5000→4950, B 5000→5050 |
| 6 | Idempotency, günlük limit, arkadaşlık, atomiklik | IMPLEMENTED | `IdempotencyInterceptor` (zorunlu anahtar, oyuncu kapsamı, aynı anahtar → aynı yanıt); tek `withTransaction`: iki oyuncu id sırasıyla `FOR UPDATE` → arkadaşlık + engel KİLİT ALTINDA yeniden → günlük sayı + tutar tavanları kilit altında → bakiye → `gift_sends` + iki defter satırı + iki bildirim. Testler: aynı anahtar tek hediye, eşzamanlı tavan, yetmeyen eşzamanlı ikinci 409, karşılıklı transfer kilitlenmez, yapay DB hatasında her şey geri alınır |
| 7 | Geçmiş ↔ defter tutarlılığı | IMPLEMENTED (+ yeni kilit) | Yeni e2e `chip-transfer.e2e-spec.ts` "mutabakat": geçmiş = `gift_sends`, her hediyeye tam iki defter satırı (−/+), yetim defter satırı yok, tekrar ve başarısız istek iz bırakmaz, bakiye zinciri son bakiyeye eşit |
| 8 | Testler davranışı gerçekten doğruluyor mu | IMPLEMENTED | API: `gift` 34, `social` 33, `moderation` 26, `chip-transfer` 11, `friend-gift` 11, `player-discovery` 7, `referral` 7, `friendship-race-gate` 5; domain `gift-limits`, `friend-gift`; web `chip-transfer` 5, `friend-gift` 5, `presence` 5 |
| 9 | Son CI koşuları | Bkz. aşağı | — |
| 10a | Arkadaşa hediye bildirimi | IMPLEMENTED | alıcıya `gift_received`, gönderene `gift_sent` (aynı transaction); yolculukta iki taraf da gördü |
| 10b | Engelleme (sunucu) | IMPLEMENTED | mesaj/istek/davet/hediye iki yönde 403 `PLAYER_BLOCKED`, kapı para transaction'ının içinde |
| 10c | Engelleme (arayüz) | **PARTIAL → düzeltildi** | Eskiden: engellenen arkadaş, engelleyenin listesinde "Yazış / Çip Hediye Et / Davet" düğmeleriyle kalıyordu (her işlem sunucuda reddediliyordu) ve arkadaş satırında "Engelle" yoktu (yalnızca profilde). Şimdi: engellediğin arkadaş ve bekleyen isteği listenden düşer ("Engellenenler"de görünür, kaldırınca geri gelir); arkadaş satırında onaylı "Engelle". Engellenen tarafın listesi DEĞİŞMEZ (yön sızdırılmaz). Kanıt: `moderation.e2e-spec.ts` "engel + arkadaş listesi", web `chip-transfer.spec.ts`, yolculuk adım 9 |

## 9. GitHub Actions (dal `claude/project-review-gaps-j1hb2l`)

| Commit | build-and-test | security | docker |
|---|---|---|---|
| `ac486aa` | ✅ API 245 dosya / 2987 test, web 93 / 755, typecheck, migrate, build, yük testi | ✅ | ❌ BuildKit bağlantısı derleme başlamadan koptu (`rpc error … EOF`) — altyapı; bir kez yeniden koşturuldu |
| `ed9c3ca` | ✅ | ✅ | ✅ |
| `4606d16` | ❌ web `AnnouncementStrip.spec.tsx` CI zamanlama yarışı (`0px`) — `ed9c3ca`'da test etkiyi bekleyecek şekilde düzeltildi | ✅ | ✅ |
| `7c337d3`, `2697a71`, `d5be4fb`, `446cb98`, `5fd688f` | ✅ | ✅ | ✅ |

CI'da koşan sosyal/hediye dosyaları (ac486aa kaydından): `gift.e2e` 34, `social.e2e` 33,
`moderation.e2e` 25, `friend-gift.e2e` 11, `chip-transfer.e2e` 10, `referral.e2e` 7,
`player-discovery.e2e` 7, `friendship-race-gate.e2e` 5 — hepsi geçti. Bu denetimde
eklenen testler bir sonraki koşuda girer.

## Kalan bilinen risk (düşük, düzeltilmedi)

`IdempotencyInterceptor` anahtarı para transaction'ından ÖNCE `pending` ayırır ve
SONRA `completed` yazar. Süreç tam bu ikisinin arasında çökerse para hareketi
doğru (bir kez) yazılmıştır ama anahtar `pending` kalır; aynı anahtarla tekrar 409
`IDEMPOTENCY_KEY_IN_PROGRESS` alır. **Çift transfer olmaz**; yalnızca o anahtar
kullanılamaz kalır (istemci tutar/alıcı değişince yeni anahtar üretir). Ayırmayı
para transaction'ına taşımak bütün para yollarının ortak ara katmanını değiştirir —
ayrı bir karar.

## Yerelde koşulanlar

- `npm run typecheck` (kök) — temiz
- API: sosyal/hediye e2e 9 dosya / 139 test; tam paket temiz şemada (sonuç aşağıda)
- Web: 93 dosya / 756 test
- Tarayıcı: `tools/dev/friends-gift-journey.mjs` 11/11 (ayrı veritabanı, API + `next dev`)
