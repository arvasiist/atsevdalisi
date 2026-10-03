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
VAR (02.10.2026): kişisel veri dışa aktarma (`GET /account/export`, KVKK/GDPR). YOK: Apple girişi. Üretim için `GOOGLE_OAUTH_CLIENT_ID`, `RESEND_API_KEY`, güçlü `JWT_SECRET` gerekir.

## Economy Status — TESTED (üretim değil)

Sunucu otoriteli; her hareket defterde (tür, tutar, önce/sonra bakiye,
referans). Idempotency: satın alma, hediye, para yatırma, bilet (anahtar);
yarış ödülü/iade/müzayede durum geçişiyle. Mutabakat e2e testi var.
**DÜZELTME (02.10.2026, Faz 13-A):** Faz 0 denetimi "mockDeposit üretimde
açık" demişti — YANLIŞTI: `MockPaymentProvider.isEnabled()` config bayrağı
VE `NODE_ENV !== 'production'` ister, yani üretimde sahte yatırma zaten
kapalıydı. Gerçek açık web'deydi: form istemci config'ine bakıyordu ve
üretimde de "Yükle" gösteriyordu; artık sunucunun `depositAvailable`
bayrağına bağlı. Elmas
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
Şüpheli desen listesi VAR (Faz 7: çoklu hesapla değer aktarma — yalnızca inceleme). Yük testi VAR (Faz 7: tek örnek ~350 istek/sn'de doyar, 200 eşzamanlı oyuncuda 0 hata; CI bütçe kapısı). Tek süreçli zamanlayıcılar yatay ölçeklemede çift çalışır
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

Roller `players.is_admin` + `is_moderator` (her istekte DB'den; izin tablosu
`domain/admin/staff.ts`), denetim günlüğü (aynı transaction): şikâyet kuyruğu,
oyuncu/yarış/işlem listeleri, yarış iptali (iade), **rol atama, askı/yasak +
kaldırma, duyurular** (Faz 10, 02.10.2026). `/admin` sekmeleri role göre.
YOK: at/pazar/kulüp/turnuva/sezon yönetimi, config yönetimi, IP alanı.

## Live Operations Status — PARTIAL

Zamanlayıcıyla açılan takvim yarışları, turnuvalar, sezon ve sezon ödülü,
günlük ödül, **duyurular** (Faz 11-A), **günlük/haftalık görevler + yönetimden
süreli etkinlik ve ödülü** (Faz 11-B). YOK: başarımlar, kulüp/sezon görevleri,
etkinlik para birimi.

## Observability Status — PARTIAL

VAR (02.10.2026, Faz 13-A): `GET /health` (canlılık) + `GET /health/ready`
(PostgreSQL + Redis, zaman aşımlı, 503); her yanıtta `X-Request-Id`, hata
zarfında `error.requestId`, beklenmeyen hata logu istek kimliğiyle (yığın
izi istemciye gitmez). YOK: yapılandırılmış (JSON) log, hata izleme
(Sentry vb.), metrik.
VAR (02.10.2026, Faz 13-C): üretimde tek satır JSON log, değiştirilebilir hata
raporlayıcı (varsayılan: log), web hata sınırları + `POST /client-errors`.
YOK: seçilmiş bir hata izleme hizmeti (Sentry vb.) ve metrik/uyarı.

## Deployment Status — PARTIAL

VAR (02.10.2026, Faz 13-A): `apps/api/Dockerfile` (runtime + `migrate`
hedefi, root olmayan kullanıcı, HEALTHCHECK), `apps/web/Dockerfile`,
`.dockerignore`, CI'da imaj build + "eksik ortamla açılmaz" duman testi,
üretim ortam doğrulaması (açılışta), `docs/DEPLOYMENT.md`. YOK: staging/
production ortamı, imaj kayıt defteri + dağıtım hattı, gizli anahtar
yöneticisi. VAR (Faz 13-C): `docker-compose.staging.yml` + uçtan uca duman
testi (CI'da), yedek/geri yükleme betikleri + CI provası.

## Security Status — PARTIAL (iyi temel)

Sunucu otoritesi, sahiplik kapıları, IDOR (403 önce 404 sonra), hız sınırı
(sosyal/para/yarış/müzayede), idempotency, değişmez defter, gizli statların
sızmaması, tohum gizliliği, helmet, CI'da bağımlılık kapısı (gerekçeli +
süreli izin listesi) ve gizli anahtar taraması (gitleaks, tüm geçmiş).
⚠️ **Next.js 14'te kritik açıklar** (bkz. Production Blockers 9). YOK: SAST,
anormal davranış tespiti, dosya
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

Apple girişi · AI avatar (tümü) ·
gerçek ödeme + elmas harcama yolu · gerçek 3D/ses varlıkları · sosyal hub/emote ·
kulüp sohbeti/yarışı · başarımlar · yönetim panelinin
geri kalanı (at/pazar/config/etkinlik) · gözlemlenebilirlik · dağıtım.

## Technical Debt

- Zamanlayıcılar API sürecinde (ayrı worker/kuyruk yok) — yatay ölçeklemede
  tekil çalışma kilidi (advisory lock / lider seçimi) gerekir.
- `in_progress` yarış durumu ölü (miras).
- `PlayerDemoWidget` bağlı değil (bilinçli, kaldırılabilir).
- `gemShopWhitelist` ölü config (okuyan kod yok).
- README/ROADMAP faz tabloları bayat.

## Production Blockers

1. Gerçek 3D/ses varlıkları (satın alınacak).
2. ~~`mockDeposit` üretimde açık~~ **YANLIŞ TESPİTTİ** (sunucu üretimde zaten kapalı); web formu artık sunucu bayrağına bağlı (Faz 13-A). Gerçek ödeme sağlayıcısı hâlâ yok.
3. ~~Oturum güvenliği: 30 günlük iptal edilemez JWT, logout/refresh yok.~~ **KAPANDI (02.10.2026, Faz 1-B.1).**
4. ~~E-posta doğrulama + hesap silme (KVKK/GDPR) yok.~~ **KAPANDI (02.10.2026, Faz 1-B.2/1-B.3)**; veri dışa aktarma hâlâ yok.
5. Gözlemlenebilirlik: sağlık + istek kimliği VAR (13-A); hata izleme/metrik/yapılandırılmış log YOK.
6. Dağıtım: Dockerfile + CI imaj build VAR (13-A); staging, kayıt defteri, gizli anahtar yöneticisi, yedek/geri yükleme YOK.
7. Kimlik bilgileri: `GOOGLE_OAUTH_CLIENT_ID`, `RESEND_API_KEY`.
8. AI avatar (brief zorunlu kılıyor) — sağlayıcı + depolama kararı.
9. ~~**Next.js 14 kritik/yüksek açıklar** (GHSA-2xp9-vwfh-vxw4 ve GHSA-p293-qw3h-jr36 uzaktan kod
   çalıştırma, SSRF, DoS) + `@nestjs/platform-express`/multer DoS — düzeltme yalnızca büyük sürüm
   (Next 16). `security/audit-allowlist.json` 2026-11-01'de sona erer → o tarihten sonra CI
   kırılır. **Nest/multer kısmı KAPANDI** (Faz 13-B.1: Nest 11.2.7, multer 2.4.0); kalan Next 16 (13-B.2).

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
| 1 Core | TESTED — oyun çekirdeği + oturum + e-posta doğrulama + hesap silme + veri dışa aktarma; Apple girişi yok (kimlik bilgisi) |
| 2 Management | TESTED |
| 3 Genetics | TESTED |
| 4 Farm | TESTED |
| 5 Advanced Race | TESTED (kulvar etkisi hariç — karar bekliyor) |
| 6 3D/Presentation | PARTIAL — kod tam, gerçek varlık yok |
| 7 Online | TESTED — anti-cheat inceleme listesi + yük testi (CI bütçe kapısı) |
| 8 AI Avatar | NOT_STARTED |
| 9 Social | PARTIAL — hub/emote/kulüp sohbeti yok |
| 10 Admin | PARTIAL — roller + yaptırım + duyuru TESTED; at/pazar/config yönetimi yok |
| 11 Live Ops | TESTED — duyurular (11-A) + görevler/etkinlikler (11-B); başarımlar yok |
| 12 Monetization | NOT_STARTED (yalnızca sahte yatırma) |
| 13 Production | PARTIAL — 13-A temel (sağlık, istek kimliği, ortam kapısı, taramalar, Dockerfile) TESTED; 13-B çerçeve yükseltmesi + staging/izleme yok |
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

---

PHASE: 13-A — Üretim temeli
STATUS: TESTED (Docker imajları yalnızca CI'da derlenir — yerelde Docker daemon yok)
COMPLETED: Üretim ortam kapısı (eksik/zayıf ortamda açılmaz); `/health/ready`
(DB + Redis); istek kimliği (başlık + hata zarfı + log); cüzdan formu sunucu
bayrağına bağlı; CI bağımlılık kapısı + gitleaks; API/web Dockerfile + CI build
+ duman testi; `images.unoptimized` (savunma katmanı); `docs/DEPLOYMENT.md`.
FILES CREATED: config/ops.config.json · infrastructure/ops/production-env.ts ·
api/middleware/request-id.middleware.ts · tools/security/audit-gate.mjs ·
security/audit-allowlist.json · .gitleaksignore · .dockerignore ·
apps/api/Dockerfile · apps/web/Dockerfile · docs/DEPLOYMENT.md ·
test/security/production-env.spec.ts · test/api/ops.e2e-spec.ts
FILES MODIFIED: main.ts · app.module.ts · health.controller · http-exception.filter ·
get-wallet use-case + wallet repo/port · game-config (loadOpsConfig) · shared-types
(WalletView.depositAvailable) · web wallet sayfası + next.config.mjs · ci.yml ·
apps/api/.env.example · belgeler
DATABASE CHANGES: —
API CHANGES: GET /health/ready; tüm yanıtlarda X-Request-Id; hata zarfında error.requestId;
GET /players/:id/wallet → depositAvailable
FRONTEND CHANGES: yatırma formu yalnızca sunucu izin verirse
BACKEND CHANGES: açılış ortam doğrulaması, istek kimliği ara katmanı
GAMEPLAY CHANGES: —
3D CHANGES: —
AI CHANGES: —
SECURITY CHANGES: zayıf/eksik gizli değerle açılmama; DISABLE_RATE_LIMIT üretimde yasak;
istek kimliği güvenli karakterle sınırlı (log enjeksiyonu yok); bağımlılık + gizli anahtar taraması
ADMIN CHANGES: —
DEPLOYMENT CHANGES: Dockerfile'lar, migrate hedefi, HEALTHCHECK, CI imaj build
TESTS ADDED: production-env.spec.ts (16), ops.e2e-spec.ts (6, Redis düşük senaryosu dahil)
TESTS PASSED: API 161 dosya / 2383 (temiz şema), web 43 / 524; derlenmiş sunucu üretim modunda
eksik ortamla çıkış 1, tam ortamla /health/ready 200; audit kapısı yeni açıkla 1 döner (negatif deneme)
TESTS FAILED: 0
BUGS FOUND: web yatırma formu üretimde de görünüyordu; Faz 0 "mockDeposit üretimde açık" tespiti yanlıştı
BUGS FIXED: ikisi de
TECHNICAL DEBT: `images.unoptimized` etkisi yerelde gösterilemedi (uç her iki ayarda 404) —
asıl çözüm Next yükseltmesi
PRODUCTION BLOCKERS: Next 14 kritik açıklar (yeni, 9. madde) — Faz 13-B
REMAINING: 13-B çerçeve yükseltmesi (Next 16 + React 19, Nest 12), staging, hata izleme, yedek provası
NEXT PHASE: 13-B Next/Nest yükseltmesi (izin listesi 2026-11-01'de biter)

---

PHASE: 13-B.1 — Nest 10 → 11 (multer/express açıkları)
STATUS: TESTED
COMPLETED: @nestjs/* 11.2.7 (express 5.2.1, multer 2.4.0); multer'in 8 yüksek
danışmanı kapandı ve izin listesinden çıkarıldı (kalan 12 kayıt: Next 14 + postcss).
Nest 12 GEREKMEDİ: açık aralığı `<=11.1.14`; 11.2.7 güvenli.
FILES MODIFIED: apps/api/package.json, package-lock.json, app.module.ts (`'{*path}'` —
Express 5 adlandırılmış joker; `'*'` başlangıçta uyarı veriyordu),
security/audit-allowlist.json, .github/workflows/ci.yml (gitleaks teşhisi),
test/api/interactive-race.e2e-spec.ts
DATABASE CHANGES: —
API CHANGES: — (sorgu parametreleri düz `@Query('x')`; Express 5'in basit ayrıştırıcısı aynı sonucu verir)
SECURITY CHANGES: 8 yüksek multer DoS danışmanı kapandı
TESTS PASSED: API 161 dosya / 2383 (temiz şema; bir test kendi iddia hatası — aşağıda);
derlenmiş sunucu Nest 11 ile açılıyor, /health/ready 200, X-Request-Id 404/401'de var, rota uyarısı yok
BUGS FOUND: (1) `interactive-race` testine dün koyduğum üst sınır YANLIŞTI: sunucu komutu
`commandSafetyMs` İLERİSİNE yazar; doğru değişmez "yanıt anında gösterilmiş segmente düşmez".
(2) f6df133 CI'ında gitleaks adımı düştü; yerelde (tüm dallar + PR birleştirme simülasyonu)
yeniden üretilemedi, log'a erişim yok → adım ayrıldı ve bulgular annotation olarak yazılıyor.
BUGS FIXED: (1) düzeltildi, 3 ardışık koşu yeşil. (2) teşhis bekliyor.
REMAINING: 13-B.2 Next 16 + React 19 + R3F 9 / drei 10
NEXT PHASE: 13-B.2

---

PHASE: 13-B.2 — Next 14 → 16 + React 19 + R3F 9 / drei 10 / postprocessing 3
STATUS: TESTED
COMPLETED: next 16.3.8, react/react-dom 19, @react-three/fiber 9.8, drei 10.7,
postprocessing 3.1. Yüksek/kritik bağımlılık açığı: 0 (izin listesi BOŞ).
Dinamik sayfalar `useParams()`, rota işleyici `await params` (Next 15+ Promise).
Kökte eski React 18 kalıyordu (iki React → kırık JSX tipleri ve çalışma anında
çift React riski): kök `overrides` + kilit dosyasından React girişleri ayıklandı → tek React 19.
FILES MODIFIED: apps/web/package.json, package.json (overrides), package-lock.json,
apps/web/next-env.d.ts (Next 16 üretir), replays/[raceId] + races/[raceId]/watch sayfaları,
pwa-icon rota işleyicisi, next.config.mjs (yorum), security/audit-allowlist.json (boş),
apps/api/Dockerfile + apps/web/Dockerfile (çalışma alanı node_modules), .gitleaks.toml, ci.yml
BUGS FOUND: (1) API imajı Nest 11 ile açılmıyordu: Dockerfile yalnızca kök node_modules'u
kopyalıyordu, express 5/Nest 11 apps/api/node_modules'teydi (`Cannot find module '@nestjs/core'`,
yerelde birebir yeniden üretildi). (2) gitleaks: aynı yanlış pozitifler CI'ın çektiği başka
commit'lerde (parmak izi tutmaz). İlk istisna denemesi (yol + AND) bu sürümde bütün dosyayı
muaf tutuyordu — gerçek bir anahtarı gizledi; satır desenine daraltıldı ve sentetik depoda
kanıtlandı.
BUGS FIXED: ikisi de
TESTS PASSED: web 43 / 524, next build, API 161 / 2383 (temiz şema), tarayıcıda ana sayfa/ahır/
kontrollü yarış 3D sahneleri + 6 sayfa: sayfa hatası 0; yalnızca beklenen eksik-varlık HEAD 404'leri
PRODUCTION BLOCKERS: 9. madde (Next 14 açıkları) KAPANDI
REMAINING: staging, hata izleme, yedek provası (13-C)

---

PHASE: 13-C — Yedek provası + staging yığını + hata izleme temeli
STATUS: TESTED (staging yığını yalnızca CI'da kapsayıcılarla koşar; yerelde aynı
süreçlerle — derlenmiş API üretim modu + next start — duman testi geçti)
COMPLETED: db-backup / db-restore (boş olmayan hedefi reddeder) / backup-drill +
db-fingerprint; CI'da test verisiyle prova. docker-compose.staging.yml +
.env.staging.example + tools/ops/smoke.mjs; CI'da yığın + duman testi. Üretimde JSON
log (JsonLogger), ErrorReporter (varsayılan log; Sentry takılabilir), filtre 500'ü
raporlar, POST /client-errors, web error.tsx + global-error.tsx.
FILES CREATED: tools/ops/{db-backup.sh,db-restore.sh,backup-drill.sh,db-fingerprint.mjs,smoke.mjs} ·
docker-compose.staging.yml · .env.staging.example · infrastructure/ops/{structured-log,error-reporting}.ts ·
api/ops/{client-errors.controller,ops.module}.ts · web app/error.tsx, app/global-error.tsx,
features/errors/error-report.ts · testler (aşağıda)
FILES MODIFIED: main.ts · app.module.ts · http-exception.filter · config/ops.config.json
(+clientErrors) · game-config types · web api-client · ci.yml · .gitignore (.env.staging) ·
docs/DEPLOYMENT.md
DATABASE CHANGES: —
API CHANGES: POST /client-errors (202; mesajsız 400)
SECURITY CHANGES: rapora sorgu dizesi girmez (token olabilir); istemciye yığın izi yok;
raporlayıcı hatası isteği düşürmez; .env.staging gitignore
DEPLOYMENT CHANGES: staging compose, duman testi, yedek/geri yükleme betikleri
TESTS ADDED: test/security/error-reporting.spec.ts (3), test/api/client-errors.e2e-spec.ts (2),
web test/features/errors/error-report.spec.ts (3)
TESTS PASSED: API 163 / 2388 (temiz şema), web 44 / 527, next build; yedek provası test verisiyle
(48 tablo, 615 defter satırı); negatif: dolu hedef reddedildi, +1 bakiye farkı yakalandı;
duman testi 6/6 (üretim modu)
TESTS FAILED: 0
PRODUCTION BLOCKERS: sağlayıcı kararları: barındırma, imaj kayıt defteri, gizli anahtar
yöneticisi, hata izleme hizmeti, zamanlanmış yedek/saklama süresi
REMAINING: sahibinin sağlayıcı kararları; kalan fazlar (8 AI avatar, 10/11 admin+live ops, 12 ödeme)
NEXT PHASE: sahibinin kararına bağlı

---

PHASE: 10 + 11-A — Roller, yaptırımlar, duyurular
STATUS: TESTED
SUMMARY: Moderatör rolü + izin tablosu; askı (süreli) / yasak (süresiz) + kaldırma; rol
atama; duyurular (yönetimden açılır, herkes görür). Askı oturum kapısında (istek, soket,
giriş, yenileme → 403 ACCOUNT_SUSPENDED); yasak oturumları kapatır. Her yazma denetim
kaydıyla aynı transaction'da.
FILES CREATED: migration 0060 · config/moderation.config.json · domain/admin/staff.ts ·
ports/moderation.repository.ts · infrastructure/admin/postgres-moderation.repository.ts ·
use-cases/moderation.use-case.ts · api/admin/moderation.controller.ts · web
features/admin/{PlayerModerationPanel,AnnouncementsAdmin,moderation-labels} ·
features/announcements/{AnnouncementStrip,announcement-logic} · testler
FILES MODIFIED: auth-session (use-case/repo/domain) · admin repo + 3 use-case (moderatör izni) ·
player tipi/mapper (isModerator) · http-exception.filter · shared-types · game-config ·
web admin/page, layout, TopBar, api-client, player-context, session-logic, globals.css
DATABASE CHANGES: 0060 — players.is_moderator, player_sanctions, announcements (yalnızca ekleme)
API CHANGES: POST/GET /admin/players/:id/sanctions · POST /admin/sanctions/:id/lift ·
PUT /admin/players/:id/role · POST/GET /admin/announcements · POST
/admin/announcements/:id/archive · GET /announcements (@Public) · GET /admin/players
+isModerator/activeSanction · PlayerSummary.isModerator
SECURITY CHANGES: yetki her istekte DB'den, 403 önce 404 sonra; kendine rol/yaptırım yasak;
personele yaptırım yasak; moderatör yasak/uzun askı veremez; askı 401 değil 403 (oturum kaybolmaz)
TESTS ADDED: test/api/staff-moderation.e2e-spec.ts (8), web announcement-logic (3),
moderation-labels + isAccountSuspended (3), player-context askı (1), api-client rotaları (1)
TESTS PASSED: API 164 / 2398 (temiz şema), web 46 / 535, next build, lint 0 hata; tarayıcı:
duyuru yayınlandı → şeritte göründü, askı uygulandı → oyuncu mesajı gördü, oturum kaldı
TESTS FAILED: 0
PRODUCTION BLOCKERS: değişmedi
REMAINING: 11-B etkinlikler, at/pazar/config yönetimi, anormal davranış tespiti
NEXT PHASE: sahibinin kararı (8 AI avatar / 12 ödeme sağlayıcı bekliyor; kodla yapılabilen: 11-B)

---

PHASE: 11-B — Günlük/haftalık görevler + yönetimden etkinlik
STATUS: TESTED
SUMMARY: Brief §68 görevleri (Bugün: 2 antrenman, 1 yarış, 1 bakım; Bu hafta: 5 yarış,
1 galibiyet, 1 at alımı) config'ten; ilerleme mevcut tablolardan türetilir. Yönetici süreli
etkinlik açar (ölçüt × adet × para ödülü). Ödül talebi para yolu, tek seferlik.
FILES CREATED: migration 0061 · config/quests.config.json · shared-types quests.ts ·
domain/quests/{quests,errors}.ts · ports/quest.repository.ts · infrastructure/quests/
postgres-quest.repository.ts · use-cases/quest.use-case.ts · api/quests/{controller,module} ·
web app/quests/page.tsx, features/quests/quest-labels.ts, features/admin/LiveEventsAdmin.tsx · testler
FILES MODIFIED: app.module · http-exception.filter · staff.ts (events.manage) · economy.ts
(quest_reward, event_reward) · error-codes · game-config · web api-client, nav-links/icons,
admin/page, moderation-labels, ledger-labels, globals.css
DATABASE CHANGES: 0061 — live_events, quest_claims (yalnızca ekleme)
API CHANGES: GET /quests · POST /quests/:key/claim · POST /events/:id/claim ·
POST/GET /admin/events · POST /admin/events/:id/archive
SECURITY CHANGES: ilerleme/ödül istemciden alınmaz; talep kilit altında yeniden sayar;
tekil talep kısıtı çift ödemeyi keser (eşzamanlı 4 talep → 1 ödeme, testli); yönetim yetkisi
DB'den, 403 önce 404 sonra; asgari alım fiyatı 0 TL el değiştirmeyle görev tamamlatmaz
TESTS ADDED: test/domain/quests/quests.spec.ts (18), test/api/quests.e2e-spec.ts (11),
web quest-labels (4) + api-client rotaları (1)
TESTS PASSED: API 166 / 2429 (temiz şema), web 47 / 540, next build, lint 0 hata; tarayıcı:
etkinlik açıldı → bakım → görev + etkinlik ödülü alındı (+850, defter iki satır)
TESTS FAILED: 0
PRODUCTION BLOCKERS: değişmedi
REMAINING: başarımlar, kulüp/sezon görevleri, at/pazar/config yönetimi
NEXT PHASE: sahibinin kararı (8 AI avatar / 12 ödeme sağlayıcı bekliyor)

---

PHASE: 1 (kalan) — Kişisel veri dışa aktarma
STATUS: TESTED
SUMMARY: GET /account/export → hesap, giriş yöntemleri, oturumlar, atlar, para hareketleri,
yarışlar, mesajlar, arkadaşlıklar, engeller, yaptığım şikâyetler, hediyeler, bildirimler,
kulüp, yaptırımlar, görev ödülleri. Web: /account "Verilerimi indir" (JSON dosyası).
FILES CREATED: ports/account-export.repository.ts · infrastructure/account/postgres-account-export.repository.ts ·
use-cases/export-account-data.use-case.ts · web features/auth/{ExportDataPanel.tsx,data-export.ts} · testler
FILES MODIFIED: account.controller · auth.module · auth.config.json (dataExport) · game-config ·
shared-types player.ts · web api-client, account/page
DATABASE CHANGES: —
API CHANGES: GET /account/export (3/saat, Cache-Control: no-store)
SECURITY CHANGES: sütunlar açıkça seçilir; özetler, başka oyuncu kimlikleri, şikâyetçi ve
yaptırımı veren yönetici yanıta girmez (e2e ham JSON'da arar); silinmiş hesap dışa aktarılmaz
TESTS ADDED: test/api/account-export.e2e-spec.ts (4), web data-export (2)
TESTS PASSED: e2e 4/4, web 48 / 542; tarayıcı: indirilen dosya 15 bölüm
TESTS FAILED: 0
REMAINING: Apple girişi (sahibinin kimlik bilgisi)
NEXT PHASE: Faz 5 — start kulvarı etkisi (motor; sahibinin kararı gerekir)

---

PHASE: 7 (kalan) — Anti-cheat: şüpheli desenler
STATUS: TESTED
SUMMARY: Sunucu otoriter (istemci sonuç/para belirleyemez); kalan risk çoklu hesapla değer
aktarma. Üç desen yönetime inceleme listesi olarak: hediye hunisi, tekrarlayan alım-satım
çifti, yeni hesaptan para çıkışı. Otomatik ceza yok.
FILES CREATED: config/anticheat.config.json · domain/anticheat/anomaly.ts · ports/anomaly.repository.ts ·
infrastructure/anticheat/postgres-anomaly.repository.ts · use-cases/list-anomalies.use-case.ts ·
web features/admin/AnomaliesAdmin.tsx · testler
FILES MODIFIED: staff.ts (anomalies.view: moderatör + yönetici) · moderation.controller · admin.module ·
shared-types admin.ts · game-config · web api-client, admin/page, moderation-labels
DATABASE CHANGES: —
API CHANGES: GET /admin/anomalies
SECURITY CHANGES: yetki DB'den, 403 önce; uç salt okur (testle kilitli)
TESTS ADDED: test/api/anomalies.e2e-spec.ts (4), test/domain/anticheat/anomaly.spec.ts (3)
TESTS PASSED: 7/7, web 48 / 542; tarayıcı: moderatör sekmeleri Şikâyetler/Oyuncular/Şüpheli, bulgular listelendi
TESTS FAILED: 0
REMAINING: Faz 7 yük testi; IP/cihaz sinyali (kişisel veri kararı)
NEXT PHASE: Faz 7 — yük testi

---

PHASE: 7 (kalan) — Yük testi
STATUS: TESTED
SUMMARY: Bağımlılıksız yük aracı + CI bütçe kapısı. Tek API örneği ~350 istek/sn'de doyuyor
(CPU tek çekirdek, yarış motoru); 200 eşzamanlı oyuncuda bile hata yok, yalnızca gecikme artıyor.
FILES CREATED: tools/ops/load-test.mjs
FILES MODIFIED: config/ops.config.json (loadTest) · game-config types · .github/workflows/ci.yml · docs/DEPLOYMENT.md
DATABASE CHANGES: —
API CHANGES: —
SECURITY CHANGES: araç yerel olmayan hedefe yalnızca --allow-remote ile gider
TESTS ADDED: CI "Load test (budget gate)" adımı
TESTS PASSED: yerel 25 oyuncu p95 395 ms / 0 hata; 100 ve 200 oyuncu 0 hata (p95 1266 / 2163 ms — bütçe dışı, bilgi amaçlı)
TESTS FAILED: 0
PRODUCTION BLOCKERS: yatay ölçek için zamanlayıcı lider kilidi (Faz 13)
REMAINING: Faz 7 tamam (yük kapasitesi gerçek sunucuda yeniden ölçülmeli)
NEXT PHASE: Faz 9 — Sosyal (emote, sosyal hub, kulüp sohbeti)
