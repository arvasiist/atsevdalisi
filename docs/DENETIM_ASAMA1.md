# Aşama 1 — Depo Denetimi (15.10.2026)

Amaç: deponun her alanının **var olup olmadığını, ne işe yaradığını ve
uygulamada gerçekten kullanılıp kullanılmadığını** kanıtla belirlemek;
README / CLAUDE.md / diğer belgelerdeki tamamlanma iddialarını kod, API,
veritabanı ve test sonuçlarıyla karşılaştırmak. Varsayım yok: kanıtı olmayan
madde "doğrulanamadı" yazılır.

## 0. Yöntem ve kanıt kaynakları

| Araç / ölçüm | Ne kanıtlar |
|---|---|
| `git ls-files` (1.430 izlenen dosya) | Hangi dosyanın depoda olduğu |
| `knip@6.38.0` (bütün çalışma alanları) | Hiçbir giriş noktasından ulaşılmayan dosya, export, bağımlılık |
| Uç ↔ istemci eşlemesi (188 controller ucu × `apps/web/src`) | API ucunun oyunda gerçekten çağrılıp çağrılmadığı |
| `config/*.json` tarayıcısı (her yaprak anahtar × kaynak kod) | Ölü ayar (okunmayan config) adayları; adaylar elle doğrulandı |
| `npm run assets:check` | Manifestteki 3D/ses dosyalarının diskte olup olmadığı |
| Migration eşleşmesi (up/down, numara boşluğu) | Şema geçmişinin bütünlüğü |
| Tam API test paketi, **temiz** test DB (`at_sevdalisi_test`, şema düşürülüp yeniden kuruldu) | **228 dosya / 2.800 test geçti** (14.10.2026 22:50; S2 değişiklikleri dahil) |
| GitHub Actions geçmişi (339 koşu) | CI'ın neyi, hangi dalda koştuğu |
| Canlı oyun ölçümleri (`docs/OYUN_DONGUSU_DENETIMI.md`) | Oyun döngüsünün gerçek davranışı |

