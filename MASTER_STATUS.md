# AT SEVDALISI MASTER STATUS

> Son güncelleme: 02.10.2026 · Dal: `claude/project-review-gaps-j1hb2l` (PR #2)
> Kaynak: KOD (migration, use-case, controller, ekran, test) — belgeler değil.
> Ayrıntılı tarihçe `PROJE_DURUMU.md` §13'te; bu dosya brief'in istediği
> özet sözleşmedir. Sınıflar: NOT_STARTED · PLANNED · PARTIAL · IMPLEMENTED ·
> TESTED · PRODUCTION_READY · BROKEN · NEEDS_REFACTOR.
>
> ⚠️ Hiçbir özellik PRODUCTION_READY DEĞİLDİR: staging, izleme, yedek/geri
> yükleme ve gerçek dağıtım doğrulanmadı (brief §121). "TESTED" = veritabanı +
> backend + API + ekran + otomatik test (birim/e2e) var ve yerelde + CI'da geçiyor.

## Repository

- Monorepo (npm workspaces): `apps/api` (NestJS 10), `apps/web` (Next.js 14),
  `packages/shared-types`, `packages/game-config`, `config/*.json`,
  `database/migrations` (0001–0056, `up`/`down`), `database/seeds/001_dev_seed.sql`,
  `tools/` (migrate, seed, demo timeline), `docker-compose.yml` (yalnızca
  Postgres 16 + Redis 7 — uygulama imajı YOK).
- CI: `.github/workflows/ci.yml` → `npm ci` → lint → typecheck → migrate →
  test (api + web + paketler) → build. Postgres/Redis servis konteyneri.
- Test: API 155 dosya / 2331 test, web 42 dosya / 509 test (02.10.2026).
- Kökte gitignore'lu eski scratch dosyaları (`*.bundle`, `*.bat`, `*-log.txt`) — zararsız.

## Current Architecture

- Backend katmanları uygulanıyor: `domain/` (saf TS, Nest/ORM yok) →
  `application/` (use-case + port) → `infrastructure/` (Postgres repo,
  zamanlayıcılar, config) → `api/` (controller, guard, gateway). Para yolu
  `SELECT … FOR UPDATE` + aynı transaction'da `economy_transactions`.
- Defter DEĞİŞTİRİLEMEZ (DB tetikleyicisi UPDATE/DELETE'i reddeder).
- Yarış motoru `domain/race/race-engine.ts`: seed'li PRNG, deterministik,
  config güdümlü; komutsuz çıktı SHA-256 parmak iziyle kilitli.
- Gerçek zamanlı: Socket.IO `RaceGateway` (`/races` namespace) — yarış
  oynatma, tribün sohbeti, izleyici sayısı, bildirim, eşleştirme.
- Zamanlayıcılar (Nest içi, ayrı worker YOK): kilit, kesinleşme, takvim,
  turnuva, sezon, eşleştirme taraması, etkileşimli yarış, müzayede kapanışı.
- Config: `config/*.config.json` + `packages/game-config` (tipli yükleyiciler).

## Frontend Status — TESTED (üretim değil)

Rotalar: `/` (3D vitrin), `/stable`, `/training`, `/care`, `/equipment`,
`/farm`, `/staff`, `/market`, `/races` (lobi + pratik + kontrollü sürüş),
`/races/[id]/watch`, `/replays`, `/grandstand`, `/leaderboard`, `/club`,
`/friends`, `/profile/[username]`, `/notifications`, `/wallet`, `/account`,
`/admin`, `/online`. Altın-lacivert tema, mobil alt sekme çubuğu, PWA manifest.
Eksik: avatar ekranı, sosyal hub, olay/duyuru ekranı.

## Backend Status — TESTED

28 API modülü (auth, player, horse, stable, training, care, feed, equipment,
farm, staff, jockey, market, breeding, race, matchmaking, grandstand, chat,
social, gift, notification, leaderboard, club, season, economy, admin,
health, idempotency, rate-limit, realtime). Doğrulama controller + domain'de
çift katman (esbuild altında DTO dekoratörleri atlandığı için).

## Database Status — TESTED

56 migration (hepsi `down` dosyalı), FK/CHECK/kısmi tekil indeksler, değişmez
defter tetikleyicisi. Eksik: üretim yedek/geri yükleme prosedürü ve testi;
migration'ların üretim verisinde prova ortamı (staging) yok.

## Authentication Status — PARTIAL

VAR: misafir kayıt (JWT), e-posta + şifre (`scrypt`), şifre sıfırlama (tek
kullanımlık, 30 dk, özet saklanır), Google girişi + hesap bağlama, hız sınırı.
VAR (02.10.2026, Faz 1-B.1): kısa ömürlü erişim JWT'si + dönen refresh
token (özet saklanır, yeniden kullanımda oturum kapanır), sunucu tarafı
logout / logout-all, cihaz listesi + cihaz kapatma, şifre sıfırlamada tüm
oturumların kapanması, guard + soket oturum kapısı (çıkış ANINDA etkili).
VAR (02.10.2026, Faz 1-B.2): e-posta doğrulama (bağlantı, yeniden gönderme, durum).
VAR (02.10.2026, Faz 1-B.3): hesap silme (kişisel veri silme + anonimleştirme, para emanetinde engel).
YOK: Apple girişi; kişisel veri DIŞA AKTARMA. Üretim için `GOOGLE_OAUTH_CLIENT_ID`, `RESEND_API_KEY`, güçlü `JWT_SECRET` gerekir.

## Economy Status — TESTED (üretim değil)

Sunucu otoriteli; her hareket defterde (tür, tutar, önce/sonra bakiye,
referans). Idempotency: satın alma, hediye, para yatırma, bilet (anahtar);
yarış ödülü/iade/müzayede durum geçişiyle. Mutabakat e2e testi var.
⚠️ **ÜRETİM ENGELİ:** `mockDeposit.enabled = true` — gerçek ödeme olmadan
oyuncuya sanal para yükleyen bir yol (brief §70 "FAKE PURCHASE"). Elmas
(premium) birimi var ama **harcama yolu yok** (`gemShopWhitelist` ölü config).
Gerçek ödeme sağlayıcısı YOK (NOT_STARTED).

## Horse Status — TESTED

8 görünür + 6 gizli stat (mizaç, odak, cesaret, rekabet, stres direnci,
itaat), sağlık 6 boyut, yaş/gelişim, görünüş (don/sakarlık), zemin/mesafe
uygunluğu, ekipman, yarış geçmişi, piyasa değeri, sahiplik kilitleri
(açık yarışta/pazarda at satılamaz). Kişilik (brief §14 CALM/BRAVE…) ayrı
etiket olarak YOK; gizli statlar motor/antrenman/jokey uyumuna bağlı.
"Açlık" ve "stres" canlı durum alanı YOK (stres direnci statı var).

## Stable Status — TESTED

Ahır seviyesi/kapasitesi, yükseltme (para yolu), 3D ahır sahnesi (prosedürel yedek).

## Training Status — TESTED

Tür/yoğunluk/süre; kazanç potansiyel, mevcut stat, canlılık, antrenör ve
tesis çarpanına bağlı; yorgunluk/sakatlık riski; geçmiş.

## Care Status — TESTED

Bakım eylemleri (dinlenme, tımar, veteriner, nalbant…), bekleme süreleri,
sakatlıktan çıkış, personel ve padok etkisi, yem envanteri ve besleme.

## Race Engine Status — TESTED

Deterministik, 8/10/12/14/16 at, tempo/sollama/blok/pozisyon/dayanıklılık,
zemin/hava/mesafe, jokey etkisi (beceri + 02.10.2026'dan beri at uyumu),
taktik, oyuncu kontrolü (kırbaç/yön/sakin), tekrar oynatma (telemetri).
Denge ölçümü CI'da kilitli (`RACE_BALANCE_REPORT.md`). Bilinen ölçülmüş
risk: sürpriz payı dar (favori çok sık kazanıyor) — bilinçli düzeltilmedi.
Start kulvarı (`gatePosition`) motorda okunmuyor — sahibinin kararı bekliyor.

## Genetics Status — TESTED

Kalıtım, mutasyon, soy ağacı okuma (`PedigreeTree`), görünüş kalıtımı.

## Management Status — TESTED

Jokey (kiralama/bırakma, beceri, at uyumu), personel (antrenör, seyis,
veteriner, nalbant; sözleşme peşin, süre dolumu), pazar (sabit fiyat +
müzayede/emanet, bildirimler).

## Farm Status — TESTED

Yedi tesis tipi, inşa/yükseltme (para yolu), etkiler bağlı (padok, pist,
depo, üreme merkezi); veteriner merkezi bilinçli olarak etkisiz/kapalı.

## 3D Status — PARTIAL

Kod hattı TAM (R3F): yarış, ana sayfa vitrini, ahır; GLB bağlama, LOD,
kalite kademesi, ışık/HDRI, start kapısı, toz, kamera yönetmeni, foto-finiş.
**Gerçek varlık YOK** — prosedürel at/jokey/hipodrom + ekranda "PLACEHOLDER"
rozeti. Brief §30 gereği bu hâli üretime hazır SAYILMAZ. Varlıklar ÜCRETLİ
alınacak (sahibinin kararı, 02.10.2026).

## Multiplayer Status — TESTED (üretim değil)

Lobi yarışı (katıl/hazır/ayrıl, kilit, kesinleşme, iade), eşleştirme (PvP),
turnuva, takvim, kontrollü canlı yarış (çok oyunculu komutlar), tribün (canlı +
tekrar), yeniden bağlanma (kopma DB'ye dokunmaz; süren yarış yeniden açılır).
Yük testi YOK; tek süreçli zamanlayıcılar yatay ölçeklemede çift çalışır
(satır kilitleri çift ödemeyi engelliyor ama iş tekrarlanır).

## Social Status — TESTED

Arkadaşlık, mesaj, hediye (para yolu), engelleme/şikâyet, profil, bildirimler,
yarış daveti, kulüp (kur/katıl/lider devri/puan). YOK: emote, sosyal hub,
kulüp sohbeti/kulüp yarışı.

## AI Avatar Status — NOT_STARTED

`players.avatar_id` yalnızca hazır görsel kimliği. Selfie yükleme, sağlayıcı
soyutlaması, iş kuyruğu, nesne depolama, rıza/silme akışı YOK. Ön koşullar:
sağlayıcı seçimi + API anahtarı, nesne depolama (S3 uyumlu), gizlilik metni.

## Mobile/PWA Status — IMPLEMENTED

Duyarlı arayüz, alt sekme çubuğu, 3D kalite kademesi/otomatik düşürme,
manifest + üretilen ikonlar (Chromium kurulabilirlik denetimi hatasız).
Gerçek cihaz testi YAPILMADI. Service worker bilinçli olarak yok.

## Admin Status — PARTIAL

Rol `players.is_admin` (her istekte DB'den), denetim günlüğü (aynı
transaction), 7 uç: şikâyet kuyruğu + durum, denetim günlüğü, oyuncu/yarış/
işlem listeleri, yarış iptali (iade). `/admin` ekranı. YOK: at/pazar/kulüp/
turnuva/sezon yönetimi, config yönetimi, duyurular, rol yönetimi
(MODERATOR/SUPER_ADMIN), eski/yeni değer + IP + gerekçe alanları (kısmen).

## Live Operations Status — PARTIAL

Zamanlayıcıyla açılan takvim yarışları, turnuvalar, sezon ve sezon ödülü,
günlük ödül. YOK: günlük/haftalık etkinlik, duyuru, sınırlı ödül, yönetimden
etkinlik planlama.

## Observability Status — PARTIAL (zayıf)

`GET /health` yalnızca "ok" döner (DB/Redis kontrol ETMEZ). Nest `Logger`
var; yapılandırılmış log, istek kimliği (request id), hata izleme (Sentry vb.),
metrik YOK. Hata yanıtı `{ code, message }` — request id taşımıyor.

## Deployment Status — NOT_STARTED

Dockerfile, staging/production ortamı, dağıtım hattı, ortam ayrımı, gizli
anahtar yönetimi YOK. CI yalnızca doğrular (deploy etmez).

## Security Status — PARTIAL (iyi temel)

Sunucu otoritesi, sahiplik kapıları, IDOR (403 önce 404 sonra), hız sınırı
(sosyal/para/yarış/müzayede), idempotency, değişmez defter, gizli statların
sızmaması, tohum gizliliği, helmet. YOK: CI'da bağımlılık/gizli anahtar/SAST
taraması, anormal davranış tespiti, dosya
yükleme güvenliği (henüz yükleme yok).

## Testing Status — TESTED

Birim (domain), entegrasyon/e2e (gerçek Postgres + Redis, supertest +
socket.io-client), güvenlik (`test/security`), denge (265k simülasyon),
determinizm parmak izi, para mutabakatı, tarayıcı testleri (yerel Playwright,
CI'da değil). YOK: yük testi, CI'da tarayıcı E2E, mutasyon testi CI'da.

## Documentation Status — IMPLEMENTED

`CLAUDE.md` (kurallar + tuzaklar), `PROJE_DURUMU.md` (tarihçe §13.1–13.62),
`docs/*` (API, DB, motor, ekonomi, güvenlik, denge raporu, varlık rehberi).
`README.md`/`ROADMAP.md` faz tabloları BAYAT (CLAUDE.md kural 9).

## Existing Bugs

- Bilinen açık hata YOK. 02.10.2026'da düzeltilen: CI'ı rastgele düşüren iki
  kararsız antrenman testi (`staff.e2e`, `training.e2e`).
- Ölçülmüş tasarım riski: yarış sürpriz payı dar (`RACE_BALANCE_REPORT.md` §2c).

## Missing Features

Kişisel veri dışa aktarma · Apple girişi · AI avatar (tümü) ·
gerçek ödeme + elmas harcama yolu · gerçek 3D/ses varlıkları · sosyal hub/emote ·
kulüp sohbeti/yarışı · canlı etkinlik/duyuru sistemi · yönetim panelinin
geri kalanı (at/pazar/config/etkinlik/rol) · gözlemlenebilirlik · dağıtım.

## Technical Debt

- Zamanlayıcılar API sürecinde (ayrı worker/kuyruk yok) — yatay ölçeklemede
  tekil çalışma kilidi (advisory lock / lider seçimi) gerekir.
- `in_progress` yarış durumu ölü (miras).
- `PlayerDemoWidget` bağlı değil (bilinçli, kaldırılabilir).
- `gemShopWhitelist` ölü config (okuyan kod yok).
- README/ROADMAP faz tabloları bayat.

## Production Blockers

1. Gerçek 3D/ses varlıkları (satın alınacak).
2. `mockDeposit` üretimde açık (sahte para yolu) — kapatılmalı ya da gerçek ödemeyle değiştirilmeli.
3. ~~Oturum güvenliği: 30 günlük iptal edilemez JWT, logout/refresh yok.~~ **KAPANDI (02.10.2026, Faz 1-B.1).**
4. ~~E-posta doğrulama + hesap silme (KVKK/GDPR) yok.~~ **KAPANDI (02.10.2026, Faz 1-B.2/1-B.3)**; veri dışa aktarma hâlâ yok.
5. Gözlemlenebilirlik (sağlık kontrolü DB/Redis, request id, hata izleme) yok.
6. Dağıtım (Dockerfile, staging, gizli anahtar yönetimi, yedek/geri yükleme) yok.
7. Kimlik bilgileri: `GOOGLE_OAUTH_CLIENT_ID`, `RESEND_API_KEY`.
8. AI avatar (brief zorunlu kılıyor) — sağlayıcı + depolama kararı.

## Recommended Priority

1. **PHASE 1-B — Hesap/oturum tamamlama** (refresh token + logout + e-posta
   doğrulama + hesap silme) — CORE, en düşük risk, sahip kararı gerektirmez.
2. **PHASE 13-A — Üretim temeli (kodla yapılabilen)**: sağlık kontrolü
   (DB/Redis), request id + yapılandırılmış hata yanıtı, `mockDeposit`
   üretimde kapalı (ortam kapısı), CI'a bağımlılık + gizli anahtar taraması,
   Dockerfile'lar.
3. PHASE 10 — Yönetim panelini genişletme (at/pazar/config/duyuru, roller).
4. PHASE 11 — Canlı etkinlik + duyuru sistemi.
5. PHASE 8 — AI avatar (sağlayıcı + depolama kararından SONRA).
6. PHASE 12 — Ödeme (sağlayıcı + yasal inceleme kararından SONRA).
7. PHASE 6 — Gerçek varlık entegrasyonu (satın alma SONRASI; kod hazır).

## Current Phase

Brief fazlarına göre gerçek durum:

| Faz | Durum |
|---|---|
| 0 Audit | COMPLETE (bu dosya) |
| 1 Core | TESTED — oyun çekirdeği + oturum + e-posta doğrulama + hesap silme (1-B.1/2/3); Apple girişi ve veri dışa aktarma yok |
| 2 Management | TESTED |
| 3 Genetics | TESTED |
| 4 Farm | TESTED |
| 5 Advanced Race | TESTED (kulvar etkisi hariç — karar bekliyor) |
| 6 3D/Presentation | PARTIAL — kod tam, gerçek varlık yok |
| 7 Online | TESTED (yük testi yok) |
| 8 AI Avatar | NOT_STARTED |
| 9 Social | PARTIAL — hub/emote/kulüp sohbeti yok |
| 10 Admin | PARTIAL |
| 11 Live Ops | PARTIAL |
| 12 Monetization | NOT_STARTED (yalnızca sahte yatırma) |
| 13 Production | NOT_STARTED |
| 14 Final E2E | PARTIAL — `final.e2e-spec.ts` API yolculuğu var; avatar/ödeme yok |

## Next Phase

**PHASE 1-B — Hesap ve oturum tamamlama**, ardından **PHASE 13-A — üretim
temeli**. Gerekçe: ikisi de sahibin dış kararına (sağlayıcı, satın alma)
bağlı değil, mevcut mimariye eklenir (yeni framework yok), üretim
engellerinden 3, 4, 5 ve 2'yi kapatır ve mevcut oyun akışını riske atmaz.

---

## Faz Raporu

PHASE: 0 — Audit / Architecture
STATUS: COMPLETE
COMPLETED: Kod tabanının gerçek durumu çıkarıldı (bu dosya).
FILES CREATED: MASTER_STATUS.md
FILES MODIFIED: —
DATABASE CHANGES: —
API CHANGES: —
FRONTEND CHANGES: —
BACKEND CHANGES: —
GAMEPLAY CHANGES: —
3D CHANGES: —
AI CHANGES: —
SECURITY CHANGES: —
ADMIN CHANGES: —
DEPLOYMENT CHANGES: —
TESTS ADDED: —
TESTS PASSED: API 2331/2331, web 509/509 (yerel, temiz şema)
TESTS FAILED: 0 (CI #264 kararsız testten düştü; düzeltme 580bc6d + 159b93e)
BUGS FOUND: mockDeposit üretimde açık; gemShopWhitelist ölü config; /health DB/Redis'i denetlemiyor
BUGS FIXED: kararsız antrenman testleri
TECHNICAL DEBT: yukarıda
PRODUCTION BLOCKERS: yukarıda (8 madde)
REMAINING: Faz 1-B, 13-A, 10, 11, 8, 12, 6
NEXT PHASE: 1-B Hesap/oturum tamamlama

---

PHASE: 1-B.1 — Oturum güvenliği (refresh token, logout, logout-all, cihazlar)
STATUS: TESTED
COMPLETED: Kısa ömürlü erişim JWT'si (`sid`) + dönen refresh token; yeniden
kullanım tespiti; sunucu tarafı çıkış / tüm cihazlardan çıkış; cihaz listesi
ve kapatma (IDOR 404); eski token kabulü + yükseltme; şifre sıfırlamada tüm
oturumların aynı transaction'da kapanması; guard + soket oturum kapısı;
web otomatik yenileme, sekmeler arası kilit, yalnızca 401'de oturum silme,
`/account` "Oturumlar" paneli.
FILES CREATED: database/migrations/0057_create_auth_sessions.{up,down}.sql ·
apps/api/src/domain/auth/session.ts · application/ports/auth-session.repository.ts ·
application/use-cases/auth-session.use-case.ts ·
infrastructure/auth/postgres-auth-session.repository.ts ·
apps/web/src/lib/session-logic.ts · features/auth/{SessionsPanel.tsx,device-label.ts} ·
testler (aşağıda)
FILES MODIFIED: auth.guard · auth.controller · player.controller · race.gateway ·
token.service (+jsonwebtoken) · token.module · postgres-player-credentials.repository ·
http-exception.filter · config/auth.config.json (+session) · game-config types ·
shared-types (AuthSession, SessionTokens, AuthSessionInfo, 3 hata kodu) ·
web api-client · player-context · account sayfası · globals.css · belgeler
DATABASE CHANGES: `auth_sessions` tablosu + `players.tokens_valid_after` (veri bozmayan, eklemeli)
API CHANGES: POST /auth/refresh, /auth/session, /auth/logout, /auth/logout-all;
GET /auth/sessions; DELETE /auth/sessions/:id. Giriş/kayıt yanıtına
`refreshToken` + `accessTokenExpiresAt` eklendi. Var olmayan oyuncunun
token'ı 401 (eskiden 404). Soket reddi artık `connect_error`.
FRONTEND CHANGES: otomatik yenileme, eski oturum yükseltme, Oturumlar paneli
BACKEND CHANGES: oturum servisi, guard async, soket kimliği ara katmanda
GAMEPLAY CHANGES: —
3D CHANGES: —
AI CHANGES: —
SECURITY CHANGES: iptal edilebilir oturum; çalıntı refresh tespiti; şifre
sıfırlama tüm oturumları öldürür; refresh token düz metni saklanmaz/loglanmaz
ADMIN CHANGES: —
DEPLOYMENT CHANGES: `JWT_EXPIRES_IN_SECONDS` env KALDIRILDI (süre config'te)
TESTS ADDED: api `auth-session.e2e-spec.ts` (10), `domain/auth/session.spec.ts` (5),
`realtime.e2e-spec.ts` (+1: çıkmış token soket açamaz); web `session-logic.spec.ts`,
`player-context.spec.tsx` (+3), `api-client.spec.ts` (+5)
TESTS PASSED: API 2346/2346 (157 dosya, temiz şema), web 43 dosya yeşil; tarayıcıda
uçtan uca (kayıt → bozuk token → yenileme → eski token yükseltme → tüm cihazlardan çıkış)
TESTS FAILED: 0
BUGS FOUND: web her hatada (ağ kopması dahil) oturumu siliyordu; soket kapısı
async olunca ilk olay `playerId`siz işleniyordu; StrictMode çift yükseltme
BUGS FIXED: üçü de
TECHNICAL DEBT: açık soket bağlantısı çıkışta koparılmaz (yeni bağlantı reddedilir)
PRODUCTION BLOCKERS: "iptal edilemez 30 günlük JWT" KAPANDI
REMAINING: 1-B.2 e-posta doğrulama, 1-B.3 hesap silme, 13-A üretim temeli
NEXT PHASE: 1-B.2 E-posta doğrulama

---

PHASE: 1-B.2 — E-posta doğrulama
STATUS: TESTED
COMPLETED: Kayıtta doğrulama e-postası; tek kullanımlık, süreli, e-postaya
bağlı bağlantı (özet saklanır); yeniden gönderme (aralık sınırı); durum
`GET /auth/credentials.emailVerified`; `/account` rozeti + `/account/verify`.
FILES CREATED: database/migrations/0058_create_email_verification.{up,down}.sql ·
application/use-cases/email-verification.use-case.ts · apps/web/src/app/account/verify/page.tsx ·
test/api/email-verification.e2e-spec.ts
FILES MODIFIED: player-credentials port + Postgres repo · auth.controller/module ·
domain/auth/errors · http-exception.filter · config/auth.config.json (+emailVerification) ·
game-config types · shared-types (AccountCredentialsView.emailVerified, 3 kod) ·
web api-client + account sayfası · password-reset/google-link e2e (yeni e-posta/alan) · belgeler
DATABASE CHANGES: `player_credentials.email_verified_at` + `email_verification_tokens` (eklemeli)
API CHANGES: POST /auth/email/verification, POST /auth/email/verify; credentials görünümüne `emailVerified`
FRONTEND CHANGES: doğrulama rozeti, tekrar gönder, doğrulama sayfası (düğmeyle)
BACKEND CHANGES: EmailVerificationUseCase
GAMEPLAY CHANGES: —
3D CHANGES: —
AI CHANGES: —
SECURITY CHANGES: bağlantı düz metni saklanmaz/loglanmaz; e-posta değişirse eski bağlantı geçersiz
ADMIN CHANGES: —
DEPLOYMENT CHANGES: üretimde gerçek gönderim için `RESEND_API_KEY` (değişmedi)
TESTS ADDED: email-verification.e2e-spec.ts (5), web api-client (+1)
TESTS PASSED: API 158 dosya (2355 test; temiz şema), web 43 dosya / 523; tarayıcıda uçtan uca
TESTS FAILED: 0
BUGS FOUND: 98519ab öncesi e653023'te iki soket testi yanlışlıkla düşmüştü (CI lint yakaladı) — geri eklendi
BUGS FIXED: aynı
TECHNICAL DEBT: doğrulanmamış e-postayla adres işgali (devralma kararı yok)
PRODUCTION BLOCKERS: —
REMAINING: 1-B.3 hesap silme, 13-A üretim temeli
NEXT PHASE: 1-B.3 Hesap silme

---

PHASE: 1-B.3 — Hesap silme / veri yaşam döngüsü
STATUS: TESTED
COMPLETED: Kişisel veri silme + anonimleştirme (defter/maç geçmişi korunur);
parası emanette olan hesapta engel (kilit altında); onay (kullanıcı adı +
şifre); silinmiş oyuncu oturum açamaz, listelenmez; `/account` "Hesabı sil".
FILES CREATED: database/migrations/0059_add_player_deleted_at.{up,down}.sql ·
domain/account/account-deletion.ts · application/ports/account-deletion.repository.ts ·
application/use-cases/delete-account.use-case.ts ·
infrastructure/account/postgres-account-deletion.repository.ts · api/auth/account.controller.ts ·
apps/web/src/features/auth/DeleteAccountPanel.tsx · test/api/account-deletion.e2e-spec.ts
FILES MODIFIED: auth.module · domain/auth/errors · http-exception.filter · auth-session repo
(deleted_at) · player repo (findById/findByUsername/profil) · leaderboard + sezon sorguları ·
shared-types (AccountDeletionCheck, 3 kod) · web api-client, player-context (forgetSession),
account sayfası · belgeler
DATABASE CHANGES: `players.deleted_at` (eklemeli; veri bozmaz)
API CHANGES: GET /account/deletion, POST /account/delete
FRONTEND CHANGES: Hesabı sil paneli (engel listesi, onay, şifre)
BACKEND CHANGES: DeleteAccountUseCase + tek transaction'lı silme
GAMEPLAY CHANGES: silinmiş oyuncu sıralama/sezon ödülüne girmez
3D CHANGES: —
AI CHANGES: —
SECURITY CHANGES: silinen hesabın tüm token'ları anında geçersiz; yanlış şifre 403
ADMIN CHANGES: — (yönetim listesi silinmiş oyuncuyu anonim adıyla gösterir)
DEPLOYMENT CHANGES: —
TESTS ADDED: account-deletion.e2e-spec.ts (5), web api-client (+1)
TESTS PASSED: API 159 dosya / 2362 (temiz şema), web 43 / 524; tarayıcıda uçtan uca
TESTS FAILED: 0
BUGS FOUND: —
BUGS FIXED: —
TECHNICAL DEBT: kişisel veri dışa aktarma yok; şikâyet metinleri moderasyon kaydı olarak kalır
PRODUCTION BLOCKERS: "hesap/veri silme yok" KAPANDI
REMAINING: 13-A üretim temeli (health DB/Redis, request id, mockDeposit üretimde kapalı, CI taramaları, Dockerfile)
NEXT PHASE: 13-A Üretim temeli