**Doğrulanamayanlar (bu ortamda):** GPU'lu tarayıcıda görsel kalite, Docker
imajları (yerelde Docker yok — CI'da derleniyor), gerçek üretim/staging
ortamı, dış sağlayıcılar (Google OAuth, Resend, ödeme, AI avatar). Web test
paketinin tamamı bu aşamada koşulmadı (yalnızca `race-entry.spec.ts` 25/25);
son tam web koşusu MASTER_STATUS'a göre 09.10.2026'da 643/643.

## 1. Alan alan envanter

| Alan | Dosya | Ne işe yarar | Gerçekten kullanılıyor mu (kanıt) | Bulgu |
|---|---:|---|---|---|
| `apps/api` | 780 | NestJS 11 sunucu: domain → application → infrastructure → api | Evet — 188 uç, 9 zamanlayıcı, 228 test dosyası geçiyor | 1 ölü araç (`apps/api/tools/race-balance-report.ts` elle koşulur, hiçbir betikte yok); 55 kullanılmayan export (çoğu yalnızca dosya içinde kullanılan sabit) |
| `apps/web` | 298 | Next 16 + React 19 + R3F 9 istemci, 29 sayfa | Evet — 188 ucun 180'i istemcide çağrılıyor | **3 ölü dosya:** `components/ui/ComingSoon.tsx`, `styles/theme.ts`, `features/player-demo/PlayerDemoWidget.tsx` (sonuncusu belgede "bilinçli") |
| `packages/shared-types` | 32 | İstemci + sunucu ortak tipleri, seed'li PRNG | Evet — her iki uygulama import ediyor; 1 test dosyası | — |
| `packages/game-config` | 5 | 41 config dosyasının tipli yükleyicileri | Evet — 41 yükleyicinin 41'i kaynak kodda çağrılıyor | — |
| `config/` | 41 | Oyun dengesi (JSON) | 41/41 dosya okunuyor | **Ölü ayarlar:** `care.config.json` → her işin `cost`u (`getCareActionCost` hiç çağrılmıyor; bakım ücretsiz); `staff.config.json` → `geneticist`/`farm_manager` maaş ve bonus satırları (bu roller işe alınamıyor) |
| `database/migrations` | 164 | 0001–0082 şema geçmişi | Evet — temiz DB'ye 82'si sırayla uygulandı, test paketi bunun üstünde geçti | 82/82 up+down çift, numara boşluğu yok |
| `database/seeds` | 1 | `001_dev_seed.sql` (geliştirme verisi) | Yalnızca elle (`npm run seed`); CI ve `yerel-baslat.cmd` çağırmıyor | Üretimde jokey arzının TEK kaynağı buydu → S1 ile giderildi |
| `assets/` | 12 | Ham kaynak çalışma alanı | Hayır — yalnızca `README.md` + 11 `.gitkeep` | İçerik yok (beklenen: büyük ikili dosyalar git'e girmez) |
| `apps/web/public` | 1 | Oyunun yüklediği nihai varlıklar | `hdri/golden-hour.hdr` kullanılıyor | **36 gerekli varlıktan 1'i var** (`assets:check`); at, jokey, hipodrom, start kapısı, kalabalık, ahır modelleri ve 30 ses dosyası yok → prosedürel/sessiz yedek |
| `tools/` | 17 | migrate, seed, ops (duman, yük, yedek), güvenlik kapısı, Blender, Windows betikleri | migrate/seed/ops/security CI'da veya npm betiklerinde kullanılıyor | `tools/generate-demo-race-timeline.ts` hiçbir betikte yok (elle); kök `assets:check` betiği `tsx` kullanıyor ama `tsx` kökte bağımlılık değil; `tools/migrate.ts`/`seed.ts` `pg`yi kökten değil `apps/api`den alıyor (yalnızca o çalışma alanından koşar) |
| `.github/workflows` | 1 | CI: build-and-test, security, docker | Evet — 339 koşu, son 8'i yeşil | **Yalnızca `main`e push ve `main`e PR'da tetiklenir** (bkz. §3 İ2) |
| `security/` | 1 | Bağımlılık açığı izin listesi | Evet — `audit-gate.mjs` okuyor | — |
| Kök dosyalar | 44 | Belgeler, compose, lint/format, lockfile | Evet | **22 scratch dosyası git'e kayıtlı** (bkz. §3 İ1); `ci.yml` başlık yorumu bayat ("`npm install` kullan" diyor, iş `npm ci` koşuyor) |
| `docs/` | 28 (+ kökte 5) | Mimari, tasarım, durum belgeleri | Okuma belgesi | Bkz. §2 |
| `research_notes/`, `reports/` | 6 | Rakip oyun araştırması (14.10.2026) | Plan belgesine (`OYUN_DONGUSU_DENETIMI.md`) girdi | Kaynak sayfalar açılamadı; rakamlar doğrulanmamış |

### 1.1 Oyunda karşılığı olmayan API uçları (188'den 8)

| Uç | Durum |
|---|---|
| `GET /health`, `GET /health/ready`, `GET /metrics`, `POST /payments/webhook/:provider` | Altyapı/sağlayıcı ucu — istemci çağırmaz (beklenen) |
| `POST /races/:id/settle` | Kesinleşme "crank"i; zamanlayıcı aynı use-case'i koşar (beklenen) |
| `GET /account/export` | Arayüz sahibinin isteğiyle kaldırıldı (belgeli) |
| **`GET /market/my-listings`** | **Eksik ekran:** satıcı yalnızca AKTİF ilanlar içinden kendisininkini görür; satılmış/süresi dolmuş ilan geçmişi oyuncuya hiç gösterilmez |
| `GET /avatar/ai/model` | AI avatar sağlayıcısı yok; modeli gösteren ekran da yok |

## 2. Belgeler

| Belge | Son değişiklik | Durum (kanıtla) |
|---|---|---|
| `README.md` | 14.10 | Faz tablosu kaldırılmış (iyi); teknoloji satırlarında yanlışlar var (§3 İ4–İ6) |
| `CLAUDE.md` | 14.10 | Kurallar büyük ölçüde koda uyuyor; teslimat, scratch ve "32/51" iddiaları yanlış (§3) |
| `MASTER_STATUS.md` | 14.10 (içerik 09.10) | Mimari/DB/zamanlayıcı iddiaları DOĞRU; sayılar bayat |
| `PROJE_DURUMU.md` | 10.10 | 283 KB tarihçe; 14.10 düzeltmelerini (86)–(87) içermiyor |
| `AUDIT_REPORT.md`, `docs/AUDIT_REPORT.md`, `docs/FINAL_PROJECT_AUDIT.md`, `docs/PROJECT_STATUS.md` | 09.10 | Başlarında "tarihli anlık görüntü" uyarısı VAR (CLAUDE.md iddiası doğru) |
| `docs/API.md` | 10.10 | **Referans olarak güvenilmez:** kodda olup belgede olmayan **48** uç (jokey, personel, çiftlik, mağaza, kontrollü yarış, kulüp yönetimi…), belgede olup kodda olmayan **25** "hayalet" uç (`/tournaments`, `/races/:id/claim-reward`, `/farm/staff`, `/breeding/options`…) |
| `docs/ROADMAP.md` | 27.09 | CLAUDE.md'ye göre bayat (doğru) |
| `docs/GAME_FLOW.md`, `GAME_DESIGN.md`, `ALGORITHMS.md`, `GENETICS.md`, `TESTING.md`, `CODING_CONVENTIONS.md`, `PROJECT_BRIEF.md`, `IMPLEMENTATION_PLAN_MASTER_BRIEF.md` | 25.09 | İlk günden beri değişmedi; tasarım hedefi olarak okunmalı, durum belgesi değil (§4) |
| `docs/DATABASE.md` | 27.09 | **Bayat:** anılan en son migration 0029 (82 var); migration'ların kurduğu tabloların **39'u** belgede hiç geçmiyor (`auth_sessions`, `notifications`, `friendships`, `market_bids`, `seasons`, `tournaments`, `payment_orders`, `interactive_races`…) |
| `docs/RACE_BALANCE_REPORT.md`, `ECONOMY*.md`, `WALLET_SYSTEM.md`, `SECURITY.md`, `DEPLOYMENT.md`, `VISUAL_REALISM_AUDIT.md`, `ASSET_*.md`, `FINAL_ACCEPTANCE.md` | 25.09–10.10 | **Bu aşamada satır satır doğrulanmadı.** Kesin olan: S1 (jokey pazarı) ve S2 (pratik yarış sınıfları) hiçbirinde yok; `ECONOMY.md` pratik yarış tablosu eski bot aralığına göre |

## 3. İddia ↔ gerçek

Karar: **DOĞRU** · **KISMEN** · **YANLIŞ** · **BAYAT** (eskiden doğruydu) · **ÇELİŞKİLİ** (belgeler birbirini tutmuyor).

| # | İddia | Kaynak | Gerçek (kanıt) | Karar |
|---|---|---|---|---|
| İ1 | Kökteki `*.bundle`, `*.bat`, `*-log.txt` "gitignore'lu scratch", "zararsız" | CLAUDE.md, MASTER_STATUS | **22 dosya git'e kayıtlı** (4 bundle = 6,3 MB, her klonda iniyor); 25.09.2026 `309c8ce` commit'iyle eklenmiş, gitignore kuralı sonradan geldiği için izlenmeye devam ediyor | YANLIŞ |
| İ2 | Teslimat: "commit → `git push origin main` → GitHub Actions CI" | CLAUDE.md | `origin/main` güncel işin **108 commit gerisinde** (`ea3ef28`, PR #1). İş PR #2 dalında yürüyor; CI yalnızca `main`e push/PR'da koşuyor → `fix/project-audit` dalındaki 3 commit (denetim düzeltmeleri + S1) **hiç CI'dan geçmedi** | YANLIŞ |
| İ3 | "51 özelliğin 32'si üretime hazır" | CLAUDE.md | `FINAL_PROJECT_AUDIT.md` §2 tablosunda 51'in **50'si** "Evet"; MASTER_STATUS "**hiçbiri** PRODUCTION_READY değil". Gerçek: üretim/staging ortamı yok → MASTER_STATUS doğru | ÇELİŞKİLİ |
| İ4 | "Redis — session, leaderboard, aktif yarış lobisi" | README | Redis yalnızca idempotency, hız sınırı ve Socket.IO köprüsünde; oturum (`auth_sessions`), sıralama, lobi ve eşleştirme kuyruğu Postgres'te | YANLIŞ |
| İ5 | "Test: Vitest / Jest" | README | Jest yok; yalnızca Vitest | KISMEN |
| İ6 | "Stat ≠ otomatik galibiyet — en yüksek rating her zaman kazanmaz" | README | Teknik olarak doğru ama ölçüm: favori `1/N`in 4,9–8 katı kazanıyor (`RACE_BALANCE_REPORT.md`); pratik yarışta güç +3 → beklenen kazanç −%11'den +%40'a | KISMEN |
| İ7 | "`tools/` — balance simülatörü" | README | Denge aracı `apps/api/tools/` + `test/domain/race/race-balance-harness.ts` | YANLIŞ (yer) |
| İ8 | "Test dosyaları: API 216 (97 e2e + 119 birim), web 71" | MASTER_STATUS | İzlenen: API **226** (102 e2e + 124 birim), web **85** | BAYAT |
| İ9 | "36 API modülü" | MASTER_STATUS | 37 (`cosmetics` listede yok) | BAYAT |
| İ10 | "82 migration, hepsi `down` dosyalı" | MASTER_STATUS | 82/82 çift, boşluk yok, temiz DB'ye uygulanıyor | DOĞRU |
| İ11 | "Defter değiştirilemez (DB tetikleyicisi)" | MASTER_STATUS | Migration 0038 | DOĞRU |
| İ12 | "Zamanlayıcıların hepsi lider kilidi arkasında" | MASTER_STATUS, CLAUDE.md (49) | 9 zamanlayıcının 9'u `runIfLeader` çağırıyor | DOĞRU |
| İ13 | Web rota listesi | MASTER_STATUS | 29 `page.tsx` listeyle birebir | DOĞRU |
| İ14 | "Gerçek 3D/ses varlığı yok" | CLAUDE.md | 36 gerekli varlıktan 1'i (HDRI) var | DOĞRU |
| İ15 | "`PlayerDemoWidget` bağlı değil (bilinçli)" | CLAUDE.md | Doğru; ayrıca `ComingSoon.tsx` ve `styles/theme.ts` de ölü (belgede yok) | KISMEN |
| İ16 | "Bakım ücretsiz" (CLAUDE.md (28)) + "ölü config bir tuzaktır, okunmayan alan ekleme" | CLAUDE.md | Bakım gerçekten ücretsiz, **ama** `care.config.json`daki `cost` alanları okunmuyor — belgenin kendi kuralını çiğneyen ölü ayar | KISMEN |
| İ17 | Pratik/kariyer döngüsü: "Yarış seç → **Jokey seç**" | GAME_FLOW §1/§3 | Üretimde kiralanacak jokey yoktu (yalnızca dev seed) → **S1 ile giderildi** (`jockey-market.e2e-spec.ts`), CI bekliyor | BAYAT→düzeltildi |
| İ18 | "Derece/ödül/XP/**itibar**" | GAME_FLOW §1 | `players.reputation` 0'da doğar ve **hiçbir kod değiştirmez**; yalnızca `/admin` tablosunda görünür | YANLIŞ |
| İ19 | Bildirim tetikleyicileri `HorseTrained`, `HorseFatigued`, `VetCheckRequired`, `ClubRaceEntered` | GAME_FLOW §6 | Bildirim türleri CHECK'inde (0080) hiçbiri yok | YANLIŞ |
| İ20 | "Yeni nesil atlar → efsane kan hattı" | GAME_FLOW §1/§4 | Yetiştirme var, ama yaş GERÇEK takvimle ilerliyor: tay **36 gerçek ay** sonra üreyebilir/prime olur; emeklilik ve ömür boyu üreme sınırı yok | KISMEN |
| İ21 | "Sezon reseti ilerlemeyi silmez" | GAME_FLOW §5 | Sezon skoru tutulmuyor, pencereden türetiliyor (`SeasonUseCase`) — davranış doğru, belgedeki `SeasonResetUseCase` adı yok | DOĞRU (farklı yöntem) |
| İ22 | Tarihli belgelerin başında uyarı var | CLAUDE.md | 4/4 belgede var | DOĞRU |
| İ23 | `ci.yml` başlık yorumu: "lock dosyası yok, `npm install` kullan" | ci.yml | `package-lock.json` var, iş `npm ci` koşuyor | BAYAT |
| İ24 | "Para yolu `FOR UPDATE` + aynı transaction'da defter" | CLAUDE.md kural 7 | `player-journey.e2e-spec.ts` bakiye = başlangıç + defter toplamı iddiasıyla geçiyor (228/228 dosya) | DOĞRU |
| İ25 | `git` PATH'te yok (Windows yolu), Docker yok | CLAUDE.md | Sahibinin Windows makinesine özgü; bu bulut ortamında `git` PATH'te | Ortama bağlı |

## 4. Oyun tasarımcısı gözüyle: çekirdek döngü gerçekte nerede

Profesyonel bir yönetim/yarış oyununda her adımın **bir girdisi, bir maliyeti
ve bir geri bildirimi** olmalıdır. Kanıtlı durum (ayrıntı: `docs/OYUN_DONGUSU_DENETIMI.md`):

| Döngü adımı | Sistem var mı | Oyunda anlamı var mı | Kanıt / not |
|---|---|---|---|
| At edinme (ücretsiz başlangıç, ırk mağazası, pazar, müzayede) | Evet | Evet | Para yolu testli |
| Antrenman | Evet | Evet (yorgunlukla sınırlı) | `train-spam.mjs`: 3 yoğun seansta `HORSE_TOO_TIRED` |
| Bakım / yem | Evet | **Zayıf** — bakım bedava, enerji hiçbir şeyle azalmıyor → yemin enerji etkisi boşa | B3, B6 |
| Jokey seçimi | Evet | **Üretimde arz yoktu** → S1 (yapıldı) | B4 |
| Yarış seçimi (pratik) | Evet | **Yeni oyuncu için para kaybı**: başlangıç atı 40 yarışta −3.400 → S2 (yapılıyor) | B1 |
| Yarışın ata maliyeti | **Yok** — yarış enerji/yorgunluk yazmıyor, sınırsız ardışık yarış | Karar yok | B2 → S3 |
| Ödül / XP | Evet | Evet | XP aynı transaction'da |
| İtibar | Sütun var | **Ölü** | İ18 |
| Yetiştirme → yeni nesil | Evet | **Döngü oyun ömründe kapanmıyor** (36 gerçek ay), emeklilik yok, damızlık ücretinde kesinti yok | B7, B10, B11 |
| İlk oturum yönlendirmesi | **Yok** | Oyuncu ne yapacağını bilmiyor | B9 |
| Az oyunculu çok oyunculu | Botlar + "bot payı yanar" | Az oyuncuda lobi beklentisi negatif | B8 |

## 5. Bu denetimden çıkan iş listesi (öncelik sırası)

1. **Teslimat hattı (İ2):** `fix/project-audit` dalındaki işin CI'dan geçmesi için PR (ya da PR #2 dalına birleştirme) — sahibinin onayı gerekir; ben PR açmadım.
2. **Kayıtlı scratch dosyaları (İ1):** 22 dosyayı izlemeden çıkar (`git rm --cached`; yerel kopyalar silinmez). Geçmişteki 6,3 MB bundle'ı temizlemek geçmişi yeniden yazmak demektir → ayrı karar.
3. **Oyun döngüsü:** S2 (yapılıyor) → S3 yarış yorgunluğu + toparlanma → itibarı bağla ya da kaldır (İ18) → S5 emeklilik/damızlık + yaş ölçeği kararı (İ20) → S6 ilk oturum yolu.
4. **Ölü öğeler:** `care.config` `cost` (bağla ya da kaldır — sahibinin kararı: bakım ücretli mi?), `ComingSoon.tsx`, `styles/theme.ts`, `generate-demo-race-timeline.ts`; `GET /market/my-listings` için "İlanlarım" ekranı.
5. **Belgeler:** README teknoloji satırları (İ4–İ7), MASTER_STATUS sayıları (İ8–İ9), CLAUDE.md teslimat + "32/51" (İ2–İ3), `ci.yml` yorumu (İ23), `docs/API.md`'nin 48 belgesiz + 25 hayalet ucu, GAME_FLOW bildirim listesi (İ19).
