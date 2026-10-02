# PROJE_DURUMU.md — At Sevdalısı: Kendi Kullanımım İçin Proje Kavrayışı

> **Bu dosya kimin için?** Bu, proje sahibi için bir tanıtım belgesi DEĞİL.
> Bu, **benim** (Claude'un) her yeni oturumun başında okuyup "biz ne yapıyoruz,
> nerede kaldık, neye dokunmam yasak" diye hatırlaması için yazdığım
> yönelim/orientation dosyasıdır. Proje sahibinin belgeleri `docs/` altındadır;
> burası onların yerine geçmez, üstüne bir "işletim kılavuzu"dur.
>
> **Yazım tarihi:** 2026-09-27 · **Analiz edilen HEAD:** yerel `main`, temiz çalışma alanı
> **Son güncelleme notu:** Bu dosya oluşturulduğunda repoda commit YAPILMAMIŞTIR
> (bilinçli — sahibi istemeden commit atmam; bkz. §9 "Teslimat mekanizması").

---

## 1. Proje nedir — tek paragrafta

**AT SEVDALISI**, tarayıcıda çalışan bir **3D at yarışı + at sahipliği/yetiştiricilik
simülasyonu + ekonomi yönetimi oyunudur.** Oyuncu bir "seyis" (ahır sahibi) olarak
başlar; at yetiştirir, antrenman yaptırır, bakar, yarışlara sokar, pazar yerinde
alım-satım yapar, yavru üretir (genetik), ahırını geliştirir, çevrimiçi rakiplerle
eşleşip yarışır ve sıralamada yükselmeye çalışır.

**Duygusal fantezi:** "Benim atım, benim emeğim, benim ahırım." Yani sadece yarış
kazanma değil; **bir canlıya bakma, onu geliştirme, soyunu sürdürme ve bunun
ekonomik karşılığını yönetme** hissi. Yarış, bu emeğin sınav anıdır.

**Oyun döngüsü (kısa):** Giriş → Günlük ödül → Atın durumunu kontrol (enerji/
yorgunluk/sağlık) → Antrenman → Besleme/Bakım → Yarış seç → Jokey seç → Taktik seç →
**YARIŞ** → Sonuç → Ödül → At gelişimi → Pazar → Görevler → Online → Çıkış.

---

## 2. Köken ve pivot — neden mimari böyle

Proje ilk olarak **Unity + C# istemci + ASP.NET Core backend** olarak brief edilmişti.
Proje sahibi sonradan **web tabanlı, responsive, mobil dostu** bir yapıya pivot etti.
`docs/PROJECT_BRIEF.md` içindeki Unity/C# referansları **tarihsel** olarak korunmuştur;
güncel karşılıkları `docs/ARCHITECTURE.md` §2'deki eşleme tablosundadır:

| Brief'teki (eski) | Bugünkü karşılığı |
|---|---|
| Unity (istemci) | Next.js 14 (React + TypeScript) |
| Unity 3D render | Three.js (`@react-three/fiber` + `drei`) |
| ASP.NET Core | NestJS 10 |
| PostgreSQL | PostgreSQL (aynı) |
| Redis | Redis (aynı) |
| REST + WebSocket | REST + Socket.IO (`@nestjs/platform-socket.io`) |
| C# | TypeScript (her yerde) |

**Bu tabloyu bilmek önemli:** `PROJECT_BRIEF.md`'de "Unity'de şöyle yapılacak" yazan
bir cümle gördüğümde onu harfiyen uygulamaya kalkmamalıyım — ARCHITECTURE.md'deki
karşılığına bakmalıyım.

---

## 3. Depo yapısı (monorepo)

```
at-sevdalisi/
├── apps/
│   ├── api/          NestJS backend (213 .ts src + 61 test)
│   └── web/          Next.js 14 frontend (App Router, 55 src dosyası)
├── packages/
│   ├── shared-types/ Bağımlılıksız saf TS tipleri + tipli hata kodları
│   └── game-config/  config/*.config.json dosyalarını yükleyen 16 load*Config()
├── config/           16 adet JSON oyun dengesi dosyası (race, economy, ...)
├── database/
│   ├── migrations/   28 çift (0001–0028) .up.sql / .down.sql
│   └── seeds/        dev seed SQL
├── docs/             19 belge (aşağıda §11'de haritası)
├── tools/            migrate.ts, seed.ts, generate-demo-race-timeline.ts
├── assets/           HAM 3D/ses kaynak çalışma alanı (git'e girmez, §8.3)
├── .github/workflows/ci.yml
└── (kök) *.bat, *.bundle, outputs/  → gitignore'lu teslimat scratch dosyaları
```

**npm workspaces** (`packages/*`, `apps/*`), **Node >= 20**, kök `package.json` tüm
komutları (`dev:api`, `dev:web`, `migrate`, `seed`, `test`, `lint`, `typecheck`, `build`)
tek yerden sürer.

---

## 4. Mimari — değişmez kurallar

### 4.1 Katman yönü (TEK YÖNLÜ, ihlal edilemez)

```
Domain  →  Application  →  Infrastructure  →  API
(saf TS)   (use-case+port)   (Postgres/Redis)   (controller/DTO)
```

- **`domain/`**: Framework'süz saf TypeScript. **NestJS importu YOK, ORM importu YOK,
  I/O YOK.** Sadece fonksiyonlar + hata sınıfları. Buraya `@Injectable()` koymam.
- **`application/`**: Use-case'ler (`*.use-case.ts`) + port arayüzleri
  (`application/ports/*.repository.ts`, her biri bir `Symbol` DI token'ı ile).
  Use-case yalnızca **port'lara** ve `AppConfigService`'e bağımlıdır; **asla doğrudan
  I/O yapmaz**.
- **`infrastructure/`**: `pg` (ham SQL, **ORM yok**) ve `ioredis` implementasyonları,
  config servisi, JWT servisi, Google/Apple doğrulayıcı.
- **`api/`**: Controller'lar, DTO'lar, guard'lar, interceptor'lar, exception filter,
  Socket.IO gateway.

### 4.2 SUNUCU OTORİTESİ (en tepedeki kural)

> **İstemci asla yarış sonucunu, parayı, istatistiği, ödülü veya envanteri BELİRLEMEZ.**

`docs/SECURITY.md` §1 bunu "tek mutlak kural" olarak tanımlar. Yarış simülasyonu
**yalnızca sunucuda**, `domain/race/race-engine.ts` içinde koşar. İstemci sonucu
sadece **render eder**. `docs/ARCHITECTURE.md` §3'teki kritik kural budur — Race
Engine'e dokunan hiçbir değişiklikte bu çizgiyi geçmem.

### 4.3 Determinizm (Race Engine'in kalbi)

> **Aynı seed + aynı snapshot + aynı config = BİT BİT AYNI sonuç.**

- Seeded PRNG: `packages/shared-types` içindeki `createSeededRandom`.
- **`Math.random()` Race Engine'de ASLA kullanılmaz.** (Grep ile doğrulanabilir.)
- İsim-uzaylı türetim: `deriveRandom(seed, horseId, segmentIndex, purpose)` — örneğin
  `:gate-draw` ayrı bir isim uzayıdır ki start kapısı çekilişi motor dengesini
  etkilemesin.
- Sürüm sabitleri: `RACE_ENGINE_VERSION`, `RACE_RULESET_VERSION`.
- Determinizm, **replay**'in temelidir: `RaceSeed + RaceConfig(version) +
  HorseSnapshots + PlayerTactics` → yarış yeniden üretilebilir.

### 4.4 Sihirli sayı yok

Tüm denge parametreleri `config/*.config.json` içindedir ve
`packages/game-config` üzerinden `load*Config()` ile okunur. ESLint
`@typescript-eslint/no-magic-numbers` kuralı (warn) bunu zorlar. Yeni bir sabit
eklerken **önce config dosyasına** koyarım.

### 4.5 Katmanlı doğrulama (3 savunma hattı)

1. **DTO** (`class-validator`) — `ValidationPipe({ whitelist: true,
   forbidNonWhitelisted: true, transform: true })`.
2. **Application** — use-case içinde iş kuralı kontrolleri.
3. **Veritabanı** — `CHECK` constraint'leri (ör. `economy_transactions`:
   `balance_after = balance_before + amount`).

### 4.6 İşlem (transaction) ve satır kilidi

- `withTransaction(pool, fn)` — `infrastructure/database/database.module.ts`;
  `MAX_TRANSACTION_ATTEMPTS = 3`, geçici hata (ECONNRESET/57P01 vb.) yeniden deneme.
- `SELECT ... FOR UPDATE` — para/mutasyon yollarının **tamamında**:
  `PlayerRepository.updateWithLock`, `updateTwoWithLock` (lexicographic id sırası →
  deadlock önleme), `HorseRepository.updateWithLock`.
- **Ekonomi defteri** (`economy_transactions`, migration 0019) cüzdan mutasyonuyla
  **aynı transaction'da** yazılır. Tek başına bakiye güncelleyen kod yazmam.

### 4.7 Idempotency — iki katman

`Idempotency-Key` header'ı zorunlu (interceptor `IdempotencyKeyRequiredError` fırlatır):

1. **Redis ön kontrolü** (hızlı yol) — `idempotency:{scopeId}:{key}`.
2. **PostgreSQL `idempotency_keys`** — `INSERT ... ON CONFLICT DO NOTHING` ile
   **gerçek rezervasyon kilidi**. Yarışı kaybeden `409 IDEMPOTENCY_KEY_IN_PROGRESS`
   alır. Başarıda `completed` + Redis'e cache; hatada `pending` satır silinir.

Kapsam `@IdempotencyScope('player')` ile belirlenir.

### 4.8 Kimlik doğrulama ve sahiplik

- Global `AuthGuard` (`APP_GUARD`) — `@Public()` işaretli olmayan **her** rota JWT ister.
- `request.player = { id: payload.sub }`.
- Sahiplik guard'ları: `HorseOwnerGuardByParam/ByBodyField/ByQueryField`,
  `ListingOwnerGuard`, `assertSelf()` → **IDOR koruması** (denetim bulgusu S2/S3/S4).
- `RateLimitGuard` (APP_GUARD, `@RateLimit(...)` varsa devreye girer; Redis sabit
  pencere `INCR`+`EXPIRE`; `DISABLE_RATE_LIMIT='true'` bypass).
  ⚠️ **Modül sırası yük taşır:** `RateLimitModule`, `AuthModule`'den SONRA gelmeli —
  çünkü `keyBy: 'player'` `request.player.id`'yi okur ve Nest `APP_GUARD`'ları modül
  dizisi sırasına göre çalıştırır.

---

## 5. Gerçek durum — nerede kaldık (belgelerin söylediğinden farklı!)

> ⚠️ **`README.md` ve `docs/ROADMAP.md`'nin en üstündeki faz tablosu BAYAT.**
> Orada "FAZ 1-7 Planlandı" yazar; gerçek çok daha ileride. Gerçeği
> `docs/ROADMAP.md`'nin **wiring slice günlüğü** ve kök `AUDIT_REPORT.md`'nin
> **düzeltme özet tablosu** verir. Aşağısı o ikisinden çıkarılmıştır.

### 5.1 Domain katmanı: FAZ 0–7 için TAMAM

19 domain modülü, 68 dosya, saf fonksiyon + config tabanlı, hepsinin spec'i var.
Şu modüllerin **domain mantığı yazılmış ve test edilmiş**: horse, race, training,
care, economy, market, breeding/genetics, online (elo/matchmaking/anti-cheat),
farm, jockey, club, equipment, stable, staff, tournament, ranking, season,
progression, player, auth.

### 5.2 API wiring: 15 dilim, hepsi CI ile doğrulanmış

`docs/ROADMAP.md` "FAZ 1 wiring" bölümü — küçük dilim → commit → push → CI:

| # | Dilim | # | Dilim |
|---|---|---|---|
| 1 | Player | 8 | Practice Race |
| 2 | Horse okuma + başlangıç atı | 9 | Practice Race giriş ücreti + ödül + Idempotency/Redis |
| 3 | Stable Summary | 10 | Stable Upgrade idempotency sertleştirme |
| 4 | Training | 11 | Market (ilan oluştur) |
| 5 | Care | 12 | Market listeleme + Kendi ilanlarım |
| 6 | Stable Upgrade + ekonomi borçlandırma | 13 | Market ilan süresi dolması |
| 7 | Daily Reward | 14 | PvP Matchmaking |
| — | — | 15 | **Yarış ödül HAVUZU + kademeler (8/10/12/14/16) + hazır olma kapısı** (27.09.2026) |

**15. dilim (27.09.2026) — proje sahibinin talebi:** *"yarışlar ücretli olsun,
verilen ücret kadarıyla giriş yapan kişiler çarpan olsun ve bir yarışta 8 /
10 / 12 / 14 / 16 at koşabilsin, hazır olan kişiler yarışabilsinler"* +
*"kesinti olsun (~%10)"*. Ödül sabit tablodan değil `havuz = entryFee ×
fieldSize` havuzundan dağıtılır; `Σ shares = 1 − raceRake` olduğundan
yarış **hiçbir kademede Çip basamaz** (denetim CRITICAL E7 + MEDIUM E30
kapandı). Yarışa girmek `domain/race/readiness.ts` kapısına bağlı (sağlık ≥
50, yorgunluk ≤ 70, enerji ≥ 30). Web ekranına kademe seçici eklendi.
Ayrıntı: `docs/ECONOMY.md` §4.1.1, `docs/ECONOMY_AUDIT.md` E7/E9/E30.

### 5.3 Denetim düzeltmeleri

**`docs/ROADMAP.md` AUDIT_AND_HARDENING** — 8 öncelik kapatıldı.

**Kök `AUDIT_REPORT.md`** (2026-09-14 tarihli tam depo denetimi) özet tablosu —
neredeyse hepsi ✅ DÜZELTİLDİ:

| Bulgu | Konu | Durum |
|---|---|---|
| S1 | Auth + global AuthGuard | ✅ `24fafb1` |
| S2/S3/S4 | IDOR / sahiplik kontrolleri | ✅ `24fafb1` |
| D1 | Aynı ata birden fazla aktif ilan | ✅ |
| D2 | Bayat sahip (stale owner) | ✅ |
| C1 | Ahır kapasitesi | ✅ |
| C2 | Kilitli oku-değiştir-yaz | ✅ |
| H1 | Sakatlık iyileşmesi | ✅ |
| H2 | Pazarda listelenmiş at engeli | ✅ |
| E1 | `savePracticeRaceWithStakes` (cüzdan+yarış+defter tek tx) | ✅ `a010ec3`, CI #111 |
| E1' | PvP analoğu `savePvpMatchWithRatings` | ✅ `8bf8b1b`, CI #121 |
| E2/E3 | Ekonomi/atomiklik | ✅ |
| R1 | Hava durumu config sürümü | ✅ |
| R2 | Bot kalıcılığı (migration 0025 `bot_label`) | ✅ `d62f6fc`, CI #118 |
| R3 | Current Form, Draw, Track Fit, Carried Weight bağlandı | 🟡 **Kısmi** — Temperament ve jokey yeteneği hâlâ nötr placeholder |
| T1 | Eşzamanlılık testleri (n=10/50/100) | ✅ |
| T2 | Frontend sözleşme + bileşen testleri | ✅ CI #113 |
| T3 | 12 atlı 250 denemeli denge testi | ✅ CI #115 |
| T3b | Tempo yeniden dengeleme (closer payı ~%53 → ~%31-32) | ✅ |
| F1 | Responsive | ✅ `9c08982`, CI #116 |
| F2 | WebSocket `race.telemetry`/`race.finished`/`lobby.update` | 🟡 **Kısmi** — `notification.new` ertelendi |
| G1 / DOC1 | — | ✅ |

### 5.4 Frontend

**⚠️ BU LİSTE 29.09.2026'da GÜNCELLENDİ** — burada eskiden 14 sayfa yazıyordu
ve **bayattı** (`/notifications`, `/wallet`, `/profile/[username]`,
`/grandstand`, `/friends`, `/races/[raceId]/watch` eklendiği hâlde liste
güncellenmemişti). Gerçek sayıyı bir daha yazarken
`apps/web/src/app/**/page.tsx` dosyalarını say — bu belgeye değil.

**21 sayfa (29.09.2026):** `(dashboard)`, `stable`, `market`, `races`,
`races/demo`, `races/[raceId]/watch`, `replays`, `replays/[raceId]`,
`training`, `care`, `equipment`, `online`, `club`, `farm`, `leaderboard`,
`grandstand`, `friends`, `notifications`, `wallet`, `profile/[username]`.

**`club` TEK `ComingSoon` yer tutucusudur** — diğer 20 sayfa gerçek bir uca
bağlıdır. `ComingSoon` bileşeni `apps/web/src` içinde **yalnızca** `club`
tarafından kullanılır (grep ile doğrulanabilir).

Feature'lar: `race-viewer/` (+ `chat-history-merge.ts` ve
`chat-history-merge.spec.ts`), `matchmaking/lobby-socket.ts`,
`career/career-tier.ts`, `pedigree/`, `player-demo/PlayerDemoWidget.tsx`
(**bağlı değil** — işlevi ana sayfa zaten yapıyor, ikinci bir base-url
kaynağı doğurur).
Lib: `api-client.ts`, `player-context.tsx`. Bileşenler: `layout/TopBar.tsx`,
`ui/{ComingSoon,GlassPanel,HorseAvatar,StarRating,StatBar}.tsx`. Tema: `theme.ts`.

### 5.5 Veritabanı: 43 migration, 36 tablo

**⚠️ BU SAYILAR 29.09.2026'da DÜZELTİLDİ** — burada eskiden "28 migration,
24 tablo" yazıyordu ve **bayattı** (0043'e kadar migration eklendiği hâlde
başlık güncellenmemişti). Sayıyı bir daha yazarken `database/migrations/`
altındaki dosya sayısına ve `CREATE TABLE` aramasına bak — bu belgeye değil.

`players`, `tracks`, `horses`, `horse_stats`, `horse_surface_stats`,
`horse_distance_stats`, `horse_health`, `jockeys`, `training_sessions`, `races`,
`race_entries`, `race_entry_segments`, `market_listings`, `breeding_pairs`,
`pedigrees`, `player_auth_providers`, `staff`, `facilities`, `horse_care_log`,
`matchmaking_tickets`, `pvp_matches`, `economy_transactions`, `idempotency_keys`,
`horse_equipment`, `player_feed_inventory`, `horse_feed_log`, `race_tickets`,
`friendships`, `direct_messages`, `gift_sends`, `race_messages`, `notifications`,
`race_invites`, `player_blocks`, `player_reports`, `admin_audit_log`
(+ `schema_migrations`, aracın kendi tablosu).

Öne çıkan kısıtlar:
- `players.level` 1–50, `players.rating >= 100`
- `economy_transactions`: `balance_after = balance_before + amount`
- **Kısmi UNIQUE** `market_listings(horse_id) WHERE status='active'` (D1 düzeltmesi)
- **Kısmi UNIQUE** `horse_equipment(horse_id, equipment_type) WHERE equipped` (0028)
- `race_entries`: `horse_id XOR bot_label` (bot satırları gerçek satır olarak yazılır)

---

## 6. Test ve CI

- **Vitest** (Jest değil). ⚠️ `globals: false` — her spec `describe`/`it`/`expect`'i
  **açıkça import eder**. `vitest.config.ts`'te `esbuild.jsx: 'automatic'`
  (web tsconfig'i `jsx: "preserve"` kullandığı için zorunlu).
- **99 spec dosyası** (27.09.2026, `breeding.e2e-spec.ts` eklendikten sonra):
  `apps/api/test/` **77** (21 e2e + 2 diğer [`horse.mapper`, `module-graph`] +
  52 domain + 2 database), `apps/web/test/` **20**, `packages/` **2**. (Sayım
  `*.spec.ts` + `*.spec.tsx` + `*.e2e-spec.ts` desenlerinin üçünü birlikte
  kapsar; yalnızca `*.spec.ts` sayılırsa e2e'ler kaçar ve toplam yanlış
  çıkar.) Yerelde ölçülen: `test/domain` **660 test / 52 dosya** ✔.
- ✅ **E2E ARTIK YERELDE KOŞABİLİR (27.09.2026'da değişti).** Bu bölüm eskiden
  "e2e yerelde koşamaz — Postgres yok" diyordu; **artık geçersiz.** Docker
  hâlâ yok ama makinede **PostgreSQL 18** kurulu
  (`C:\Program Files\PostgreSQL\18`). Geçici, tek kullanımlık bir küme şöyle
  ayağa kalkıyor (şifre gerekmez, `trust`):
  `initdb -D <veri> -U at_sevdalisi -A trust -E UTF8 --locale=C` →
  `postgres.exe -D <veri> -p 5432 -c listen_addresses=127.0.0.1` →
  `createdb` → `npm run migrate`. Redis zaten 6379'da koşuyor.
  **CI'nın yaptığını birebir taklit etmek için koşudan ÖNCE şema düşürülür**
  (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) — aksi halde
  birikmiş veri yüzünden dosyalar birbirini bozar ve YANLIŞ hata verir
  (yaşandı: `race.e2e-spec.ts` tam pakette 7 hata verdi, tek başına 24/24
  geçti; sebep buydu).
- ⚠️ **`test/api/module-graph.spec.ts`** — altyapı GEREKTİRMEYEN tek API
  testidir: `AppModule`'ün DI grafiğini yalnızca `.compile()` ile kurar
  (`.init()` yok → Postgres/Redis'e bağlanmaz). 27.09.2026'da CI'ı düşüren
  "eksik provider kaydı" arızasının sınıfını yerelde yakalayan testtir.
- e2e: `supertest` (HTTP seviyesi) + `socket.io-client` (`realtime.e2e-spec.ts`).
  `test-helpers.ts`: `bootstrapTestApp()`, `sendWithRetry()` (ECONNRESET/EPIPE
  yeniden deneme), `sendConcurrentRequests()`, `registerTestPlayerWithStarterHorse()`.
- Bileşen testleri: `@testing-library/react` + jsdom.
- **CI** (`.github/workflows/ci.yml`): push + PR → `main`. Tek iş `build-and-test`,
  `ubuntu-latest`, **gerçek `postgres:16-alpine` + `redis:7-alpine` servis
  konteynerleri** (mock yok). Adımlar: checkout → setup-node 20 → `npm install` →
  `lint` → `typecheck` → `migrate` → `test` → `build`.
  `npm ci` + cache **bilinçli olarak yok** (registry kısıtı yüzünden lockfile yok).

---

## 7. Yazılı olmayan ama kritik iki teknik tuzak

### 7.1 `@Inject()` HER ZAMAN açık olmalı (esbuild/Vitest tuzağı)

Vitest/esbuild **`design:paramtypes` metadata'sını ÜRETMEZ**. Dolayısıyla
`constructor(private readonly repo: PlayerRepository)` gibi **tipe dayalı örtük DI
`undefined` çözer** ve çalışma anında patlar — üstelik yerelde fark edilmez, CI'da
patlar.

**Kural:** Her bağımlılık `@Inject(PORT_TOKEN)` ile açıkça işaretlenir.
(Bkz. `docs/ARCHITECTURE.md` §9.1 "Hata 6".)

**Aynı tuzağın kardeşi:** esbuild altında DTO `@IsIn`/`@IsUUID` doğrulaması sessizce
atlanabilir. Bu yüzden **domain katmanında bağımsız doğrulama** şart
(`domain/*/validation.ts`).

### 7.2 "Hayalet regresyon" dersi

Yerel sandbox kopyası gerçek depodan **geride kalabilir**. Bir teslimat hazırlamadan
önce mutlaka `git fetch` + `origin/main` doğrulaması yapılır; "her şeyi üzerine yaz"
zip'i yerine **yalnızca değişen dosyalar** yazılır. `docs/ROADMAP.md` bunu yaşanmış
bir ders olarak kaydeder.

---

## 8. Kısıtlar — bu ortamda NE yapamam

### 8.1 npm registry erişimi YOK

`npm install` bu sandbox'ta **hiç çalıştırılamadı**. Sonuç: framework kodu
(Next.js, NestJS, Three.js) yerelde **çalıştırılarak doğrulanamaz**. Doğrulama
mekanizması ikilidir:
1. **`tsc` baseline-diff** (yerelde tip kontrolü),
2. **CI** (gerçek Postgres/Redis ile gerçek çalıştırma).

Yeni bir bağımlılık eklemek **risklidir** — yerelde doğrulanamaz, sadece CI'da
kendini gösterir. Mümkünse yeni bağımlılık eklemem.

### 8.2 Tarayıcı/GPU YOK

3D render, animasyon, gerçek görsel doğrulama bu ortamda yapılamaz. Web tarafındaki
görsel değişiklikler "kod doğru ama gözle görülmedi" statüsündedir; bunu proje
sahibine **açıkça söylerim**.

### 8.3 Gerçek 3D/ses varlığı YOK — ve bu BİLİNÇLİ bir karar

`apps/web/public/` **boştur** (yalnızca `manifest.json`). `asset-manifest.ts`'teki
26 girdinin **hepsi `status: missing`**. Ne GLB, ne PNG, ne ses dosyası var.

- Bu, "unutulmuş" değil; proje sahibi **"asset kaynağını şimdilik erteleyelim"**
  demiştir (bkz. `docs/IMPLEMENTATION_PLAN_MASTER_BRIEF.md` "Grup 2").
- **MUTLAK ÇİZGİ:** brief'in kendi kuralı — **"asla sahte/placeholder GLB dosyası
  uydurma, lisanssız asset kullanma."** Ben de finansal işlem yapamam. Bu yüzden
  görsel/ses sistemleri **"dosya yoksa çökmeden ilkel bir fallback'e düş"** diye
  tasarlandı: asset'ler geldiğinde **kod değişikliği GEREKMEZ**, sadece dosyalar
  doğru yollara konur.
- `assets/` kök klasörü (git'e girmez, sadece `.gitkeep` + README izlenir) **HAM
  kaynak** çalışma alanıdır (`.blend`/`.fbx`/yüksek çözünürlüklü doku). Nihai
  optimize edilmiş `.glb`/`.ktx2`/`.mp3` ise `apps/web/public/`'e gider. İkisi
  karıştırılmamalı.
- Ek kural: **Mixamo YASAK** (at dört ayaklı iskelet için üretilmemiş; jenerik
  insansı animasyonlar jokeyin gerçekçi duruşunu yansıtmıyor). LOD zinciri (LOD0-3)
  ve Blender pipeline kontrol listesi (IMPORT→CLEAN→OPTIMIZE→...→GLB EXPORT→
  THREE.JS TEST) varlık seçim kriteridir.

### 8.4 git PATH'te YOK

`git` komutu bu kabukta bulunamaz. Git şurada:
`C:\Users\adema\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe`
Proje konvansiyonu: git çıktısını log dosyasına yazan `.bat` script'leri
(`check-dirty.bat` → `check-dirty-log.txt`) çalıştırıp logu okumak.

---

## 9. Teslimat mekanizması — işler NASIL yürüyor

Bu projenin kendine özgü, oturmuş bir ritüeli var. **Bunu bozmam.**

```
küçük dilim yaz
  → yerel tsc baseline-diff ile doğrula
  → commit
  → git bundle üret (*.bundle)
  → apply-<özellik>-push.bat yaz
  → proje sahibi .bat'ı çalıştırır
      (bundle verify → fetch origin/main → taban commit doğrula
       → fetch bundle → checkout main → merge --ff-only → push origin main)
  → GitHub Actions CI yeşil mi kontrol
```

`apply-*.bat` script'leri `*.bundle`, `outputs/`, `push-*.bat`, `check-dirty*.bat`
ile birlikte **gitignore'ludur** — tekrar üretilebilir scratch dosyalarıdır, repo
geçmişine girmez.

**Neden böyle:** sandbox'ta npm registry yok ve git yok → doğrudan push mümkün değil;
doğrulama ancak GitHub Actions'ta gerçek Postgres/Redis ile yapılabiliyor.

**Sonuç olarak benim davranışım:**
- Proje sahibi istemeden **commit atmam**, dosyaları olduğu gibi bırakırım.
- Her teslimatta `git fetch` + `origin/main` taban doğrulaması **şart**.
- "Her şeyi üzerine yaz" yerine **yalnızca değişen dosyaları** yazarım.
- Değişikliğin **CI'da doğrulanması gerektiğini** açıkça söylerim; "çalışıyor" demem.

---

## 10. Bilinen boşluklar — dürüst liste

### 10.1 Ürün tarafı

| Boşluk | Detay |
|---|---|
| **Gerçek 3D/ses varlığı yok** | §8.3 — en büyük görsel engel; sahibinin kararını bekliyor |
| **OAuth kimlik bilgisi yok** | Kod tam (§13.38: Google düğmesi + bağlama); `GOOGLE_OAUTH_CLIENT_ID` boşken düğme gizlenir ve `POST /auth/login` `InvalidProviderTokenError` döner. Apple: istemci yok, ücretli üyelik bekliyor |
| ~~Frontend'de gerçek giriş yok~~ | **KAPANDI** — `/account`: e-posta + şifre (§13.36), sıfırlama (§13.37), Google (§13.38), çıkış |
| ~~**Yarış takvimi yok**~~ | **KAPANDI (01.10.2026, §13.53)** — sunucu config programıyla lobi yarışı açar |
| **Matchmaking senkron** | `JoinMatchmakingQueueUseCase.playMatch` eşleşmeyi HTTP isteği içinde yapar; 30.09.2026'dan beri `MatchmakingScheduler` kuyruğu ayrıca tarar (§13.33). Projede artık beş zamanlayıcı var (kilit, turnuva, sezon, eşleştirme, takvim) |
| **Pazar süresi dolması tembel** | `PostgresMarketListingRepository.sweepExpiredListings` — lazy sweep, zamanlanmış iş değil |
| ~~**Müzayede ilanı yok**~~ | **KAPANDI (02.10.2026, §13.60)** |
| ~~**Jokey bağlanmamış**~~ **KAPANDI (§13.30, PHASE 6.2, 29.09.2026)** | `calculateJockeySkillComposite` artık motora girer; `race_entries.jockey_id` kilit anında yazılır. **02.10.2026:** `calculateJockeyHorseCompatibility` (mizaç bileşeni dahil) BAĞLANDI (§13.62). **AÇIK KALAN:** `gatePosition` hâlâ okunmuyor |
| ~~**Jokey serbest bırakma yolu yok**~~ | **KAPANDI (29.09.2026)** — `POST /jockeys/:jockeyId/release` |
| ~~**Çiftlik/personel çarpanları bağlanmamış**~~ | **KAPANDI (01.10.2026)** — personel §13.42, tesisler §13.54 (veteriner merkezi bilinçli etkisiz: bakım ücretsiz) |
| ~~**Bağlanmamış domain modülleri**~~ | **KAPANDI (30.09–01.10.2026):** turnuva §13.35, kulüp §13.41, sezon §13.43, ilerleme §13.40, yetiştirme §13.4 — hepsi uç + ekranla bağlı |
| ~~**Placeholder sayfalar**~~ | **KAPANDI** — `/club`, `/farm`, `/leaderboard` gerçek ekranlar |
| **Bağlanmamış iskeletler** | ~~`RaceAudioManager`/`html-audio-backend`, `GltfAssetLoader`~~ **01.10.2026'da BAĞLANDI** (§13.46, §13.51); `PlayerDemoWidget.tsx` hiçbir sayfada mount edilmiyor. (**`DustParticles` ve `PedigreeTree` artık BAĞLI** — 27.09.2026, bkz. §13 ve §13.2) |
| ~~**PWA nominal**~~ | **KAPANDI (02.10.2026, §13.61)** — `app/manifest.ts` + logo yolundan üretilen ikonlar; Chromium kurulabilirlik denetimi hatasız. Service worker YOK (bilinçli: oyun çevrimiçi) |
| ~~**`notification.new`**~~ | **KAPANDI** — olay adı `notification.created` (`race.gateway.ts`), istemci `notification-socket.ts` dinler |

### 10.2 Yapılandırma tutarsızlıkları

**ÜÇÜ DE 27.09.2026'DA DÜZELTİLDİ** (aşağıda ne olduğu yazılı — tekrar
"açık uç" sanıp yeniden kovalanmasın):

- ~~`apps/web/.env.example`: `NEXT_PUBLIC_API_BASE_URL` + `NEXT_PUBLIC_WS_URL` yazar.~~
  **DÜZELTİLDİ.** Üç ayrı ad vardı ve canlı kodun okuduğu ad bunlardan
  HİÇBİRİ değildi: `api-client.ts` `NEXT_PUBLIC_API_URL` okur, `.env.example`
  ise `NEXT_PUBLIC_API_BASE_URL` bildiriyordu → dosyayı kopyalayan biri
  okunmayan bir değişken tanımlıyordu. Artık `.env.example` doğru adı yazıyor;
  hiç okunmayan `NEXT_PUBLIC_WS_URL` kaldırıldı (soket adresi ayrı bir
  değişken değil, API adresinden `deriveSocketOrigin` ile türetilir).
- ~~`api-client.ts` varsayılanı `http://localhost:3000/api/v1` — gerçek API portu 4000.~~
  **DÜZELTİLDİ.** Bu, yukarıdakiyle BİRLEŞİNCE uygulamayı fiilen kırıyordu:
  değişken hiç tanımlı olmadığı için her çağrı bu yedeğe düşüyor, o da
  Next.js'in KENDİ portuna (3000) gidiyordu. Varsayılan artık 4000.
  (`live-race-url.ts`/`live-race-socket.ts` yorumlarındaki `:3000` örnekleri de
  aynı yanlış izlenimi sürdürdüğü için 4000'e çekildi.)

  **Bu hatanın neden bu kadar uzun yaşadığı — asıl ders burada:**
  `apps/web/test/lib/api-client.spec.ts` taban adresi modülden IMPORT etmek
  yerine kendi içinde KOPYALIYORDU (`const API_BASE_URL = '...:3000/api/v1'`).
  Sonuç: 25 testin 15'i YANLIŞ portu "beklenen davranış" olarak doğruluyordu.
  Yani hata testlerin içine gömülmüştü ve yeşil bir test paketi onu gizliyordu.
  Port düzeltilince o 15 test kırmızıya döndü (bu, hatanın gerçek olduğunun
  KANITI oldu). Test artık modülün export ettiği `API_BASE_URL`'i kullanıyor +
  portun KENDİSİNİ ayrıca sabitleyen bir iddia eklendi (çünkü port yanlış olsa
  bile diğer testler yine geçerdi — yanlış bir değer kendi kendini doğrular).
  **Genel kural:** bir test, üretim değerinin KOPYASINI tutuyorsa, o test
  değeri değil kopyayı korur.
- ~~`database/seeds/001_dev_seed.sql` geçersiz UUID literalleri kullanır.~~
  **DÜZELTİLDİ.** `...0000t1`, `...000h01`, `...000j01` — `t`/`h`/`j` hex
  değil. `tools/seed.ts` bu dosyayı doğrudan çalıştırdığı için `npm run seed`
  **her zaman** patlıyordu; CI seed çalıştırmadığı için hata hiç görünmüyordu.
  Kimlikler geçerli hex'e çevrildi (a1 / b01-b05 / c01-c02). Aynı hata sınıfı
  sessizce geri gelmesin diye `apps/api/test/database/sql-literals.spec.ts`
  artık `seeds/` **ve** `migrations/` altındaki her UUID şekilli literali
  CI'da denetliyor (boş küme üzerinde sessizce geçmemesi için ayrıca
  "en az bir .sql dosyası bulunmalı" iddiası var).
- `PlayerDemoWidget.tsx` hâlâ ÜÇÜNCÜ bir ad okuyor
  (`NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1'`). **Bilerek
  dokunulmadı:** o dosya zaten hiçbir yere bağlı değil ve §13'e göre
  gereksiz sayılıyor; adını düzeltmek, kullanılmayan bir dosyayı
  "kullanılıyormuş gibi tutarlı" göstermekten başka bir şey yapmazdı.
- ~~`src/application/use-cases/README.md` **bayat**~~ **DÜZELTİLDİ.** Dosya
  "bu klasör FAZ 1'den itibaren doldurulacaktır" diyordu (oysa içinde 28
  gerçek use-case vardı) ve listelediği 9 addan **6'sı bu depoda hiç var
  olmamıştı**. Artık dosya sisteminden üretilmiş gerçek liste + "brief adı →
  gerçek ad" çeviri tablosu + henüz yazılmamış olanların dürüst listesi var.

**§10.2'nin tamamı kapatıldı (27.09.2026).** Bu bölümde açık madde kalmadı.

---

## 11. Belge haritası — hangi soruda nereye bakarım

| Soru | Belge |
|---|---|
| Projenin değişmez "anayasası" (vizyon, ekranlar, oyun döngüsü) | `docs/PROJECT_BRIEF.md` |
| Katman kuralları, teknoloji eşlemesi, performans hedefleri, deploy | `docs/ARCHITECTURE.md` |
| **Gerçek durum / ne yapıldı ne kaldı (en zengin kaynak)** | `docs/ROADMAP.md` |
| Yarış motorunun felsefesi, girdi/çıktı sözleşmesi, determinizm | `docs/RACE_ENGINE.md` |
| Kodlama kuralları, 6 adımlı protokol, isimlendirme, commit formatı | `docs/CODING_CONVENTIONS.md` |
| Güvenlik: sunucu otoritesi, doğrulama katmanları, idempotency, kilitleme | `docs/SECURITY.md` |
| Ekonomi modeli, pazar değeri formülü, monetizasyon sınırları | `docs/ECONOMY.md` |
| **Ekonomi denetimi — 30 bulgu, CRITICAL/HIGH/MEDIUM sınıflı (27.09.2026)** | `docs/ECONOMY_AUDIT.md` |
| Ekran haritası, üst bar, responsive/mobil ilkeler | `docs/GAME_DESIGN.md` |
| Ana döngü, günlük döngü, bildirim tetikleyicileri | `docs/GAME_FLOW.md` |
| API sözleşmeleri (envelope, uçlar, hata kodları) | `docs/API.md` |
| Test stratejisi, MVP kabul kriterleri, CI boru hattı | `docs/TESTING.md` |
| 3D/ses brief'ine karşı boşluk analizi | `docs/AUDIT_REPORT.md` |
| O boşluğun uygulama planı (Grup 1 / Grup 2) | `docs/IMPLEMENTATION_PLAN_MASTER_BRIEF.md` |
| Varlıkların insan-okunur listesi + kabul kriterleri | `docs/ASSET_GUIDE.md` |
| Tam depo denetimi + düzeltme durumu tablosu | kök `AUDIT_REPORT.md` |
| Ham varlık çalışma alanı kuralları | `assets/README.md` |
| **Benim yönelim dosyam (bu dosya)** | kök `PROJE_DURUMU.md` |

---

## 12. Proje sahibinin kararını bekleyen açık konular

`docs/ROADMAP.md` "Açık kararlar" (12 madde) — **1. madde çözüldü:**
kimlik sağlayıcı = Google/Apple Sign-In (`player_auth_providers` tablosu,
migration 0011, `domain/player/auth-provider.ts`).

**Bekleyenler:** çevrimdışı davranışı, erişilebilirlik (a11y), i18n, bildirim
kanalı, ödeme sağlayıcı, KVKK/GDPR, hız sınırlama politikası, gözlemlenebilirlik
(observability), **asset tedarik yolu**, barındırma (hosting), GitHub erişimi.

**En kritik tek soru:** **3D/ses varlıkları nereden geliyor?**
Seçenekler (a) sahibi lisanslı paket satın alır, (b) CC0 model sağlar,
(c) görsel/ses hedefleri ertelenir ve Grup 1'in kod-only iyileştirmeleriyle
yetinilir, (d) başka tedarik yolu. Bu cevap gelmeden görsel/ses fazları ilerleyemez.

---

## 13. Sıradaki iş — hazır olan ama yapılmamış (asset GEREKTİRMEZ)

`docs/IMPLEMENTATION_PLAN_MASTER_BRIEF.md` "Grup 1" — Race Engine'e dokunmadan,
gerçek asset gerektirmeden, her biri bağımsız commit+CI ile doğrulanabilir:

1. **Telemetri zenginleştirme** — *YAPILDI (bu turda)*: `RaceSegmentSnapshot`'a
   opsiyonel `fatigueLevel` (yarış İÇİNDE biriken CANLI yorgunluk) ve
   `paceScore` (0-100 tempo, 50 = nötr) eklendi. `fatigueLevel` gerçek bir
   hatayı kapattı: `RaceHud`'un "Yor" çubuğu statik `horses.fatigue` değerini
   gösterdiği için yarış boyunca DÜZ bir çizgiydi. Migration `0029` +
   repository INSERT/SELECT + `timeline-playback.ts` + `RaceHud` paneli.
   Plandaki `staminaRemaining` **bilerek atlandı** — zaten canlı olan `stamina`
   alanının saf kopyası olurdu.
2. **Camera Director** — *YAPILDI ve BAĞLI*: `camera-director.ts`
   (`selectAutomaticCameraMode`, `classifyRaceCameraEvent`),
   `LiveRaceViewer.tsx` + `RaceViewer.tsx` tarafından gerçekten tüketiliyor
   (11 test).
3. **Photo Finish sunumu** — *YAPILDI ve BAĞLI*: `photo-finish.ts`
   (`buildPhotoFinishRows`, `isCloseFinish`, `getFinishSlowMotionFactor`),
   `RaceViewer.tsx` + `RaceHud.tsx` sonuç kartında kullanılıyor (14 test).
4. **Asset Interface + Manifest + ASSET_GUIDE** — manifest ve kılavuz
   *yapıldı*; `GltfAssetLoader.tsx` fallback'iyle hazır ama **hiçbir yerden
   import edilmiyor** (sahneye bağlı değil).
5. **Audio/VFX Manager iskeleti** — *toz VFX'i YAPILDI, ses BAĞLI DEĞİL*:
   `DustParticles.tsx` **artık `RaceScene3D.tsx`'e bağlı** (27.09.2026): her at
   için `HorseMarker`'ın *kardeşi* olarak render ediliyor (`Fragment` ile —
   `HorseMarker` her karede `<group>` transform'unu atın konumuna çektiği için
   iç içe konulsaydı parçacıklara transform İKİNCİ kez uygulanırdı), ve
   `isPlaying` opsiyonel prop'u (varsayılan `true`) ile `RaceViewer`'dan besleniyor
   → duraklatınca toz da duruyor. **Asset gerekmedi** (parçacık dokusu
   `BufferGeometry` + shader ile üretiliyor). Buna karşılık `audio-manager.ts`
   hâlâ yalnızca `html-audio-backend.ts` tarafından import ediliyor, o da
   hiçbir yerden import edilmiyor — çünkü `.mp3` dosyası YOK ve motor ses
   olaylarını (GATES_OPEN/OVERTAKE/WINNER) hiçbir yer YAYMIYOR; bağlanırsa
   sessiz bir no-op olurdu.
6. **Pedigree görselleştirme** — *bağlandı* (`/stable` at kartındaki "Soy
   Ağacı" düğmesi → `GET /horses/:id/pedigree`); bkz. §13.2. **Ama** yazan
   yol (çiftleştirme) hâlâ yok, o yüzden ağaç çoğu at için boş.
7. **Config ayrımı** — *yapıldı* (`camera.config.json`, `vfx.config.json`,
   `audio.config.json`).

→ Yani Grup 1'in **1, 2, 3, 5 (kısmen), 7** maddeleri bitti.

**DÜZELTME (27.09.2026) — buradaki eski 5'li liste YANILTICIYDI.** O listeyi
"asset gerektirmez, hepsi bağlanabilir" diye okumak yanlıştı; tek tek
incelendiğinde yalnızca **ikisi** gerçekten bugün bağlanabilir durumda:

- **`PedigreeTree.tsx` — OKUMA YOLU BİTTİ** (27.09.2026, §13.2): pedigri
  okuyan repository + `GET /horses/:id/pedigree` + `/stable`'a bağlı UI
  yazıldı. **Üçüncü parça (foal doğumunda kayıt) HÂLÂ YOK** ve tek başına
  bir dilim: `POST /breeding` (docs/API.md §7) + `pedigrees`/`breeding_pairs`
  yazımı. **O engel KALKTI (27.09.2026):** başlangıç atının cinsiyeti artık
  sabit `gelding` DEĞİL, üç cinsiyetten rastgele — bkz. §13.3.
- `GltfAssetLoader.tsx` — **asset olmadan ANLAMSIZ.** `.glb` yokken her zaman
  yedek görünüme düşer, yani bugünkü kapsül+küre görüntüsünün tıpatıp aynısı
  çıkar. Bağlamak sıfır görsel etki üretir.
- `createHtmlAudioBackend()` — **asset olmadan ANLAMSIZ.** `.mp3` yok + ses
  olayı yayılmıyor (yukarıda madde 5).
- `PlayerDemoWidget.tsx` — **gereksiz.** İşlevi ana sayfa (`usePlayer` /
  `apiClient`) tarafından zaten yapılıyor; bağlamak ikinci bir base-url
  kaynağı doğurur, yani bugünkü tutarsızlığı (§10.2) büyütür.

**DustParticles — bağlandı** (yukarıda madde 5): tek "küçük ve gerçek" işti,
tamamlandı. `PedigreeTree`'nin OKUMA yolu da bitti (§13.2); kalan iş onun
YAZMA yoludur (çiftleştirme → tay doğumu) ve o, yukarıdaki "üreyebilen at
edinilemiyor" engeli çözülmeden ulaşılabilir hale gelmez.

### 13.1 Sosyal/ekonomi dilimleri (proje sahibinin talebi, 27.09.2026)

Sahibi üç parça istedi: **tribün**, **arkadaşlık + mesajlaşma**, **hediye
gönderimi**. Sıra bilinçli: hediye bir para yoludur (defter + idempotency),
en sona bırakıldı.

1. **TRIBÜN — YAPILDI** (bu dilim). Ücretli seyirci girişi + izleme.
   `GET /races/watchable`, `POST /races/:id/tickets`, `GET /players/:id/tickets`;
   `/grandstand` sayfası; izleme mevcut `/replays/[raceId]`'e bağlanır (AYRI
   seyirci izleyicisi icat edilmedi — yetki kapısı `GetRaceTimelineUseCase`'in
   kendisidir, "katılımcı VEYA bilet sahibi"). Bilet geliri bir **SINK**'tir
   (yarış sahibine ödeme İKİ `players` satırı kilitlemeyi gerektirir → ayrı dilim).
2. **ARKADAŞLIK + MESAJLAŞMA — YAPILDI** (bu dilim). Migration `0033`
   (`friendships` + `direct_messages`), `config/social.config.json`,
   `SocialModule` (7 uç nokta), `/friends` sayfası.
   - **Kanonik çift:** A→B ve B→A AYNI satırdır (`player_low_id <
     player_high_id` CHECK + `UNIQUE`); yarış koşulları SQL'de kapatılır
     (`ON CONFLICT ... WHERE status = 'rejected'`, `UPDATE ... WHERE status =
     'pending' AND requested_by_id <> $2`) — uygulama ön-kontrolüne ek ikinci
     hat.
   - **`Idempotency-Key` YOK** (para yolu değil); spam savunması `@RateLimit`
     + bekleyen istek tavanı (`409 SOCIAL_LIMIT_REACHED`).
   - **`DELETE .../friends/:friendId` 200 + gövde döner, 204 DEĞİL** —
     istemcinin `request()` yardımcısı her yanıtta `response.json()` çağırır.
   - **Yeni arkadaş keşfi `/leaderboard` üzerinden:** oradaki satıra "Arkadaş
     Ekle" düğmesi eklendi (sıralama tablosu başka oyuncunun `playerId`'sini
     gören tek mevcut yüzeydir). Ayrı bir "oyuncu ara" uç noktası bilinçli
     olarak İCAT EDİLMEDİ — görünen ad numaralandırmasına açık yeni bir yüzey
     olurdu.
   - **Bilinçli olarak YAPILMAYANLAR:** engelleme (block), arkadaşlık tavanı
     (karşılıklı onay gerektiği için spam vektörü yok), grup sohbeti,
     bildirim (`notification.new` hâlâ yok — okunmamış rozeti sayfada).
3. **HEDİYE GÖNDERİMİ — YAPILDI** (bu dilim; üçüncü ve son parça). Migration
   `0034` (`gift_sends`), `config/gift.config.json`, `GiftModule` (2 uç nokta:
   `POST /players/:id/gifts`, `GET /players/:id/gifts`), `/friends` sayfasında
   hediye formu + hediye geçmişi.
   - **TRANSFER, SINK DEĞİL.** Tribün biletinden temel fark: düşülen tutar
     ALICIYA eklenir. Her gönderim `economy_transactions`'a **İKİ satır** yazar
     (`gift_send_debit` negatif + `gift_send_credit` pozitif, AYNI
     `reference_id` = `gift_sends.id`).
   - **`Idempotency-Key` ZORUNLU** — çift gönderim alıcıyı haksız yere
     zenginleştirir ve geri alınamaz. Anahtarsız istek 400 ve HİÇBİR satır
     yazılmaz; aynı anahtar AYNI `giftId`'yi döner.
   - **Arkadaşlık şartı İKİ KEZ kontrol edilir** (use-case'te + transaction'ın
     İÇİNDE, aynı `PoolClient`). DB kısıtı DEĞİL: `friendships` bir durum
     makinesidir ve hediye GEÇMİŞTİR, arkadaşlık silinince silinmemelidir.
   - **Kilit sırası** sözlüksel id (`executePurchase`/`updateTwoWithLock` ile
     AYNI gelenek); günlük sayaç gönderenin satırı KİLİTLİYKEN okunur, bu
     yüzden eşzamanlı istekler serileşir ve sayım tutarlıdır.
   - **`recipientBalance` yanıtta YOK** — alıcı, bakiyesini gönderene
     göstermeyi kabul etmemiştir (At Pazarı satın almasının deseni bilinçli
     olarak TAKLİT EDİLMEDİ).
   - **Bilinçli olarak YAPILMAYANLAR:** hediye mesajı/notu, hediye paketi
     görseli, toplu hediye, hediye geri alma (transfer geri alınamaz), alıcıya
     bildirim (`notification.new` hâlâ yok — geçmiş `/friends` sayfasında),
     Elmas kazanma yolu (harici sağlayıcı bekliyor, bkz. §10).

**Grup 2** (§12'deki asset sorusuna bağlı): gerçek Horse/Jockey GLB + animasyon
state machine, hipodrom çevresi, kalabalık sistemi, gerçek ses dosyaları,
winner ceremony / paylaşılabilir sonuç.

### 13.2 Soy ağacı veri zinciri — OKUMA YOLU (27.09.2026)

Sahibinin "Başla" dediği iş. Üç parçadan **ikisi** yapıldı:

- **`PostgresPedigreeRepository`** (`infrastructure/breeding/`) —
  `horses` LEFT JOIN `pedigrees`, tek turda soy + ataların ADLARI.
  `PEDIGREE_REPOSITORY` portu `HorseModule`'dan export edilir (yazma yolu
  ayrı bir modülde olacağı için).
- **`GET /horses/:id/pedigree`** (`@Public()`) → `GetHorsePedigreeUseCase`.
- **UI bağlandı:** `/stable` at kartındaki "Soy Ağacı" düğmesi (tembel
  yükleme — ahırdaki her at için istek atılmaz).

**İki tasarım kararı (ikisi de e2e testiyle sabitlendi):**

1. **"Soy kaydı yok" ≠ "at yok".** İlki `200` + tüm ataları `null` bir ağaç,
   ikincisi `404 HORSE_NOT_FOUND`. Başlangıç atları hiç çiftleştirilmediği
   için birinci durum bugün **kural**, istisna değil.
2. **İki kaynak var, `pedigrees` kazanır.** Şema ebeveyni hem
   `horses.sire_id`/`dam_id`'de (0002) hem `pedigrees`'te (0008) tutuyor;
   repository zengin olanı tercih eder, satır yoksa sütunlara düşer ve
   büyükebeveyn alanlarını **uydurmaz** (`null` bırakır).

**ÜÇÜNCÜ PARÇA BİTTİ** (27.09.2026) — bkz. §13.4: `pedigrees` satırını
YAZAN yol artık var (`POST /players/:id/breeding`, tay doğumu + damızlık
ücreti + kısrak cooldown'ı). §13.3'teki cinsiyet rastgeleleştirmesi bu
yazma yolunu ULAŞILABİLİR kılan ön koşuldu.

**Bilinçli olarak YAPILMAYANLAR:** `GET /breeding/options` (eş adayları +
tahmin), gebelik süresi modellemesi (tay ANINDA doğar — bkz. §13.4),
`breeding_pairs.prediction` sütununun doldurulması, iğdişleme (gelding
yapma) akışı, `PedigreeTree`'nin Pazar/at detay sayfasına da eklenmesi.

### 13.3 Başlangıç atının cinsiyeti artık rastgele (27.09.2026)

**Sorun:** `createStarterHorse` tek at yaratma yoluydu ve cinsiyeti sabit
`'gelding'` idi. Pazar yalnızca VAR OLAN atları el değiştirdiği için oyunda
hiçbir zaman bir `mare`/`stallion` var olamıyordu — yani çiftleştirme
uç noktası yazılsa bile kalıcı olarak ulaşılamaz kalırdı (projenin daha önce
yakındığı "bağlı ama ulaşılamaz" sınıfı). **Sahibi 27.09.2026'da (a)
seçeneğini seçti:** cinsiyet rastgeleleştirilsin.

**Yapılan:** `STARTER_HORSE_GENDER` sabiti yerine
`STARTER_HORSE_GENDERS = ['mare','stallion','gelding']` + `pickStarterHorseGender(randomValue)`
(`domain/horse/horse.ts`, `pickStarterHorseName` ile aynı clamp deseni).
İki kayıt yolu da (`RegisterPlayerUseCase`, `LoginWithProviderUseCase`) bunu
çağırır. `NewStarterHorseInput.gender` **zorunlu** alan oldu — sessiz bir
`gelding` varsayılanı bilerek bırakılmadı.

**Bilinçli kararlar:**
- **Dağılım düzgün (uniform).** `gelding`'i daha olası kılmak kilidi kısmen
  geri getirirdi; bu yüzden ağırlıklandırma YAPILMADI.
- **`gelding` havuzdan çıkarılmadı** — yarışabilen ama üreyemeyen bir at da
  meşru bir sonuçtur; yalnızca TEK seçenek olmamalıydı.
- **Regresyon koruması testte:** `pickStarterHorseGender` describe bloğu,
  havuzun `mare`/`stallion` içerdiğini VE ikisinin de gerçekten üretilebildiğini
  doğrular — karar sessizce geri dönerse test kırmızı olur.
- `Math.random()` burada **meşrudur**: at yaratma simülasyonun parçası değil,
  yarış sonucunu etkilemez ve seed'i yoktur (§1/§3 yarış determinizmi içindir).

**Hâlâ yapılmayan:** §13.4'te not edilenler dışında bir şey kalmadı — yazma
yolu yazıldı.

### 13.4 Soy ağacı veri zinciri — YAZMA YOLU (27.09.2026)

Soy ağacı veri zincirinin **üçüncü ve son parçası**. `POST /players/:id/breeding`
ile çiftleştirme yapılır ve **tay ANINDA doğar** (gebelik süresi modellenmez;
`breedingCooldownDays` kısrağın BİR SONRAKİ çiftleştirmesine kadar geçen
süredir). `domain/breeding/breeding.ts`'teki `breedHorses` bugüne kadar
yalnızca testlerden çağrılıyordu; artık gerçek bir çağıranı var.

**Yazılan katmanlar:** `BreedingRepository` portu +
`PostgresBreedingRepository` (tek transaction), `BreedHorsesUseCase`,
`BreedingController`/`BreedingModule`/`BreedHorsesDto`,
`BreedingResultView` (shared-types), `MareNotOwnedError` +
`BreedingHorseListedError`, `pickFoalGender` + `assertBreedingConfigIsValid`.

**Dört tasarım kararı:**

1. **Seed = `pairId`.** `breedHorses`'a `seed: pairId` geçilir ve `pairId`
   `breeding_pairs.id` olarak SAKLANIR — yani tayın statları, elde yalnızca
   kayıt satırı varken bile yeniden üretilebilir. Seed için ayrı sütun
   açılmadı (şema değişikliği YOK).
2. **Kilit sırası global kuralla aynı:** iki `horses` satırı (sözlüksel id)
   → iki `players` satırı (sözlüksel id). `PostgresMarketPurchaseRepository`
   zaten horses→players; `PostgresGiftRepository` yalnızca players'a
   dokunur — yani bu yeni yol hiçbir mevcut yolla döngü kuramaz. Domain
   kararı (`breedHorses`) transaction İÇİNDE, KİLİTLİ satırlardan okunan
   değerlerle verilir.
3. **Damızlık ücreti yalnızca AYGIR BAŞKASININSA** alınır (kendi atlarını
   çiftleştiren kendine ödeme yapmaz) ve `if (fee > 0)` ile korunur —
   migration 0019'un `CHECK (amount <> 0)`'ı sıfır tutarlı defter satırını
   yasaklar (pazar alımındaki AYNI desen). Ücret bir TRANSFER'dir, bu
   yüzden deftere İKİ satır (debit + credit) yazılır.
4. **`birthHealthRisk` gerçek bir sütuna yazılır:** domain'in hesapladığı
   [0,1] değeri `horse_health.injury_risk`'e ×100 olarak girer. Aksi halde
   hesaplanıp hiçbir yere yazılmayan bir değer olurdu.

**Yan düzeltmeler:** `ErrorCode.HorseListedInMarket` eklendi (kod daha önce
`DOMAIN_ERROR_MAP`'te HAM metin olarak duruyordu ve `domain/horse/errors.ts`'te
ikinci bir kopyası vardı; yeni hata sınıfıyla üçe çıkacaktı).
`validateHorseName` artık `unknown` kabul eder ve doğrulanmış+`trim()`'lenmiş
ismi DÖNER — ham gövde değeri sayı geldiğinde 500 (`TypeError`) yerine 400.

**E2E SONRADAN YAZILDI (27.09.2026) — ve GERÇEK BİR HATA BULDU.**
`apps/api/test/api/breeding.e2e-spec.ts` (24 test) eklendi; yerelde
**24/24 geçti**. Kanıtladığı yedi şey dosyanın başlık yorumunda listelidir;
özü: damızlık ücreti gerçek bir TRANSFERdir (iki defter satırı), aynı sahip
ücret ödemez, doğan tay `GET /horses/:id/pedigree`'de görünür (zincir
kapanır), yetersiz bakiyede HİÇBİR şey yazılmaz (rollback bütündür),
idempotency tek tay/tek tahsilat verir, uygunluk kapıları reddeder ve
yanıt aygır sahibinin bakiyesini ya da `seed`'i SIZDIRMAZ.

**Dosyanın bulduğu hata:** gövdede UUID olmayan bir `mareId` gelince uç
nokta 400 yerine **500** dönüyordu. Kök neden `docs/ARCHITECTURE.md` §9.1
Hata 7'nin ta kendisi — Vitest/esbuild `design:paramtypes` üretmediği için
`ValidationPipe` gövde doğrulamasını SESSİZCE atlıyor, `@IsUUID()`
dekoratörleri etkisiz kalıyor ve ham değer repository'ye ulaşıp Postgres'ten
`22P02 invalid input syntax for type uuid` hatası sızdırıyordu.
`breeding.controller.ts`'e projenin yerleşik **elle `isUUID()`** ikinci
savunma hattı eklendi (`horse`/`market`/`matchmaking` controller'larıyla
AYNI desen).

**AÇIK KALAN AYNI SINIF HATA:** `send-gift.use-case.ts` `recipientId`'yi
yalnızca `@IsUUID()` ile doğrular → aynı 500'e açıktır. Bu dilimin kapsamı
dışında bırakıldı, ayrıca ele alınmalıdır.

### 13.5 Yarış sohbeti + canlı izleyici sayısı (27.09.2026)

Brief §13 (yarış sohbeti) + §27 ("👥 348 spectators" göstergesi) + §32
(sohbet hız sınırı). **Mevcut `/races` Socket.IO gateway'ine EKLENDİ** —
yeni bir namespace, yeni bir simülasyon, yeni bir oyun durumu
MAKİNESİ İCAT EDİLMEDİ.

**Yazılan katmanlar:** `config/chat.config.json` + `ChatConfig`/
`loadChatConfig()`, migration **0035** (`race_messages`), `RaceChatMessageView`/
`RaceChatHistoryPayload`/`SendRaceChatMessagePayload`/`RaceSpectatorCountPayload`/
`RaceChatErrorPayload` (shared-types), `ChatRepository` portu +
`PostgresChatRepository`, `SendRaceMessageUseCase` +
`ListRaceMessagesUseCase`, `ChatModule`, `RaceGateway`'e altı yeni olay
(`race.spectators`, `chat.message`, `chat.message.received`, `chat.history`,
`chat.error`) ve `apps/api/test/api/race-chat.e2e-spec.ts` (6 test).

**Dört tasarım kararı:**

1. **Yeni tablo açıldı, `direct_messages` YENİDEN KULLANILMADI.** Mevcut
   tablo **çift eksenli** (gönderen↔alıcı) ve **arkadaşlık kapılı**;
   yarış sohbeti **oda eksenli** (bir yarışın TÜM izleyicileri) ve
   arkadaşlıkla İLGİSİZ. Birini diğerine sıkıştırmak, ya `direct_messages`'ın
   `CHECK`/`UNIQUE` kısıtlarını gevşetmek ya da "yarış odası"nı sahte bir
   oyuncu gibi modellemek anlamına gelirdi. `ON DELETE CASCADE` hem
   `races(id)` hem `players(id)`'e bağlıdır.
2. **Yetki YENİDEN İCAT EDİLMEDİ.** `chat.message` göndermek için gereken
   şey, `race.subscribe`'ın ZATEN uyguladığı kapının aynısıdır (katılımcı
   **veya** tribün bileti sahibi — `GetRaceTimelineUseCase`). Gateway,
   abone olunan yarışları `client.data.raceIds` (`Set<string>`) içinde
   tutar ve sohbette bu kümeye bakar. Yeni bir izin kontrolü, yeni bir
   "sohbet üyeliği" kavramı YOK.
3. **Sohbet bir PARA YOLU DEĞİLDİR** → `SELECT ... FOR UPDATE` ve
   `economy_transactions` defter kaydı YOKTUR (CLAUDE.md'nin 7. kuralı
   para/mutasyon yoluna aittir). `ChatRepository` portunun doc yorumu bunu
   açıkça yazar; yetki de portun işi DEĞİLDİR (gateway'in işi).
4. **İzleyici sayısı = odadaki AÇIK SOKET sayısı**, `race_tickets` satır
   sayısı değil — yani "bilet aldı ama henüz gelmedi" sayılmaz. Sayaç
   `handleDisconnect`'te `client.data.raceIds` üzerinden o soketin abone
   olduğu HER yarış için ayrı ayrı yeniden yayınlanır (Socket.IO'nun
   `_onclose` → `leaveAll()` → `emit('disconnect')` sırası sayesinde ayrılan
   soket artık SAYILMAZ). **Bilinçli sınır:** sayaç tek-instance'tır —
   Redis adapter bağlanana kadar çok-instance'lı dağıtımda eksik görünür
   (docs/API.md §10'da belgelendi).

**Hız sınırı neden `RateLimitGuard` DEĞİL:** mevcut guard bir NestJS
`CanActivate`'tir ve **HTTP'ye özeldir** — WebSocket mesajları için
çalışmaz (`guard` boru hattı WS'te yoktur). Bu yüzden pencere sayacı
gateway içinde, soket başına (`client.data`) tutulur; limit/pencere yine
`config/chat.config.json`'dan gelir (sihirli sayı YOK). **Bilinçli sınır:**
sayaç soket başına ve BELLEK İÇİdir — çok-instance'lı dağıtımda oyuncu
başına değil soket başına sınırlar ve yeniden bağlanmak sayacı SIFIRLAR.
Tek-instance için doğru davranış; Redis'e taşınması ayrı bir iştir.

**Config ↔ DB uyumu:** `maxMessageLength` (300) `race_messages.body`
üzerindeki `CHECK (char_length(body) BETWEEN 1 AND 300)` ile
EŞLEŞMEK ZORUNDADIR. Bunu `apps/api/test/domain/chat/chat-config.spec.ts`
**MİGRASYON DOSYASINI OKUYARAK** doğrular (`social-config.spec.ts` ile
AYNI gerekçe: `load*Config()` saf bir cast'tir, çalışma zamanı doğrulaması
YOKTUR — sayıyı teste elle yazmak config'i sabitlerdi ama config ile
veritabanının AYRIŞMASINI yakalayamazdı).

**E2E'NİN BULDUĞU GERÇEK HATA (bu dilimin en değerli çıktısı):**
`race.spectators` sayacı ilk yazıldığında `this.server.sockets.adapter.rooms`
ile okunuyordu ve **çalışma zamanında patlıyordu**
(`TypeError: Cannot read properties of undefined (reading 'rooms')`).
Kök neden bir Nest tuzağıdır: **`namespace` seçeneği verilen bir gateway'de
Nest, `@WebSocketServer()` alanına io `Server`'ı DEĞİL o namespace'i atar.**
İkisinin API'si `.to(oda).emit(...)` için aynıdır ama oda sayımı için
AYNI DEĞİLDİR — io `Server`'da `server.sockets` bir namespace'tir (`.adapter`
vardır), namespace'te ise `server.sockets` bir `Map`'tir (`.adapter` YOKTUR).
Doğrusu `server.adapter.rooms`'tur. Hata `joinSharedPlayback` içinde
fırladığı için **kalan kod hiç koşmuyordu** — yani `race.roster` hiç
gönderilmiyordu ve bu, benim dilimim dışındaki `realtime.e2e-spec.ts`'i de
kırıyordu (6 test). Alanın tipi bu yüzden `Server` değil **`Namespace`**
olarak yazıldı: tipi `Server` bırakmak derleyiciyi susturur ama hatayı
GİZLEMEZ. **Ders:** "oda sayısı" gibi bir sayaç, tek bir testte 0 dönse bile
"boş oda" gibi görünür; bu yüzden e2e testi sayının **arttığını VE
azaldığını** ayrı ayrı iddia eder.

**HENÜZ YOK:** `chat.*` olaylarının frontend tüketicisi (tribün sohbeti
arayüzü brief §35'in açık işidir) · bildirim (brief §46) · sohbet moderasyonu/
sansür (brief §13'ün "küfür filtresi" kısmı) · Redis adapter'a geçiş
(yukarıdaki iki bilinçli sınırın ikisini de kaldırır).

### 13.6 Ücretli yarış — oluşturma + katılma (27.09.2026)

brief §42 PHASE 1'in iki yarısı bitti: **1a** `POST /races` (commit `e030681`),
**1b** `POST /races/:id/join` (commit `3d30892`). İkisi de CI'dan geçti.

- **1a — yarış AÇMA.** `config/race-lobby.config.json` doğdu (`fieldSizes`
  `[8,10,12,14,16]`, `paidEntryFeeOptions`, `distanceMeters`,
  `maxOpenRacesPerPlayer`). Migration 0036 `races`'e lobi alanlarını ekledi.
  Gövde `domain/race/lobby.ts` → `validateRaceCreation` ile BAĞIMSIZ doğrulanır
  (CLAUDE.md kural 5: esbuild altında DTO dekoratörleri atlanır).
- **1b — yarışa KATILMA.** Giriş ücreti **katılım anında** tahsil edilir ve
  `races.prize_pool` aynı anda büyür. Migration 0037 `race_entries`'e
  `player_id` + `status` ekledi.
- **`player_id` neden katılım anında DONAR:** at sonradan satılırsa ödül yeni
  sahibine gitmemelidir. `status` ise bilinçli olarak NULLABLE ve DEFAULT'suz:
  pratik/PvP satırları zaten KOŞMUŞ yarışlardır, onlara `'waiting'` yazmak
  yalan olurdu.
- **Kilit sırası `races` → `players`.** Durum denetimlerinin HEPSİ yarış satırı
  `FOR UPDATE` ile kilitliyken yapılır; use-case'e taşınsaydı kontrol ile yazma
  arasında yarış dolabilirdi (TOCTOU).
- **Kısmi tekil indeks** `race_entries_race_player_uq (race_id, player_id)
  WHERE player_id IS NOT NULL`: ücret kişi başına alındığı için bir oyuncu iki
  atla girip havuzu kendi lehine şişiremez. Uygulamadaki ön kontrol TOCTOU'ya
  açıktır — asıl garanti indekstir.
- **`Idempotency-Key` ZORUNLU** (`@IdempotencyScope('player')`): aynı anahtarla
  tekrarlanan istek İKİNCİ kez ücret almaz.
- **Bu dilimde bedava gelen iki ders:** (1) `RaceFull` `error-codes.ts`'in
  BAŞINDA zaten tanımlıydı; ikinci kez eklenince `TS1117` (çift anahtar) çıktı
  ve `ErrorCode.X` runtime'da `undefined`'a düşüp hata gövdesinden `code`
  alanını **sessizce sildi** — testler "400 döndü ama kod yok" diye patladı.
  (2) supertest'te `.set(başlık, null)` başlığı atlamaz, `String(null)` =
  `"null"` yazar; "anahtarsız istek reddedilir" testi bu yüzden yalancı yeşil
  oluyordu.
- **HENÜZ YOK:** ödül dağıtımı (PHASE 5, bkz. §13.10) · frontend tüketicisi.

### 13.7 Ücretli yarış lobisi — listeleme + READY (27.09.2026)

brief §42 PHASE 3. 13.6'nın "HENÜZ YOK" listesindeki iki madde kapandı:
`GET /races` (lobi listesi) ve `POST /races/:id/ready`.

- **`GET /races` = LOBİ, takvim değil.** Yalnızca `status = 'scheduled'`
  yarışlar, `start_time ASC`. `docs/API.md` §6'daki yol haritası bloğunda
  `GET /races` "takvim" anlamında geçiyordu; ikisi aynı yolu paylaştığı için
  ayrım orada AÇIKÇA yazıldı.
- **`joinedPlayers` GERÇEK oyuncuları sayar.** `COUNT(e.player_id)`,
  `COUNT(*)` DEĞİL. Bot satırları (`bot_label` dolu, `player_id` NULL —
  migration 0025/0037) sayılsaydı lobi her yarışı dolu gösterirdi.
- **`LEFT JOIN`in koşulu `ON`'da, `WHERE`'da DEĞİL.** `player_id IS NOT
  NULL` yanlışlıkla `WHERE`'a yazılsaydı sıfır katılımlı yarışlar listeden
  tamamen kaybolurdu — sessiz ve fark edilmesi zor bir hata.
- **READY bir para yolu DEĞİL.** `Idempotency-Key` bilinçli olarak YOK;
  bakiye, `prize_pool` ve defter READY'den sonra tıpatıp aynı kalır (e2e
  bunu tek tek ölçer). `checkEntryReadyable` mevcut duruma BAKMAZ → aynı
  değeri iki kez yazmak idempotenttir.
- **`cancelled` READY'den yazılamaz.** İptal = ücret iadesi, ayrı bir para
  yolu; buradan yazılabilseydi ücret ödemeden çıkmanın yolu doğardı.
- **403 değil 404** (`RACE_ENTRY_NOT_FOUND`): 403 "burada bir katılım var
  ama senin değil" bilgisini sızdırırdı.
- **Ret nedeni önceliği: durum > zaman > iptal.** Üçü birden bozuksa
  kullanıcıya en anlamlı neden gösterilir.
- **`?limit` asla 400 değil.** Geçersiz değer varsayılana düşer, tavan
  kırpılır (`normalizeLobbyListLimit`). Bir okuma ucunu hatalı bir sorgu
  parametresi yüzünden reddetmek kullanıcıya hiçbir şey kazandırmaz.
- **HENÜZ YOK:** yarışı `in_progress`e çeviren zamanlayıcı (cron/worker) ·
  READY durumunun motor tarafından OKUNMASI (şu an yalnızca bilgi) · ödül
  dağıtımının UYGULANMASI (PHASE 5 oranları/çarpanı getirdi ama ödeme yapacak
  koşucu yok — §13.10) · frontend tüketicisi.

### 13.8 Cüzdan + sanal para yatırma (brief §20/§22, §42 PHASE 4a + 4b)

4a cüzdanı OKUNABİLİR yaptı (`GET /players/:id/wallet`, iki katmanlı işlem
taksonomisi, migration 0038 defter değişmezliği trigger'ı). 4b cüzdana
DIŞARIDAN para SOKAN ilk yolu açtı (`POST /players/:id/wallet/deposit`).
Belgenin tamamı `docs/WALLET_SYSTEM.md`'dedir; buradaki özet yalnızca
"nerede ne var" sorusunu cevaplar.

- **`REFUND` ailesinin 4b sonunda hâlâ üreticisi yoktu** — bilinçli, §13.9'da
  kapandı.
- **`mock_deposit`, `deposit` DEĞİL.** Gerçek sağlayıcı bağlandığında
  geçmişte hangi kaydın oyuncak olduğu geriye dönük OKUNABİLİR kalır.
- **Üç savunma katmanı:** üretimde yapısal kapalılık (`NODE_ENV`), defter
  türü ayrımı, sunucu tarafı işlem tavanı (aşan tutar SESSİZCE KIRPILMAZ).
- **`PaymentProvider` bir PORT** (`application/ports/payment-provider.ts`);
  `MockPaymentProvider` tek implementasyonu. Gerçek parayı açmak üç AÇIK
  adım ister — "config'i çevir" kadar kolay değildir (brief §41).
- **HENÜZ YOK:** günlük toplam yatırma tavanı (PHASE 16) · para ÇEKME ·
  gerçek sağlayıcı (Stripe/iyzico) · `gems` yatırma · iade/chargeback.

### 13.9 Yarıştan ayrılma + giriş ücreti iadesi (brief §20 `REFUND`, §42 PHASE 4c)

`POST /races/:id/leave` — 13.7'nin ve 13.6'nın "HENÜZ YOK" listesindeki
"iptal = iade" maddesini kapatır. **`REFUND` ailesinin projedeki İLK ve tek
üreticisidir** (`race_entry_refund`).

- **İade tutarı DEFTERDEN okunur**, `races.entry_fee`'den DEĞİL: oyuncunun
  o yarışa yazdığı `lobby_race_entry_fee` satırının ters işaretlisidir.
  Ücret politikası sonradan değişse bile iade ÖDENEN tutardır.
- **Katılım SİLİNMEZ, `cancelled` olur.** `race_entries_race_player_uq`
  (migration 0037) `status`'tan bağımsızdır; silmek ayrıl→katıl döngüsüyle
  READY bayrağını sıfırlamanın yolunu açardı.
- **İptal edilen katılım doluluk SAYILMAZ** — üç sayım sorgusu da
  `FILTER (WHERE status IS DISTINCT FROM 'cancelled')` kullanır (`<>`
  DEĞİL: `status` NULL olabilir ve NULL ile `<>` NULL döner, satır sessizce
  sayılmazdı). Bu, "havuz = ödenen giriş ücretlerinin toplamı" değişmezinin
  şartıdır — PHASE 5'in ödül dağıtımı ona dayanır.
- **`prize_pool` `CHECK (>= 0)` bir TUZAK değil TELDİR:** düşüm
  `GREATEST(...,0)` ile kırpılmaz. Kısıt patlarsa doğru tepki hatayı
  GÖRMEKTİR (havuz ile defter ayrışmış demektir).
- **Kilit sırası `races → race_entries → players`** — `joinLobbyRace` ile
  ilk kilidi, `setEntryReady` ile ilk ikisini paylaşır, deadlock yok.
- **`Idempotency-Key` ZORUNLU:** ikinci istek use-case'e HİÇ ULAŞMAZ, yani
  İKİNCİ KEZ İADE EDİLMEZ — `join`'in "iki kez ücret alma" korumasının
  aynası. Aynı oyuncunun yeniden katılması `RACE_ENTRY_CANCELLED` (409)
  alır; boşalan koltuk BAŞKALARINA açıktır.
- **HENÜZ YOK:** yarışın `cancelled` olması hâlinde TOPLU iade (13.7'deki
  zamanlayıcı ile birlikte gelecek) · frontend tüketicisi.

### 13.10 Ödül havuzu + çarpan (brief §3/§4, §42 PHASE 5)

brief §3 "PRIZE POOL" ve §4 "ÇARPAN / MULTIPLIER SİSTEMİ". Brief §4'ün AÇIK
şartı olan "çarpan hesaplama Race Engine'den ayrı bir domain/service olmalı"
kuralı gereği yeni dosya `domain/race/prize-distribution.ts`'tir: `race-engine.ts`'e
dokunmaz, ondan hiçbir şey import etmez, `fieldSize` diye bir şey duymaz.

- **Oranlar artık KADEMEDE DEĞİL.** `RaceTierConfig.payoutShares` kaldırıldı;
  yerine `distributionId` geldi ve diziler `economy.config.json` →
  `prizeDistributions` altında (`top5`…`top9`) TEK KEZ yazılıyor. Sebep:
  lobi yarışı da aynı oranlarla ödül veriyor ve iki kopya kaçınılmaz olarak
  kayardı — "lobide 3.75× yazıp pratikte 3.00× ödemek" tam olarak bu yüzden
  mümkün olmamalı. `raceLobby.prizeDistributionId` (varsayılan `top5`)
  ikinci tüketicinin bağlandığı yerdir.
- **Çarpan AYRI BİR MERDİVEN DEĞİL, TÜRETİLMİŞTİR.** Brief §4 örnek olarak
  `1.00x / 1.25x / 1.50x / 2.00x` verir; bu merdiven bilinçli olarak config'e
  YAZILMADI. Yazılsaydı gösterilen çarpan ile ödenen ödül iki ayrı kaynaktan
  gelir ve biri diğerini yalanlayabilirdi. Çarpan
  `havuz × shares[0] ÷ entryFee` = `katılımcı sayısı × shares[0]`'dır, yani
  "kalan süre/katılım arttıkça artar" davranışı KENDİLİĞİNDEN oluşur
  (8 oyuncuda 3.00×, 16 oyuncuda 6.00×).
- **`null` ile `0` AYRI ŞEYLER.** Ücretsiz yarışta, henüz katılımcısı olmayan
  yarışta ya da ödül sırası tanımsız bir dağıtımda çarpan `null`'dır —
  "bu yarışta çarpan kavramı yok". `0` göstermek "kazanç yok" diye okunurdu.
  `RaceLobbyView.prizeMultiplier` bu yüzden `number | null`'dır.
- **`validatePrizeDistributions` YENİ ve kritik:** `distributionId` yazımı
  yanlış olduğunda (`top5` yerine `top55`) hiçbir istisna fırlamaz, hiçbir
  ekran uyarı vermez — kademe HİÇ ödül ödemez ve herkes kaybeder. Sessiz
  olduğu için yakalanması yalnızca testle mümkündür.
  `validateRaceTiers` artık önce onu çağırır, sonra her kademenin dağıtımı
  DOĞRU kullandığını denetler (`shares.length ≤ fieldSize`, `Σ ödül < havuz`).
- **Yuvarlama şart:** `money` bir tam sayı birimidir; `round(havuz × pay)`
  olmadan `wallet.ts`'in `Number.isInteger` kontrolü `InvalidAmountError`
  fırlatır ve istemciye 500 döner. Yuvarlamadan sonra bile `Σ ödül < havuz`
  korunur — bu, ulaşılabilir EN KÜÇÜK lobi havuzunda (50 Çip × 8 at = 400 →
  dağıtılan 360) ve tüm ücret×alan kombinasyonlarında test edilir.
- **HENÜZ YOK — ve bu AÇIKÇA yazılmalı:** ödülü ÖDEYEN bir yol yok. Bir lobi
  yarışını `in_progress`e çeviren zamanlayıcı (cron/worker) olmadığı için
  `prizeMultiplier`/`topPrize` bir VAATTİR, gerçekleşmiş bir kazanç değildir.
  Dağıtımı uygulayacak matematik hazırdır (`computePrizePayouts`); eksik olan
  tek parça yarışı başlatan/bitiren sunucu tarafıdır. Alan adlarının "kazandın"
  değil "kazanan ne alır" anlamına gelmesi bu yüzden bilinçlidir.
- Ayrıntı: `docs/ECONOMY.md` §4.1.1, `docs/API.md` §6, testler
  `apps/api/test/domain/race/prize-distribution.spec.ts` (yeni) +
  `prize.spec.ts` (güncellendi).

### 13.11 Bildirimler + yarış daveti (brief §16/§28, §42 PHASE 11)

brief §16: *"Arkadaşlar birbirlerini yarışa davet edebilsin. Örneğin: 'Ömer
seni At Sevdalısı Cup yarışına davet etti.' [JOIN] [DECLINE] bildirimi
gelsin."* Beş uç nokta, `NotificationController` + `NotificationModule`.
Migration `0039_create_notifications_and_race_invites`.

- **DAVET İLE BİLDİRİM AYNI TRANSACTION'DA YAZILIR.** brief'in istediği şey
  "davet gönder" değil, "davet BİLDİRİMİ gelsin"dir; ikisi ayrı
  transaction'larda olsaydı, arada kopan bağlantı `race_invites` satırını
  yazar, bildirimi yazmaz ve `race_invites_race_invitee_uq` tekil indeksi
  yüzünden o davet **sonsuza kadar yeniden gönderilemez** hâle gelirdi.
- **`notifications` GENEL bir tablodur** (brief §28'in sekiz türü `type`
  CHECK'inde tanımlı), davete özel değil. `payload` JSONB — sekiz tür için
  sekiz kolon seti açmak her yeni türde migration gerektirirdi; şekil
  sözleşmesi TİP tarafında (`NotificationPayloadByType`).
- **BU DİLİMDE (PHASE 11) YALNIZCA `race_invite` ÜRETİLİR.** Kalan YEDİ türün
  (`friend_request`, `friend_accepted`, `gift_received`, `message_received`,
  `race_starting`, `race_finished`, `prize_won`) **ÜRETİCİSİ YOKTU** — o an
  `INSERT INTO notifications` yazan tek yol `send-race-invite`ti.
  **GÜNCEL DURUM: bu satır bayatladı — PHASE 13 dört üretici daha ekledi
  (§13.13 + §13.13.1); kalan üç tür için hâlâ üretici yok.**
  (`NotificationRepository` portu bilinçli olarak yalnızca OKUMA +
  okundu-işaretleme içerir, `create` YOKTUR — "bildirimi kim üretir"
  sorusunun tek cevabı olsun diye.)
- **`accept` YARIŞA KATILMAK DEĞİLDİR.** Davet bir at taşımaz; katılım bir
  para yoludur. brief §16'nın `[JOIN]` düğmesi istemcide iki adımdır: daveti
  kabul et → lobiye git, atını seç. e2e bunu ayrıca kanıtlar: kabul sonrası
  `race_entries` satırı oluşmaz, bakiye değişmez.
- **Yanıt yalnızca DAVET EDİLENDEN gelir.** Davet eden kendi davetini
  yanıtlamaya çalışırsa `404 RACE_INVITE_NOT_FOUND` — "bu id var ama senin
  değil" demek başkasının davetinin VARLIĞINI sızdırırdı.
- **Davet yanıtı davet edene BİLDİRİM YAZMAZ.** Sekiz tür arasında buna
  karşılık gelen bir tür yoktur; davet eden sonucu `race.invite.responded`
  WebSocket olayından öğrenir. Uydurma bir tür eklemek CHECK'i ve istemci
  sözleşmesini brief §28'in dışına taşırdı.
- **YENİ BİR 500 HATASI SINIFI KAPATILDI.** `inviteeId`/`raceId` GÖVDE
  alanlarıdır ve `@IsUUID()` esbuild altında atlanır (`ParseUUIDPipe` yalnızca
  yol parametrelerini korur); `domain/social/invite.ts → isUuid` olmadan
  `{"inviteeId":"abc"}` doğrudan `WHERE id = $1`e gider ve PostgreSQL 22P02
  ile **500** dönerdi. `send-gift.use-case.ts`te hâlâ AÇIK olan hatanın
  (CLAUDE.md "Bilinen açık hata") aynı sınıfıdır — o dosya bu dilimin
  DIŞINDADIR, ayrıca düzeltilmelidir.
- **WebSocket olayı `notification.new` DEĞİL `notification.created`.** Eski
  ad `docs/API.md` §10'da yıllardır "PLANLI" olarak duruyordu; yayınlanan ad
  bildirimin KALICI olarak yazıldığını anlatır. `race.invite` /
  `race.invite.responded` OYUNCU odasına gider (davet edilen henüz yarış
  odasına abone değildir).
- **HENÜZ YOK — frontend tüketicisi.** `notification.created`,
  `race.invite`, `race.invite.responded` olaylarının ve beş HTTP uç
  noktasının **hiçbir istemci tüketicisi yoktur** (`chat.*` ve
  `race.spectators` ile AYNI durum — §13.5). Backend + e2e hazır; kalan iş
  yalnızca UI.
- Ayrıntı: `docs/API.md` §3 "Bildirimler + Yarış Daveti" ve §10, testler
  `apps/api/test/api/race-invite.e2e-spec.ts` (yeni) ·
  `apps/api/test/domain/social/invite.spec.ts` (yeni) ·
  `notification-types.spec.ts` (yeni — domain/shared-types/migration CHECK
  üçlüsünü migrasyon dosyasını OKUYARAK bağlar).

---

### 13.12 Gövde-UUID şekil kontrolü — kalan üç boşluk kapatıldı (28.09.2026)

**Tetikleyen:** `CLAUDE.md`'nin "Bilinen açık hata" notu. **Not BAYATTI.**
Orada "`send-gift.use-case.ts` `recipientId`'yi yalnızca `@IsUUID()` ile
doğrular" yazıyordu; oysa `gift.controller.ts` bu alanı ZATEN elle
`isUUID()` ile koruyordu (400). Yani bilinen hata diye tarif edilen şey
kapalıydı, ama TARİF EDİLMEYEN üç gerçek boşluk vardı.

**Kök neden (değişmedi, CLAUDE.md kural 5):** Vitest/esbuild
`design:paramtypes` üretmez → `ValidationPipe` GÖVDE doğrulamasını sessizce
atlar; `ParseUUIDPipe` yalnızca YOL parametrelerini korur. Korumasız bir
`"not-a-uuid"` repository'ye ulaşır, PostgreSQL `22P02` atar → istemci
**500** görür (400 değil).

**Gerçekten korumasız olan üç uç nokta (artık kapalı):**

| Uç nokta | Alan | Not |
|---|---|---|
| `POST /players/:id/friend-requests` | `addresseeId` | `social.controller.ts` |
| `POST /players/:id/messages` | `recipientId` | `social.controller.ts` |
| `POST /market/listings` | `horseId` | `market.controller.ts` |

`market/listings` özel: `HorseOwnerGuardByBodyField` zaten çalışıyor ama
bozuk biçimli bir `horseId` görünce **bilinçli olarak sessizce `true`
döner** ("asıl 400 üretimini downstream katmana bırakır" — bkz.
`horse-owner.guard.ts` dosya başı notu) ve downstream'de o kontrol YOKTU.

**Korunanlar (dokunulmadı):** `gifts` · `breeding` (`mareId`/`stallionId`) ·
`matchmaking/queue` · `market/my-listings` (`sellerId`).

**Karar — kontrol CONTROLLER'da, use-case'te DEĞİL.** Bu dilimde önce
use-case katmanına kondu, sonra **bilerek geri alındı**:
1. Projenin kendi yerleşik deseni bu (beş mevcut örnek, hepsi
   `BadRequestException` → 400).
2. Use-case `404` dönebiliyordu (domain Nest'i import ETMEZ, dolayısıyla
   `BadRequestException` fırlatamaz) — bozuk bir GİRDİ için 400 doğru koddur.
3. `class-validator`'ın `isUUID()`i zaten kullanılıyor; elle yazılmış ikinci
   bir UUID doğrulayıcı (`domain/shared/uuid.ts`, yine bu dilimde yazılıp
   silindi) iki ayrı doğruluk kaynağı doğururdu.

**Tek istisna:** `POST /players/:id/race-invites` (§13.11) kontrolü hâlâ
use-case'te (`domain/social/invite.ts` → `isUuid`) ve 404 döner. Gerekçesi
o dosyada yazılı; bu dilim onu DEĞİŞTİRMEDİ (yayınlanmış + e2e ile sabit).

**Testler:** `apps/api/test/api/body-uuid-shape.e2e-spec.ts` (yeni, 10 test).
Beş uç nokta × ikişer test: (a) bozuk biçim → 400, (b) biçimi GEÇERLİ ama
var olmayan UUID → 404. İkincisi ŞARTTIR: yalnızca (a) olsaydı "koruma fazla
katı mı" sorusu açık kalırdı.

**Kural (yeni bir gövde-UUID alanı eklerken):** DTO'daki `@IsUUID()` YETMEZ;
controller'da `if (!dto.x || !isUUID(dto.x)) throw new BadRequestException(...)`
yaz ve `body-uuid-shape.e2e-spec.ts`'e bir bölüm ekle.

**Commit:** `de7801c` (28.09.2026). Kanıt: 88 domain + 138 e2e test, 4 temiz
tsc, eslint 0 hata.

---

### 13.13 Bildirim üreticileri — arkadaşlık + mesaj + hediye (brief §28, §42 PHASE 13)

§13.11 bildirim ALTYAPISINI kurdu ama **tek üretici** bıraktı: `race_invite`.
`domain/social/notification.ts`'in dosya başı notu bunu açıkça yazıyordu
("bu turda yalnızca `race_invite` üretilir"). İki dilim **dört üretici** ekledi.

| Tür | Üreten yol | Bildirim KİME gider |
|---|---|---|
| `friend_request` | `POST /players/:id/friend-requests` | istek **ALANA** |
| `friend_accepted` | `POST .../friend-requests/:id/respond` (`action: 'accept'`) | istek **SAHİBİNE** |
| `message_received` | `POST /players/:id/messages` | mesaj **ALANA** |
| `gift_received` | `POST /players/:id/gifts` | hediye **ALANA** |

**Hâlâ üretilmeyen ÜÇ tür:** `race_starting`, `race_finished`, `prize_won`
(üçü de yarış yaşam döngüsüne bağlı; race engine'e dokunmadan
yapılabilecekleri ayrıca değerlendirilmeli). **"Bildirimler bitti" DEME.**

**Mimari kural (uygulandı):** üreten repository, birincil satırını ve
bildirimi **AYNI transaction'da** yazar — `NotificationRepository` port
doc yorumundaki kural, `postgres-race-invite.repository.ts` → `saveInvite`
ile aynı gerekçe. Bu yüzden `PostgresSocialRepository`'nin üç yazma yolu
artık `withTransaction` kullanıyor ve **sınıf doc yorumundaki
"`withTransaction` BİLE ÇAĞRILMAZ" notu güncellendi**: sebep para değil
ATOMİKLİK. İki ayrı ifade olsalardı ikincisi düşerse ortada **görünmez** bir
arkadaşlık isteği/mesaj kalırdı — karşı taraf onu hiç öğrenemezdi.

**Atomikliğin kanıtı bir testtir:** 409 alan ikinci arkadaşlık isteği karşı
tarafa İKİNCİ bir bildirim bırakmaz (`notification-producers.e2e-spec.ts`).
İki yazma ayrı ifadeler olsaydı bu test düşerdi.

**Yön kuralı:** bildirim **her zaman karşı tarafa** gider; gönderen kendi
eylemi için bildirim ALMAZ. `friend_accepted` **yalnızca kabulde** üretilir —
reddedilen istek karşı tarafa "reddedildin" bildirimi bırakmaz (bilinçli
ürün kararı; brief §28 bunu istemez ve istek zaten geri çekilebiliyor).

**Önizleme sunucuda kırpılır.** `message_received.payload.preview` sınırı
yeni bir config değeridir: `config/social.config.json` →
`notificationPreviewLength` (120). Sihirli sayı yok (CLAUDE.md kural 6).
Kırpma `Array.from` ile **kod noktalarına** göre yapılır: `String.slice`
UTF-16 kod birimleri üzerinde çalışır ve bir vekil çiftin (emoji)
ortasından kesip istemciye `�` gönderebilirdi. **Gövdenin TAMAMI asla
istemciye gitmez** — bildirim ucu bir okuma yolu değildir.

**Payload şekli TS'te kurulur, SQL'de değil.** `build*Payload` fonksiyonları
`domain/social/notification.ts`'te ve dönüş tipleri açıkça
`NotificationPayloadByType[...]` — alan adı kayması **derleme hatası** olur.
`jsonb_build_object` ile SQL'de kurmak, alan adlarının tip tanımından
sessizce kaymasına izin verirdi.

**DI notu:** `PostgresSocialRepository` artık `AppConfigService` de alıyor
(`@Global()` olduğu için modül imports'una ekleme GEREKMEZ). Precedent:
`postgres-breeding.repository.ts`, `postgres-market-purchase.repository.ts`.

**Bu dilimin KIRDIĞI ve düzelttiği test:** `race-invite.e2e-spec.ts`
yazıldığında "oyuncunun bildirimleri" ile "yarış daveti bildirimleri" aynı
şeydi ve iddialar **tüm** listeyi sayıyordu. Artık `makeFriends` kurulumu da
bildirim üretiyor. İki düzeltme yapıldı: (1) `notificationRowsOf` helper'ı
`type = 'race_invite'`e daraltıldı, (2) `makeFriends` kurulumun **yan
ürününü** temizliyor (yalnızca o iki oyuncu, yalnızca arkadaşlık/mesaj
türleri — `race_invite` satırlarına asla dokunmaz). Ders: **yeni bir
bildirim üreticisi eklemek, bildirim SAYAN mevcut testleri kırar.**

**Testler:** `notification-payload.spec.ts` (10 domain testi: kırpma
sınırları, emoji, bozuk config, payload şekli) +
`notification-producers.e2e-spec.ts` (8 e2e: yön, atomiklik, önizleme).
`social-config.spec.ts`'e `notificationPreviewLength < maxMessageLength`
değişmezliği eklendi — iki değerin ayrı ayrı pozitif olması bu tuzağı
yakalamaz.

**Yeni bir gövde-UUID alanı eklerken (§13.12) geçerli kural burada da
geçerli**; bu dilim yeni uç nokta eklemedi.

#### 13.13.1 `gift_received` — PARA YOLUNDA bildirim (28.09.2026)

Bu, PHASE 13'ün **para yoluna dokunan tek üreticisidir** ve bu yüzden
bilinçli olarak AYRI bir dilimde yapıldı (arkadaşlık/mesaj üreticileri para
yoluna hiç dokunmuyordu). Yazan yer: `PostgresGiftRepository.sendGift`.

**Atomiklik burada "iyi olur" değil, ZORUNLUDUR.** Bildirim, para
hareketinin görünür yüzüdür; ayrı bir INSERT olsaydı düşen bir bildirim
yazımı **geri alınmış bir transferi haber verir** (ya da tersi: alıcının
haberi olmayan bir transfer) ve ikisi de hiçbir yerde hata üretmezdi.
Bu yüzden `notifications` INSERT'i `withTransaction` gövdesinin İÇİNDE,
defter satırlarından sonra ve `return`den önce durur. `GiftRepository`
port doc yorumunun adım listesine **6. adım** olarak yazıldı.

**Kanıt — "bildirim yazıldı" değil, "REDDEDİLEN yolda bildirim YOK".**
`gift.e2e-spec.ts`'teki `gift_received bildirimi — para yoluyla atomik`
bloğu 8 test koşar ve para hareketinin REDDEDİLDİĞİ **her** yol için
bildirimin de yazılmadığını gösterir: arkadaş değil (403), yetersiz bakiye
(409), günlük tavan (409), kendine hediye (400). Ayrı bir INSERT olsaydı
bu testlerden en az biri düşerdi. Ek olarak: aynı `Idempotency-Key` ile
iki istek **TEK** bildirim üretir (alıcı aynı hediye için iki kez haberdar
olmaz).

**Payload:** `{ giftSendId, playerId, displayName, currency, amount }`.
`playerId`/`displayName` **GÖNDERENİ** tanımlar (bildirimin sahibi alıcıdır
— §13.13'ün genel yön kuralı). `currency` payload'da ZORUNLUDUR: "500" tek
başına belirsizdir (Çip mi Elmas mı) ve istemcinin bunu tahmin etmesi,
sunucunun bildiği bir şeyi istemciye sormak olurdu. `amount` **işaretsiz**
kalır (`gift_sends.amount` gibi) — negatif bir miktar istemciye "500 Çip
KAYBETTİN" dedirtirdi.

**Bu dilim `notification-producers.e2e-spec.ts`'e DOKUNMADI:** oradaki
dosya başı notu "bu dilim para yoluna dokunmaz" der ve bu hâlâ doğrudur —
`gift_received`'ın kanıtı kendi para yolu dosyasında (`gift.e2e-spec.ts`)
durur, çünkü iddiaları (403/409/400 → bildirim yok) ancak orada kurulabilir.

**Yeni tuzak (bu dilimde ısırmadı ama yakınından geçti):**
`giftNotifications()` helper'ı `type = 'gift_received'` ile süzülür.
`makeFriends` kurulumu artık `friend_request`/`friend_accepted` ürettiği
için, tüm listeyi sayan bir helper hediye iddiasını bir arkadaşlık
bildirimiyle "doğrular"dı — §13.13'ün `race-invite.e2e-spec.ts`'te yaşanan
tuzağının AYNISI. Ders tekrar: **bildirim sayan bir yardımcı yazarken
`type`e daralt.**

**Commit:** `gift_received` dilimi (28.09.2026). Önceki dilim: `35f41da`.

#### 13.13.2 NEDEN kalan üç tür yapılamıyordu — ÖDÜL DAĞITIMI YOK (28.09.2026 taraması)

> **✅ ÇÖZÜLDÜ (§13.14, 28.09.2026).** Aşağıdaki boşluk artık KAPALI:
> `POST /races/:id/settle` yarışı koşar, ödülleri dağıtır ve
> `races.status = 'finished'` yazar. `race_finished` + `prize_won`
> üretiliyor. Geriye yalnızca **`race_starting`** kaldı — ve o bir kod
> eksiği değil, **zamanlayıcı** eksiğidir. Bu bölüm tarihsel kayıt olarak
> duruyor.

`race_starting`, `race_finished`, `prize_won` "bildirim yazılmamış" türler
DEĞİLDİR. **Bunlar, üretecekleri OLAYIN kendisi var olmadığı için
yapılamıyor.** Tarama şunu gösterdi:

- `race-lobby.controller.ts` yalnızca BEŞ uç nokta sunar:
  `GET /races`, `POST /races`, `POST /races/:id/join`, `POST /races/:id/ready`,
  `POST /races/:id/leave`. **`start`/`finish` YOKTUR.**
- `races.status = 'finished'` yazan yalnızca İKİ yol vardır ve ikisi de lobi
  yarışı DEĞİLDİR: `run-practice-race.use-case.ts` (tek kişilik pratik) ve
  `join-matchmaking-queue.use-case.ts` (PvP eşleştirme, `pvp_matches`).
- `races.prize_pool` yalnızca İKİ yönde hareket eder: `join` **artırır**,
  `leave` **azaltır**. **Havuzu kazanana ÖDEYEN bir kod yolu YOKTUR.**

Sonuç: **ücretli lobi yarışı kurulabiliyor, katılınabiliyor, hazır
olunabiliyor — ama hiç KOŞMUYOR ve ödül DAĞITILMIYOR.** Bu, "PHASE 1 Race
Entry + Paid Race DONE" ve "PHASE 5 Prize Pool + Multiplier DONE"
ifadelerinin yanıltıcı olduğu yerdir: **havuzun MATEMATİĞİ doğru ve
test edilmiş (§13.10), ama havuzun ÖDENMESİ yok.** İkisi aynı şey değildir.

**Bunun bedeli yalnızca bildirim değildir:** oyuncu giriş ücretini ödeyip
havuzu büyütüyor ve o para **hiçbir zaman geri dönmüyor** (tek çıkış yolu
`leave` — yani yarışa hiç girmemek). Bu, brief §3/§4'ün para döngüsünü
yarıda keser.

**Sıradaki iş budur — ve bir bildirim dilimi DEĞİLDİR.** Ödül dağıtımı:
(a) lobi yarışının sonucunu üretmek (race engine'i ÇAĞIRIR — engine'e
DOKUNMAZ, ama çok atlı bir koşuyu sürmek yeni bir use-case'tir),
(b) `prize_pool`'u kademelere bölüp kazananlara `FOR UPDATE` + defter
kaydıyla ödemek. (b) tek başına `gift`/`market` ile AYNI şablondur; asıl iş
(a)'dır ve **kendi dilimini hak eder**. `race_finished`/`prize_won`
bildirimleri o dilimin İÇİNDE, aynı transaction'da doğar (kural §13.13).

**`race_starting` AYRICA bir ZAMANLAYICI ister** (cron/worker yok —
`CLAUDE.md` "bilinen açık uçlar"): "yarış birazdan başlıyor" bildirimi,
zamanı gelince birinin onu ÜRETMESİNİ gerektirir. Bugün sunucuda zamanla
tetiklenen hiçbir iş yoktur.

**"Bildirimler bitti" DEME — ama "bildirimler yapılamıyor" da DEME.**
Doğru cümle: *kalan üç tür, eksik olan bir YARIŞ SONUÇLANDIRMA dilimine
bağlı.*

#### 13.14 ÖDÜL DAĞITIMI — `POST /races/:id/settle` (28.09.2026)

**Bu dilim §13.13.2'nin açtığı boşluğu kapatır: oyuncunun ödediği giriş
ücreti artık geri dönebiliyor.**

Uç nokta: `POST /races/:id/settle` → 200 `RaceSettlementResult`.
Yetki: **kimliği doğrulanmış HERHANGİ bir oyuncu** (katılımcı olmak
zorunda değil). Gövde yok, `Idempotency-Key` yok. `@RateLimit` 10/60sn.

**NEDEN "CRANK" — ve neden katılımcı şartı YOK.** Projede zamanlayıcı/cron/
worker YOKTUR (`CLAUDE.md` "bilinen açık uçlar"). Yarışı "kendiliğinden"
koşturacak bir yer olmadığı için koşma işi bir uç noktaya verildi ve
çağıranın kim olduğu **önemsiz** kılındı: ilk gelen koşturur. Katılımcı
şartı koysaydık, yarışın koşması tek bir oyuncunun oyuna girmesine bağlı
kalırdı — ki o oyuncu hiç girmeyebilir. Zararı yoktur: uç para
YARATMAZ, yalnızca zaten var olan havuzu dağıtır ve sonucu
`races.status` belirler.

**NEDEN `Idempotency-Key` YOK — tekrar koruması DURUM GEÇİŞİDİR.**
`settleLobbyRace` transaction'ın başında `races` satırını `FOR UPDATE` ile
kilitler ve `checkRaceSettleable` çağırır: `status !== 'scheduled'` ise
`RaceNotSettleableError` (409 `RACE_NOT_SETTLEABLE`). İkinci çağrı bu
kapıya çarpar, yani **ikinci bir ödeme yapısal olarak imkânsızdır.**
Yeni bir idempotency altyapısı gerekmez; anahtar üretmek, var olan bir
garantiyi ikinci kez (ve daha zayıf biçimde) ifade ederdi.

**KAPI: `checkRaceSettleable` (`domain/race/lobby.ts`)** — `checkRaceJoinable`/
`checkEntryReadyable`/`checkRaceLeavable`'ın **TAM TÜMLEYENİ**: aynı
`startTime` sınırı, ters yön (arada boşluk yok, örtüşme yok). Reddetme
nedenleri: `NOT_SCHEDULED` (zaten koştu/iptal), `NOT_STARTED` (henüz
başlamadı), `NO_PARTICIPANTS` (havuz ve kazanan yok). **`minPlayers`
BİLEREK dayatılmaz:** `startTime`'dan sonra `leave` engellidir
(`ALREADY_STARTED`), yani katılımcı sayısını eşiğin altında bırakan bir
yarışta `minPlayers` dayatmak giriş ücretlerini **kalıcı olarak**
hapsetmek olurdu.

**SEED KESİNLEŞMEDE DOĞAR** (`randomUUID()`), `raceId` DEĞİL: `raceId`
herkese açıktır ve yarışı açan oyuncu seed'i önceden bilirse sonucu
önceden hesaplayabilirdi. `races.simulation_seed` koşma anında yazılır ve
`GET /races/:id/timeline` onu açığa çıkarır (replay).

**PARA YOLU (tek transaction):** `races` FOR UPDATE → durum kapısı →
`prize_pool` **TRIPWIRE** (kilitli değer, use-case'in hesapladığı havuzla
birebir eşleşmeli) → kadro **TRIPWIRE** (kilitli `race_entries` kümesi,
simüle edilen kadroyla birebir) → `players` **leksik id sırasıyla**
FOR UPDATE → `credit()` + `economy_transactions`
(`type: 'lobby_race_prize'`) → gerçek satırlara sonuç UPDATE'i + segmentler
→ bot satırları INSERT + segmentler → `races.status = 'finished'` + seed +
sürümler → **aynı transaction'da** `notifications`
(`race_finished` her gerçek katılımcıya, `prize_won` yalnızca ödeme
yapılana).

**`race_entries.status` DEĞİŞTİRİLMEZ.** `race_entries_status_valid`
CHECK'i (migration 0037) yalnızca `NULL | waiting | ready | not_ready |
cancelled` kabul eder — **`finished` diye bir değer YOKTUR.** Sonuç
`finish_position`/`final_time_ms`/`horse_snapshot` sütunlarında yaşar.

**ÖDEME SIRAYA GÖRE, SIRAYI SİMÜLASYON BELİRLER.** Paylar
`config/economy.config.json` → `prizeDistributions[race-lobby.
prizeDistributionId]` (`top5`: `[0.375, 0.225, 0.15, 0.1, 0.05]`, toplam
`1 − raceRake`). Repository `prize_pool`'u kilitleyip **yeniden okur** ve
tutarları `computePrizePayouts` ile hesaplar — use-case'in gönderdiği
tutarlara GÜVENMEZ.

**⚠️ BOT PAYI YANAR — bilinçli.** Kadro `fieldSize`a botlarla tamamlanır
(`aiFillEnabled`); botların `player_id`'si yoktur, dolayısıyla bota düşen
ödül kimseye ödenmez. Aksi hâlde bir oyuncu kendi yarışını açıp TEK
gerçek katılımcı olarak havuzun çoğunu geri alabilirdi (kendi kendini
besleyen para döngüsü). Sonucu: gerçek oyuncu sayısı azken yarış, oyuncu
için KAYIPTIR. `race-settlement.e2e-spec.ts` "botsuz saha" testi bu yüzden
ayrıca koşar — orada dağıtım tam eşitlikle ölçülür.

**⚠️ BİLİNEN AÇIK PENCERE — snapshot `startTime`'da DEĞİL, kesinleşme
anında alınır.** Oyuncu `startTime` ile kesinleşme arasında atını
çalıştırıp sonucu etkileyebilir. Kapatmak `startTime`'da tetiklenen bir
zamanlayıcı gerektirir; projede yok. `SettleRaceUseCase` doc yorumunda
yazılıdır.

**Kanıt:** `race-settlement.e2e-spec.ts` (12 test). Çekirdek iddia PARA
KORUNUMUDUR: *kesinleşmeden önceki toplam oyuncu parası + dağıtılan ödül =
kesinleşmeden sonraki toplam oyuncu parası* — ve botsuz sahada dağıtılan
toplam `computePrizePayoutTotal(pool, shares)`e **tam eşittir**. Ayrıca:
ikinci çağrı 409 + ikinci defter satırı YOK; reddedilen her yol
(NOT_STARTED / NO_PARTICIPANTS / 404 / 401 / 400) için para hareketi YOK;
defter satırı yanıttaki tutarla **birebir**; koşmayan üçüncü oyuncuya
bildirim YOK. Domain tarafı `lobby.spec.ts`'te 8 test (tümleyenlik,
sınır, kontrol sırası, saflık).

---

#### 13.15 SOSYAL PROFİL — `GET /players/profile/:username` (28.09.2026)

**brief §24 "SOCIAL PROFILE"** — kullanıcı profili `/profile/:username`
şeklinde görüntülenebilsin.

Uç nokta: `GET /api/v1/players/profile/{username}` → 200
`PlayerProfileView`. **TOKEN GEREKMEZ** (`@Public()`), `@RateLimit`
60/60sn, **IP başınadır** (herkese açık rotada `request.player` yoktur,
oyuncu başına anahtarlama mümkün değildir).

**NEDEN `username`, `id` DEĞİL:** §24 adresin paylaşılabilir olmasını
ister — "profilin şu adreste" denebilmelidir. `GET /players/:id` ZATEN
vardır ve **yalnızca kendi profilini** döner (`assertSelf`, başkasının
id'si → 403), çünkü `PlayerSummary` + **bakiye** döner. İki uç
ÇELİŞMEZ: biri `PlayerSummary` (sahibine, bakiyeli), diğeri
`PlayerProfileView` (herkese, bakiyesiz). Yeni uç `GET /players/:id`'nin
kendi-profil kuralını **gevşetmez** — e2e bunu ayrıca sınar.

**⚠️ PARA SIZINTISI BU DİLİMİN ASIL RİSKİYDİ.** Profil herkese açık
olduğu için unutulan tek bir bakiye alanı doğrudan bir sızıntı olurdu
(AUDIT_REPORT.md Bulgu S4). Bu yüzden `PlayerProfileView` alanları
`PlayerSummary`'den `Pick`/`Omit` ile **türetilmez**, AÇIKÇA yazılır:
`PlayerSummary`'ye yarın bir bakiye alanı eklenirse bu tip onu
kendiliğinden ALMAZ. Test de alanın varlığını değil **YOKLUĞUNU** sınar
(`not.toHaveProperty`) ve ayrıca gövdenin **tamamının** anahtar listesini
birebir karşılaştırır — yeni bir gizli alan eklenirse test kırmızı olur.

**`isSelf` BİLİNÇLİ OLARAK YOK.** Uç `@Public()`'tir ve global `AuthGuard`
herkese açık rotalarda token'ı **hiç ayrıştırmadan** `true` döner
(`auth.guard.ts`), yani sunucuda "isteyen kim" bilgisi YOKTUR. Bunu
mümkün kılmak, kimlik doğrulamayla ilgili KÜRESEL bir guard'ı tek bir
görünüm alanı için gevşetmek olurdu. İstemci kendi oyuncu id'sini zaten
taşır; `playerId` ile karşılaştırmak tek satırdır.

**`careerTier` DE YOK** — sunucuda saklanmaz, `level`'in saf sunum
türevidir (`apps/web/src/features/career/career-tier.ts`). Aynı eşikleri
sunucuda ikinci kez hesaplamak, iki kopyanın zamanla ayrışması demekti.

**`achievements: null`** — §24'ün istediği ama **henüz var olmayan**
alandır (kalıcı başarım modeli + migration gerektirir; `career-tier.ts`
zaten aynı kararı yazılı tutuyor). Alanın ŞİMDİDEN var olması, istemcinin
"geldi mi gelmedi mi" tahminini ortadan kaldırır ve dizi dolduğunda
sözleşme DEĞİŞMEZ.

**`stats` yalnızca KESİNLEŞMİŞ yarışları sayar** (`races.status =
'finished'`) — lobide bekleyen bir yarış istatistiğe girmez.
`podiumCount` birincileri de kapsar (`finish_position <= 3`).
`friendCount` arkadaşlık çiftinin **iki ucunu** da sayar
(`player_low_id`/`player_high_id`, kanonik çift); `giftCount` yalnızca
**gelen** hediyelerdir (`gift_sends.recipient_id`).

**400 ↔ 404 AYRIMI BİLİNÇLİDİR.** Şekli bozuk ad (`AB`, `Buyuk_Harf`,
`a`, `bosluk var`) → `400 VALIDATION_ERROR`; şekli geçerli ama alınmamış
ad → `404 PLAYER_NOT_FOUND`. "Bu ad hiçbir zaman var olamaz" ile "bu ad
henüz alınmamış" istemci için farklı cevaplardır. Doğrulama **domain'de**
(`validateUsername`, kayıt akışının kullandığı AYNI fonksiyon), DTO'da
değil: CLAUDE.md "Kardeş tuzak" — esbuild altında gövde doğrulaması
atlanır, üstelik bu bir yol parametresidir ve `ParseUUIDPipe` uygulanamaz.

**Kanıt:** `player-profile.e2e-spec.ts` (6 test). Çekirdek iddialar:
(a) istek **hiçbir yerde** `Authorization` başlığı göndermez ve 200 alır —
`@Public()` kararının ölçümü budur; (b) `money`/`gems` yoktur ve gövdenin
anahtar listesi birebir sabittir; (c) sayılar **gerçek** yarıştan gelir
(`POST /races` → `join` → `settle` üretim yoluyla) ve kazanma iddiası
**gözleme** dayanır — test "kazandı" varsaymaz, "kazandıysa 1, kaybettiyse
0" der, çünkü sıra simülasyonun sonucudur; (d) arkadaşlık ve hediye
sayıları gerçek uçlarla kurulur; (e) yeni uç `GET /players/:id`'yi
gevşetmez.

---

#### 13.16 BLOK / ŞİKÂYET — sosyal moderasyon (brief §33, §42 PHASE 15) — 28.09.2026

**Ne yapıldı.** Brief §33 ("Block/Report User") uçtan uca bağlandı. Dört yeni
uç nokta (`POST`/`DELETE`/`GET /players/:id/blocks`, `POST /players/:id/reports`),
iki yeni tablo (`player_blocks`, `player_reports`, migration **0040**), yeni
domain modülü (`domain/social/moderation.ts`), dört use-case, iki DTO ve
**yazma yollarına dört kapı** eklendi.

**Bu dilim PHASE 15'in İLK yarısıdır.** İkinci yarı (brief §34 — yönetim
paneli, şikâyet kuyruğu ekranı, `admin` rolü, denetim günlüğü) **YAPILMADI**;
`player_reports.status` bu yüzden bu dilimde HER ZAMAN `'open'`dır ve
`reviewing`/`resolved`/`dismissed` geçişlerini yapacak hiçbir kod yoktur.

**ENGELLEME YÖNLÜDÜR — kanonik çift YOK.** `friendships`in aksine
`(blocker_id, blocked_id)` sıralı bir çifttir; A→B ile B→A iki AYRI satırdır.
Yazma yollarının sorduğu soru "A, B'yi engelledi mi" değil **"aralarında
herhangi bir yönde engel var mı"**dır → `isBlockedBetween`, tek sorguda iki
yön. Bu yüzden `blocked_id` üzerinde ayrı indeks şarttır (PK yalnızca
`blocker_id` ile başlar ve ters yönü tarayamaz).

**YÖN SIZDIRILMAZ.** Engelleyen de engellenen de **403 `PLAYER_BLOCKED`** alır
— tek kod, iki yön. Yönü ayırt eden ikinci bir kod, engellenen oyuncuya "seni
engelledi" bilgisini verirdi; engellemenin amacı tam olarak **sessiz bir
mesafedir**. Aynı gerekçeyle **"beni engelleyenler" listesi bilinçli olarak
YOKTUR**; `GET /players/:id/blocks` yalnızca tek yönü (benim engellediklerim)
döner. `moderation.spec.ts` bunu bir iddiayla sabitler: hata mesajı
`/engelledi|engellendi|seni/i` ile EŞLEŞMEMELİDİR — mesajı "düzeltmek"
isteyen gelecekteki bir değişiklik testi kırar.

**ENGEL NE KAPATIR.** `messages`, `gifts`, `race-invites` (brief'in saydığı
üçü) **+ `friend-requests`** — dördüncüsü **bilinçli bir sapmadır**. Brief
arkadaşlık isteğini saymaz; sayılmasaydı engel gerçek bir delik bırakırdı:
engellenen oyuncu davet edilemediği hâlde istek göndermeye devam edebilir,
yani engelin kapattığı tek şey rahatsızlığın bir biçimi olurdu.

**HEDİYE YOLUNDA KAPI TRANSACTION İÇİNDEDİR.** Engelleme arkadaşlık satırını
silmediği için `areFriends` kapısı engelli bir çiftte **geçer**. Para yolu
olduğundan asıl kapı `PostgresGiftRepository.sendGift`in kilitli
transaction'ında `assertGiftAllowedByFriendship`ten hemen sonra tekrarlanır.
`moderation.e2e-spec.ts` bunu yalnızca 403 ile değil, **403 sonrası bakiye ve
`economy_transactions` satır sayısı DEĞİŞMEDİ** diye doğrular: kapı
transferden sonra olsaydı kod yine 403 dönerdi ama para çoktan hareket
etmiş olurdu — bu, hiçbir yerde hata üretmeyen bir para sızıntısıdır.

**ENGEL ARKADAŞLIĞI VE MESAJ GEÇMİŞİNİ SİLMEZ.** Engelleme **EK bir
kapıdır**, mevcut ilişkinin yerine geçmez. Aksi hâlde engeli kaldıran oyuncu
arkadaşlığını da kaybetmiş bulurdu — geri alınamayan bir yan etki. Sonuç:
`DELETE .../blocks/:blockedId` sonrası mesajlaşma **kendiliğinden** açılır;
e2e bunu ölçer (engel → 403, engel kaldır → 201, arkadaşlık sayısı hâlâ 1).

**İDEMPOTENTLİK AYRIMI BİLİNÇLİ.** Engel **koymak** idempotenttir: tekrar
çağrı 201 döner ve **var olan** `blockedAt`i verir, yeni satır yazmaz —
istenen sonuç zaten geçerliyse çift tıklayan istemciye 409 vermek anlamsız
olurdu. Bunu `ON CONFLICT DO NOTHING` ile yapmak MÜMKÜN DEĞİLDİ, çünkü
kullanıcıya dönecek tarih uydurulamaz: use-case kendi `new Date()`ini bassaydı
ikinci çağrı YANLIŞ (daha yeni) bir tarih döndürürdü. Çözüm: `ON CONFLICT
(blocker_id, blocked_id) DO UPDATE SET blocked_id = player_blocks.blocked_id
RETURNING created_at` — kasıtlı bir no-op yazma, yalnızca `RETURNING`in
ateşlenip var olan satırın tarihini döndürmesi için. Engel **kaldırmak** ise
idempotent DEĞİLDİR: silme işlemi olarak 404 `BLOCK_NOT_FOUND` döner ve
istemciye bayat bir listeyle çalıştığını söyler. **Şikâyet idempotent
DEĞİLDİR**: iki kez gönderilirse iki satır yazılır, çünkü tekrarlayan şikâyet
moderasyon için başlı başına bir sinyaldir.

**ŞİKÂYET ARKADAŞLIK GEREKTİRMEZ ve `assertNoBlock` ÇAĞIRMAZ** — ikisi de
bilinçli. Arkadaşlık aransaydı yalnızca arkadaşlar birbirini şikâyet
edebilirdi; asıl şikâyet edilmesi gerekenler çoğu zaman arkadaş olunmayanlar.
`assertNoBlock` çağrılsaydı engelleme şikâyeti de kapatırdı: oyuncu birini
engellediği anda onu şikâyet etme hakkını kaybederdi — oysa doğru sıra tam
tersidir (engelle, **sonra** şikâyet et).

**KATEGORİLER:** `spam`, `harassment`, `cheating`, `offensive_name`, `other`.
Tek kaynak `domain/social/moderation.ts → REPORT_CATEGORIES`dir;
`ReportPlayerDto`daki `@IsIn` listeyi oradan okur (ikinci kopya yok) ama
**otorite değildir** — esbuild altında dekoratörler atlanır, gerçek doğrulama
`parseReportCategory`dedir. `other` bilinçli olarak vardır: kapalı bir liste,
beklenmeyen bir durumun bildirilememesi demek olurdu.

**`reason` İSTEĞE BAĞLIDIR ve BOŞ → `null`.** Boş/yalnızca boşluk gerekçe 400
DEĞİLDİR; `null` yazmak "gerekçe yok" ile "boş gerekçe" arasındaki
veritabanında ayırt edilemeyen durumu ortadan kaldırır. Azami uzunluk
`social.config.json → reportReasonMaxLength` (500) ve ölçüm **kod noktası**
sayar (`[...str].length`) — `normalizeMessageBody` ile AYNI gerekçe: JS
`str.length` UTF-16 birimi sayardı ve sunucu, veritabanının kabul edeceği
geçerli bir gerekçeyi reddederdi.

**BİLDİRİM ÜRETİLMEZ.** Diğer tüm yazma yollarının aksine engelleme karşı
tarafa bildirim yazmaz; "seni engelledi" haberi engellemeyi sessiz bir
mesafe olmaktan çıkarıp sosyal bir sinyale (ve misilleme tetikleyicisine)
çevirirdi. Şikâyet de bildirim üretmez — yalnızca moderasyon kuyruğuna düşer.
Bu yüzden `blockPlayer` bir `withTransaction` gövdesi GEREKTİRMEZ.

**Kanıt.** `apps/api/test/api/moderation.e2e-spec.ts` — engelin iki yönde
mesaj/hediye/davet/istek yolunu kapatması; engel kaldırılınca yolun
kendiliğinden açılması ve arkadaşlığın yerinde kalması; idempotentliğin
**DB'de satır sayılarak** kanıtlanması ve ikinci çağrının AYNI `blockedAt`i
dönmesi; hediye 403'ünde bakiye+defter değişmezliği; şikâyetin arkadaşlık
gerektirmemesi ve engelden etkilenmemesi; tüm uçlarda `assertSelf` (403 IDOR)
ve 401. `apps/api/test/domain/social/moderation.spec.ts` — kategori listesi
ile migration CHECK'inin **dosya okunarak** karşılaştırılması (liste domain'de
genişleyip migration'da genişlemezse INSERT `23514` ile patlardı ve bu test
onu CI'da yakalar), kendini engelleme/şikâyet, gerekçe normalizasyonu,
yön sızdırmama.

**Uçlar:** `docs/API.md` → "Block / Report — Sosyal Moderasyon".

---

#### 13.17 YÖNETİM (ADMIN) — rol + denetim günlüğü + moderasyon kuyruğu (brief §34, §42 PHASE 15-B) — 28.09.2026

**BU, PHASE 15'İN İKİNCİ YARISIDIR ve brief §34'ün TAMAMI DEĞİLDİR.** §34
"Admin: Users Races Transactions Wallet Gifts Reports Chat Reports
görebilmeli. Race: Create Cancel Pause Finish işlemleri kontrollü şekilde
yapılabilmeli. Finansal işlemler audit log'a yazılmalı." der. Bu dilim
**rolü + denetim günlüğünü** kurar ve o temelin üzerine oturan **ilk**
ekranı getirir: şikâyet kuyruğu. Neden o? Çünkü §34'ün saydığı yedi
listeden **tek hazır verisi** olan odur — migration 0040 `status` alanını
bilinçli olarak bırakmıştı. **Users / Races / Transactions / Wallet /
Gifts / Chat Reports ekranları ile race Cancel/Pause/Finish kontrolleri
HENÜZ YOKTUR; PHASE 15 YARIMDIR.**

**Ne yapıldı.** Üç uç nokta: `GET /admin/reports` (moderasyon kuyruğu),
`PATCH /admin/reports/:reportId` (durum geçişi), `GET /admin/audit-log`
(denetim günlüğü okuma). Migration 0041: `players.is_admin` kolonu,
`admin_audit_log` tablosu (+ iki indeks), `player_reports.reviewed_by`/
`reviewed_at` kolonları. Yeni paylaşılan tipler
(`packages/shared-types/src/admin.ts`), yeni hata kodları
(`ADMIN_REQUIRED`, `REPORT_NOT_FOUND`, `INVALID_REPORT_STATUS`), yeni
config (`config/admin.config.json`) ve yeni domain modülü
(`domain/admin/`).

**ROL BİR KOLONDUR, TOKEN'A GÖMÜLMEZ — dilimin asıl kararı budur.**
`players.is_admin` her istekte okunur; yetkisi alınan bir yönetici elindeki
geçerli token'la erişmeye devam EDEMEZ. Rol JWT'ye konsaydı iptal ancak
token süresi dolunca etki ederdi. e2e bunu **aynı token'la** ölçer:
403 → kolon `true` → 200 → kolon `false` → 403. Ayrı bir `roles` tablosu
neden yok: bugün TEK rol var ve çoktan-çoğa ilişki "rol"ü her okumada JOIN
gerektiren bir *veri* hâline getirirdi.

**`config/admin.config.json` BİR YETKİ KAPISI DEĞİLDİR** — oradaki iki
değer yalnızca liste boyutudur. Config dosyaları kaynak kodla birlikte
dağıtılır; bir yetki kararını oraya koymak onu bir dağıtım hatasıyla açığa
çıkarılabilir hâle getirirdi.

**⚠️ YÖNETİCİ ATAMANIN ARAYÜZÜ YOKTUR (bilinçli).** Kendini yönetici
yapabilen bir uç nokta yönetim yetkisini anlamsız kılardı. Kolon şimdilik
elle açılır; **testler de `UPDATE players SET is_admin = true` ile yapar**
(`gift.e2e-spec.ts`in bakiyeyi `UPDATE` ile kurmasıyla aynı yöntem).
§34'ün "kullanıcı yönetimi" ekranı geldiğinde bu, denetim günlüğüne
yazılan bir işlem hâline gelmelidir.

**IDOR KAPISI — 403 ÖNCE, 404 SONRA.** `ReportNotFoundError` yetki
kontrolünden **sonra** fırlatılır. Aksi hâlde yönetici olmayan biri
kimlikleri deneyerek kuyrukta hangi kayıtların bulunduğunu öğrenebilirdi.
e2e tam olarak bunu doğrular: yönetici olmayan, **var olmayan** bir şikâyet
kimliği için 404 değil **403** alır.

**GEÇİŞ ÇİZGESİ KAPALI BİR DAG'DIR** (`domain/admin/moderation-queue.ts`):

```
open ──▶ reviewing ──▶ resolved
  │           └─────▶ dismissed
  ├─────────────────▶ resolved
  └─────────────────▶ dismissed
```

- `open`dan doğrudan kapanış serbesttir (bariz spam için ara adım zorunlu
  olmamalı).
- **`resolved`/`dismissed` ÇIKIŞSIZDIR.** Geri açılabilen bir kuyruk aynı
  şikâyetin iki sonucundan hangisinin geçerli olduğunu söyleyemez hâle
  gelirdi ve her geri açma günlükte geri alınamaz bir iz bırakırdı. Yanlış
  kapatılan şikâyet için doğru yol **yeni bir şikâyet**tir (şikâyet zaten
  idempotent değildir).
- `reviewing` → `open` de yasak: "kuyruğa geri koydum" ile "hiç
  dokunulmamış" ayırt edilemez hâle gelirdi.
- **AYNI duruma geçiş de yasak.** Bu idempotent bir çağrı değil, **bayat
  ekran** işaretidir; sessiz başarı `reviewed_at`i gereksiz ilerletir ve
  günlüğü gürültüye boğardı.

**GEÇİŞ KURALI KİLİDİN İÇİNDE ÇALIŞIR.** Mevcut durum yalnızca `FOR UPDATE
OF r` altında okunduğunda güvenilirdir; dışarıda okunan bir `status` ile
karar vermek iki yönetici aynı şikâyeti farklı durumlara çektiğinde yarış
koşuluna düşerdi — ikisi de `open` okur, ikisi de geçerli bir geçiş
hesaplar, son yazan kazanır ve **arada bir geçiş kaybolur**. Kural bir
callback olarak repository'ye geçer: domain fonksiyonu framework'süz
kalır, çağrıldığı yer transaction'ın içidir.

**DENETİM KAYDI GÜNCELLEMEYLE AYNI TRANSACTION'DA YAZILIR.** Ayrı bir
`INSERT` olsaydı geri alınmış bir güncellemenin kaydı ortada kalırdı ve bu
**hiçbir yerde hata üretmezdi**. e2e bunu yalnızca HTTP koduna bakarak
değil, yasak bir geçişten sonra **hem durumun hem `admin_audit_log` satır
sayısının değişmediği** gösterilerek doğrular — yani rollback gerçekten
çalışıyor.

**⚠️ `admin_audit_log` ≠ `economy_transactions`.** O bir **muhasebe
defteri**dir (bakiye hareketi, `balance_before`/`balance_after`); bu bir
**yetki kaydı**dır ("kim hangi yönetim işlemini ne zaman yaptı"). Bir
yönetici şikâyet kapatırsa para hareket etmez ama burada satır olur; bir
oyuncu hediye gönderirse deftere satır olur ama burası boş kalır. İkisini
birleştirmek defteri "yönetici eylemleriyle kirlenmiş bir bakiye
tablosu"na çevirirdi. `admin_id` **`ON DELETE RESTRICT`** (denetim kaydı
denetlenen kişi silinince yok olamaz); `player_reports.reviewed_by` ise
**`SET NULL`** — orada kayıt şikâyete bağlıdır, yönetici yalnızca bir
değişkendir.

**KUYRUK TÜM ŞİKÂYETLERİ DÖNER**, yalnızca `open` olanları değil: kuyruk
bir iş listesi değil bir **kayıt görünümü**dür; "bu oyuncu daha önce
şikâyet edilmiş miydi" sorusu ancak kapanmış kayıtlar görülerek
yanıtlanır. Sunucuda `status` süzgeci tekrarlayan-şikâyet tespitini
imkânsız kılardı. Sorgu parametresi de yoktur (doğrulanmamış bir
parametreyi SQL `WHERE`ine sokmamak için). Görünen adlar JOIN ile gelir
(N+1 yasak) ve `reviewer` JOIN'i **`LEFT`tir** — henüz ele alınmamış
şikâyetler kuyruğun çoğunluğudur ve `INNER JOIN` onların tamamını
düşürürdü.

**BAYAT KOLON NOTU DÜZELTİLDİ.** Migration 0040 `status` için "şu an
yalnızca 'open' yazılır; geçişler yönetim paneli diliminde gelecek"
diyordu; bu dilim o geçişleri getirdi. **0040 dosyası DEĞİŞTİRİLMEDİ**
(uygulanmış bir migration'ın içeriğini değiştirmek onu bir kez koşmuş
ortamlarda sessizce farklı bir şemaya işaret eder); düzeltme 0041'de
`COMMENT ON COLUMN` ile yapıldı.

**`REPORT_STATUSES` ↔ DB CHECK.** Domain listesi `player_reports.status`
CHECK'iyle birebir olmak zorundadır; `moderation-queue.spec.ts` migration
dosyasını **okuyarak** karşılaştırır (`REPORT_CATEGORIES` için
`moderation.spec.ts` ile aynı desen). Liste domain'de genişleyip
migration'da genişlemezse `UPDATE` `23514` ile patlar ve yönetici 400
yerine 500 görürdü.

**`IdempotencyInterceptor` yok** (para/mülkiyet değişmez) ve **`PATCH`in
kendi koruması geçiş çizgesidir**: `resolved` → `resolved` zaten 400'dür,
yani tekrarlanan bir istek ikinci bir denetim kaydı üretemez.

**Kanıt.** `apps/api/test/api/admin.e2e-spec.ts` — (a) yönetici olmayan üç
uçta da 403 `ADMIN_REQUIRED` ve **var olmayan kimlik için 404 değil 403**;
(b) rol DB'den okunur, aynı token kolon değişince anında yetki
kazanır/kaybeder; (c) geçerli geçiş durumu değiştirir ve günlüğe
`{from,to}` yazar; (d) yasak ve aynı-duruma geçiş 400 döner, **ne durum ne
denetim kaydı değişir**; (e) kapanmış şikâyetler kuyrukta kalır;
(f) token'sız istek 401, geçersiz UUID 400.
`apps/api/test/domain/admin/moderation-queue.spec.ts` — durum listesinin
migration CHECK'iyle dosya okunarak karşılaştırılması, çizgenin kapalılığı
ve terminal durumları, çizgede olmayan **her** çiftin reddi, aynı-durum
reddi, `assertAdmin`, config sabitlemesi.

**Koşu.** `verify-admin.mjs` ile: temiz şema (`DROP SCHEMA` + migrate
0041 dahil) → tsc ×4 → vitest domain 8 dosya/187 test → vitest e2e 3
dosya/72 test → eslint. Hepsi geçti; commit
`1adf537ab8845be6fe311249409d9194485e91dc` push edildi ve `git ls-remote`
ile doğrulandı.

**Uçlar:** `docs/API.md` → "Yönetim (Admin)".

---

#### 13.18 YÖNETİM OKUMA EKRANLARI — Users / Races / Transactions (+ Wallet, Gifts) (brief §34, §42 PHASE 15-B) — 28.09.2026

**BU, §13.17'NİN ÜZERİNE OTURUR ve §34'ün "Admin: Users Races
Transactions Wallet Gifts Reports Chat Reports görebilmeli" cümlesinin
`Reports` DIŞINDAKİ kısmını KAPATIR.** Üç yeni okuma ucu:
`GET /admin/players`, `GET /admin/races`, `GET /admin/transactions`.

**YEDİ LİSTE, ÜÇ UÇ NOKTADIR — bu bilinçlidir.** brief yedi liste sayar
ama üçü ayrı bir varlık DEĞİLDİR:
- **Wallet = Users.** Cüzdan ayrı bir tablo değil, `players.money` /
  `players.gems` kolonudur (migration 0001). Ayrı bir uç açmak aynı
  satırları iki yanıttan sunmak ve ikisinin kaymasına izin vermek olurdu.
- **Gifts = Transactions.** Hediye ayrı bir defter değil, `type =
  'gift_send'` olan bir `economy_transactions` satırıdır (migration
  0034).
- **Chat Reports = YOK.** Sohbet mesajına bağlı bir şikâyet kavramı
  projede MEVCUT DEĞİLDİR: `race_messages` (0035) mesajları tutar ama
  `player_reports` (0040) bir mesaja değil bir OYUNCUYA bağlıdır ve
  `category = 'spam'` bunun en yakın karşılığıdır. Yeni bir tablo
  uydurmak yerine boşluk burada AÇIKÇA kaydedilir.

**BU ÜÇ UÇ BAKİYE TAŞIR.** `GET /players/profile/:username`in "para
sızdırma" kuralı (AUDIT Bulgu S4) burada GEÇERSİZ DEĞİLDİR, TERSİNE
uygulanır: o uç `@Public()` olduğu için bakiyeyi gizler, bunlar yetki
kapısı arkasında olduğu için gösterir. Kapı use-case'lerin İLK
satırıdır (`assertAdmin`), limit config'tendir
(`playerListLimit`/`raceListLimit`/`transactionListLimit`).

**BIGINT TUZAĞI — BU DİLİMİN EN SOMUT RİSKİ.** `money`, `xp`, `gems`,
`amount`, `entry_fee`, `prize_pool`, `balance_before/after` ve `COUNT(*)`
PostgreSQL'de `int8`dir ve `pg` sürücüsü bunları **METİN** döner
(hassasiyet kaybını önlemek için). Dönüşüm unutulsaydı yanıt
`"money": "1234"` olurdu ve **hiçbir yerde hata üretmezdi** — istemci `+`
operatörünü birleştirme olarak kullanırdı. Dönüşüm tek bir `toNumber()`
yardımcısında toplanır; e2e `typeof === 'number'` iddia eder.

**`joinedPlayers` SAYIMI `IS DISTINCT FROM 'cancelled'` KULLANIR, `<>`
DEĞİL.** Ayrılan oyuncunun satırı SİLİNMEZ, `cancelled` işaretlenir
(migration 0037) ve `status` sunucu üretimi girişlerde **NULL**'dır —
`<>` NULL'lı satırları düşürürdü. `LEFT JOIN LATERAL` ile tek sorguda
sayılır (N+1 yasak). `created_by` JOIN'i `LEFT`tir: sunucu üretimi
yarışların oluşturucusu yoktur ve `INNER JOIN` onları listeden
düşürürdü; yarısı dolu bir `AdminPlayerRef` üretmemek için ad JOIN'de
yoksa `createdBy: null` döner.

**SIRALAMA `created_at DESC, id DESC`.** `created_at` TEK BAŞINA
deterministik değildir (aynı milisaniyede doğan iki hesap yer
değiştirebilir ve `LIMIT` hangi satırı kırptığı belirsizleşir); ikincil
anahtar bu belirsizliği kapatır.

**YAZMA YOLU YOKTUR.** brief §34 "Race: Create Cancel Pause Finish
işlemleri kontrollü şekilde yapılabilmeli" der; bu dilim YALNIZCA
GÖRÜNTÜLEME ayağıdır. `Cancel` bilinçli olarak eklenmedi: katılım
ücretlerinin iadesi + aynı transaction'da defter kaydı + denetim
günlüğü gerektirir, yani bir PARA YOLUDUR. **`Pause` ise bugün
MÜMKÜN DEĞİLDİR:** `races.status` CHECK'i
`scheduled|in_progress|finished|cancelled`tır ve `in_progress`u YAZAN
HİÇBİR KOD YOKTUR — yarış `scheduled`dan doğrudan `finished`a geçer
(`SettleRaceUseCase`). Yani "duraklatılacak koşan bir yarış" kavramı
sunucuda yoktur; `paused` eklemek yeni bir durum makinesi kurmaktır.

**KANIT:** `admin.e2e-spec.ts` — (a) yönetici olmayan ALTI uçta da 403
`ADMIN_REQUIRED` ve hata zarfı `data` TAŞIMAZ, (b) bakiye/limit alanları
`number`, (c) en yeni kayıt önce, (d) `createdBy: null` satır listeden
DÜŞMEZ, (e) `joinedPlayers` iptali saymaz ama NULL'ı sayar, (f) defter
değişmezi `balanceAfter = balanceBefore + amount` yanıtta da geçerli.
`moderation-queue.spec.ts` ayrıca `AdminConfig`in TÜM limit
anahtarlarını `config/admin.config.json` ile karşılaştırır ve sabitlenen
liste config dosyasını TAM kapsamak zorundadır (yeni bir limit eklenip
listeye yazılmazsa CI KIRILIR).

**Uçlar:** `docs/API.md` → "Yönetim (Admin)".

⚠️ **Yukarıdaki "YAZMA YOLU YOKTUR" paragrafı 28.09.2026 akşamı BAYATLADI**
— `Cancel` yazıldı (§13.19). `Pause` hakkındaki kısım hâlâ geçerlidir.

#### 13.19 YARIŞ İPTALİ — `POST /admin/races/:raceId/cancel` (brief §34 "Cancel", §42 PHASE 15-B) — 28.09.2026

**§34'ün "Race: Create Cancel Pause Finish işlemleri kontrollü şekilde
yapılabilmeli" cümlesinin `Cancel` ayağı.** §13.18'in üzerine oturur ve
`AdminController`'a **YEDİNCİ** uç noktayı ekler.

**ÜÇÜN MUHASEBESİ — hiçbiri "yapılmadı" diye geçiştirilmez:**

| §34 | Durum |
|---|---|
| `Cancel` | **YAZILDI** — `POST /admin/races/:raceId/cancel` (para yolu) |
| `Finish` | **YAZILDI ama yönetime özel DEĞİL** — `POST /races/:id/settle` (§13.14) |
| `Pause` | **MÜMKÜN DEĞİL** — duraklatılacak durum yok (aşağıda) |

`Finish` için ikinci bir uç **eklenmedi**: ödül dağıtımı zaten yetki
gerektirmeyen bir "crank"tir ve yanına `POST /admin/races/:id/finish`
koymak aynı işi iki kod yolundan yapmak olurdu.

**`Pause` İMKÂNSIZDIR — ve bu bir EKSİKLİK DEĞİL, ŞEMADIR.** `races.status`
CHECK'i `scheduled|in_progress|finished|cancelled`tır (migration 0006) ve
`in_progress`u **YAZAN HİÇBİR KOD YOKTUR**; yarış `scheduled`dan doğrudan
`finished`a geçer. Yani "koşan, duraklatılacak bir yarış" kavramı sunucuda
yoktur. Bu, yorumda iddia edilmekle kalmaz —
`test/domain/admin/race-cancel.spec.ts` **migration dosyasını okuyarak**
kanıtlar: CHECK listesinde `paused` olmadığını ve listenin `RaceStatus`
tipiyle **birebir** olduğunu doğrular. Migration'a `paused` eklenirse test
KIRILIR ve o gün Pause yazılabilir hâle gelir; sessizce "yapılmış gibi"
görünmez.

**YALNIZCA `scheduled` İPTAL EDİLEBİLİR.** Diğer üç durum → `409
RACE_NOT_CANCELABLE` (**409, 400 DEĞİL**: istek biçimsel olarak doğrudur,
çakışan bir DURUMdur). Tanınmayan bir durum da reddedilir
(`UNKNOWN_STATUS`): bilinmeyen bir durumu "iptal edilebilir" saymak
sessiz bir para hatası olurdu.

**`finished` NEDEN ÖZELLİKLE YASAK — bu dilimin en ince riski.** İptal
`finished`e izin verseydi, koşmuş ve ödülleri DAĞITILMIŞ bir yarışta iade
çalışırdı; iade tutarı defterden okunduğu için kazanana ödenen
`race_prize` değil, ödediği `lobby_race_entry_fee` bulunurdu — yani
**makul görünen ama YANLIŞ** bir tutar ödenirdi ve hiçbir yerde hata
çıkmazdı.

**ZAMAN KURALI YOKTUR.** `startTime` geçmiş ama hâlâ `scheduled` bir yarış
İPTAL EDİLEBİLİR; aksi hâlde havuz kalıcı olarak kilitlenirdi. "Eşzamanlı
iptal + settle" yarışı `races` satırındaki `FOR UPDATE` ile serileştirilir
(settle da aynı kilidi alır).

**İADE TUTARI DEFTERDEN OKUNUR, `races.entry_fee`DEN DEĞİL.** Her oyuncu
için en son `lobby_race_entry_fee` satırı bulunur, `-amount` iade edilir.
`entry_fee` sabitinden hesaplamak indirimli girmiş bir oyuncuya yanlış
tutar öderdi.

**BOT PAYI YANAR — İADE EDİLMEZ.** Botların `player_id`si yoktur; iade
yalnızca `player_id IS NOT NULL` satırlara yapılır ve
`refundedPlayers`/`refundedTotal` **yalnızca gerçek oyuncuları** sayar.
Havuz yine de sıfırlanır (`prize_pool = 0`), bu yüzden yanıt "havuz
sıfırlandı" değil **ne kadar iade edildi** bilgisini döner. (Bu, §13.14'ün
"gerçek oyuncu sayısı azken yarış oyuncu için kayıptır" notuyla AYNI
bilinçli tercihtir.)

**Katılımlar SİLİNMEZ, `cancelled` işaretlenir.** `race_entries_race_player_uq`
kısıtı `status`tan bağımsızdır; satırı silmek aynı oyuncunun yarışa
**yeniden katılmasına** kapı açardı.

**KİLİT SIRASI `races → race_entries → players`** ve giriş kilidi
`ORDER BY player_id` ile alınır (eşzamanlı iki iptal birbirini kilitlemesin
diye). **Durum kuralı da `FOR UPDATE` ALTINDA koşar**: repository'ye
`mutate` geri çağrısı geçirilir ve `checkRaceCancelable` orada çağrılır —
"iptal edilebilir mi" ile "iade et" arasında TOCTOU penceresi kalmaz.
Kuralı use-case'te (kilidin dışında) çalıştırmak, tam da bu dilimin
engellemeye çalıştığı çift iadeyi mümkün kılardı.

**Denetim kaydı AYNI transaction'da:** `admin_audit_log` →
`action = 'race.cancelled'`, `target_type = 'race'`,
`details = {from, to: 'cancelled', refundedPlayers, refundedTotal}`.
**Bildirim ÜRETİLMEZ**: eşleşen bir bildirim türü yoktur ve eklemek
migration + `notification-types.spec.ts` değişikliği gerektirirdi.

**`IdempotencyInterceptor` EKLENMEDİ — gerekçe DEĞİŞTİ.** §13.18'de
"buradaki rotalar para değiştirmez" deniyordu; iptal para taşıdığı için o
cümle artık geçersiz. Ama interceptor yine de yanlış çözümdür: çift iadeyi
engelleyen şey **zaten ve daha güçlü olarak** vardır — `scheduled →
cancelled` geçişi. İkinci istek `FOR UPDATE` altında yeni durumu görür ve
409 alır. `SettleRaceUseCase`in `Idempotency-Key` yerine durum geçişine
güvenmesiyle **aynı gerekçe**.

**`@RateLimit` 30/60sn** (`keyBy: 'player'`) — `PATCH`in 60'ından sıkıdır,
çünkü bu uç para hareket ettirir. Okuma uçlarında hâlâ limit yoktur.

**KANIT:** `admin.e2e-spec.ts` — (a) iki oyuncu × 250 iade,
`refundedPlayers: 2` / `refundedTotal: 500`, bakiyeler SQL ile doğrulanır,
(b) defter değişmezi (`balance_after = balance_before + amount`),
(c) `prize_pool = 0`, girişler `cancelled`, (d) denetim `details`i,
(e) bot payı iade EDİLMEZ (1 oyuncu, 250), (f) ücretsiz yarışta **HİÇ**
defter satırı yazılmaz, (g) ikinci iptal 409 + bakiye ve satır sayısı
DEĞİŞMEZ (denetim sayısı 1 kalır), (h) `finished` yarış 409 + hiçbir şey
yazılmaz, (i) olmayan yarış 404 `RACE_NOT_FOUND`, (j) bozuk uuid 400,
(k) yönetici olmayan 403 (var olmayan kimlik için bile 403, 404 değil) ·
`domain/admin/race-cancel.spec.ts` (kapalı eşleme, `UNKNOWN_STATUS`,
`paused`un migration okunarak kanıtlanması, hata mesajında tutar geçmemesi).

**Uç:** `docs/API.md` → "Yönetim (Admin)" → `POST /admin/races/{raceId}/cancel`.

#### 13.20 PHASE 16 — brief §31/§32 kanıt testi + sosyal yazma uçlarına hız sınırı (§42 PHASE 16) — 28.09.2026

**BU DİLİM YENİ BİR ÖZELLİK YAZMAZ.** brief §31 (anti-cheat: istemci
otorite değildir) ve §32 (beş işleme hız sınırı) kodda ZATEN
karşılanıyordu; eksik olan bunun **CI tarafından kilitlenmesiydi**.
Ayrıca §32'nin "spam engelle" maddesinin açıkta bıraktığı **üç sosyal
yazma rotası** kapatıldı.

**YENİ DOSYA: `apps/api/test/security/phase16-hardening.spec.ts`.**
`test/domain/` ALTINDA DEĞİL, çünkü `@nestjs/common` ve gerçek controller
sınıflarını import eder — `domain/` framework'süz saf TS olmak zorundadır
(CLAUDE.md kural 4). Ama e2e de DEĞİLDİR: DB/Redis/HTTP'ye dokunmaz, bu
yüzden hızlı grupta koşar.

**§32 — METADATA İLE KANIT, METİN ARAMA İLE DEĞİL.** `RateLimitGuard`
kararını `Reflector.getAllAndOverride(RATE_LIMIT_KEY, ...)` ile verir;
test de **aynı kanaldan** okur, böylece "testin gördüğü" ile "guard'ın
gördüğü" aynı şey olur. Kaynak metninde `@RateLimit` aramak, decorator
yorum satırına alındığında ya da başka bir sınıfa taşındığında **YEŞİL
kalırdı** — yani hiçbir şey kanıtlamazdı. Beş işlemin dördü
(Messages/Friend Requests/Gift/Race Join) böyle doğrulanır; **Chat** bir
WebSocket OLAYIDIR (`chat.message`), `@RateLimit` decorator'ı oraya
**uygulanamaz**, o yüzden kaynak okunarak doğrulanır.

**CHAT İÇİN ASIL İDDİA SIRA KANITIDIR:** `consumeChatQuota` çağrısı
`sendRaceMessageUseCase.execute` çağrısından **ÖNCE** gelmelidir. Sıra
tersine dönerse sınır yine "vardır" ama işe yaramaz: reddedilen mesaj
çoktan veritabanına yazılmış olurdu ve **hiçbir test kırmızı olmazdı**.

**KAPALI KÜME — §32'nin "spam engelle" maddesi.** brief beş işlem sayar
ama aynı yüzeydeki **kardeş yazma rotaları** korumasız kalsaydı spam
kapısı ORADAN açık kalırdı. Bu dilimde **üç rota** sınırlandı:
`respondToFriendRequest` (30/60), `removeFriend` (30/60), `unblockPlayer`
(60/60) — hepsi `keyBy: 'player'`. `RateLimitGuard` **opt-in** çalışır
(işaretlenmemiş rota = **sınırsız**, bilinçli bir tercih), yani eksik bir
decorator'ı ne derleyici ne başka bir test fark ederdi; kapalı küme
iddiası bunu CI'da kilitler. Liste testte **elle** yazılır (kaynak
taranarak üretilmez): bir rota silinirse listede "fazladan" bir ad kalır
ve test onu bulamayıp **kırılır** — yani liste kendini bayatlatamaz.

**§31 — İKİ SOMUT KANIT.**
1. `POST /races/:id/settle` **yalnızca yol parametresi** alır: imzada
   `@Body`/`@Query` **yoktur**. O uçta bir gövde bulunması, istemcinin
   sonucu ya da tutarı seçebilmesinin **ön koşuludur**.
2. `JoinRaceDto` gövdesi **tam olarak üç alan** taşır (`horseId`/
   `tacticalStyle`/`riskLevel`) ve alan adlarının hiçbiri
   `fee|prize|money|amount|multiplier|result|score|time|rank` ile
   eşleşmez. Giriş ücreti ve ödül havuzu **sunucuda**, yarış satırından
   ve config'ten gelir.

Alan adları **kaynaktan** okunur: `!:` ile bildirilen alanlar çalışma
anında kendi özelliği olarak **var olmaz** (`new JoinRaceDto()` boştur)
ve esbuild `design:type` üretmediği için `Reflect` üzerinden de
görünmezler.

**PHASE 16'NIN KALAN TEK MADDESİ:** `docs/SECURITY.md` §7'nin "anormal
davranış tespiti … henüz uygulanmadı" notu. Hız sınırı bir **istek
sayar**, anormal bir **deseni** tanımaz (ör. 30 saniyede 20 farklı at
üzerinde antrenman). Eşikler ve tepki (log / geçici kilit / inceleme
kuyruğu) proje sahibinin kararını gerektirir — **uydurulmadı.**

**KANIT:** `apps/api/test/security/phase16-hardening.spec.ts` (metadata +
kaynak sıra kanıtı + DTO şekli). Race engine'e dokunulmadı, hiçbir config
değeri koda gömülmedi. Ayrıntı: `docs/SECURITY.md` §7.

---

#### 13.21 BİLDİRİM EKRANI — `/notifications` + gezinti şeridi (brief §35, §42 PHASE 11) — 28.09.2026

**BU DİLİM YENİ BİR BACKEND YAZMAZ.** §13.11'in beş uç noktası ve üç
WebSocket olayı **zaten hazırdı**; eksik olan tek şey **istemciydi** — bu
yüzeye o güne kadar hiçbir istemci dokunmuyordu. Brief §35'in istediği
`/notifications` ekranı bu boşluğu kapatır. `PROJE_DURUMU.md` §13.11'in
"hiçbirinin istemci tüketicisi yok" notu **bu dilimle bayatladı**.

**SUNUCU OTORİTESİ (kural 1) — EKRAN HİÇBİR İŞ KURALI UYGULAMAZ.**
`unreadCount` listeden **sayılmaz**, ayrı bir alan olarak **okunur**.
Sebep somut: liste `limit` ile **kırpılmıştır**, yani kırpılmış bir
diziden sayılan rozet yanlış olurdu — 60 okunmamış bildirimi olan oyuncu
50 satırlık listede **50** görürdü. Sayma işi sunucunundur
(`COUNT(*)`, int8 → API'de `Number`'a çevrilir; BIGINT tuzağı §7).

**SOKET OLAYI BİR "TAZELE" SİNYALİDİR, VERİ KAYNAĞI DEĞİL.**
`notification.created` zaten DB'ye yazılmış satırı taşır ve doğrudan
listeye eklenebilirdi. Bu **bilinçli olarak** yapılmadı, üç gerekçeyle:

1. Sunucu listeyi **kırpar**; olayı doğrudan eklemek istemciyi sunucudan
   **bir fazla elemanlı** yapardı ve liste bir sonraki tam yüklemede
   kendiliğinden değişirdi.
2. `sendRaceInvite` **hem** `notification.created` **hem** `race.invite`
   yayınlar (biri rozet listesi, diğeri iki düğmeli kart için). İkisini de
   uygulamak **aynı daveti iki kez** gösterirdi.
3. `race.invite.responded` **davet edene** gider; onun bildirim
   listesinde **karşılığı yoktur**.

Üç olay da aynı şeyi yapar: listeyi sunucudan yeniden ister.

**SOKET BEST-EFFORT.** Bağlantı kurulamazsa sayfa **çalışmaya devam
eder**, yalnızca canlı güncellenmez ve bu kullanıcıya söylenir. Yeniden
bağlanma/kuyruk mantığı yazılmadı — `socket.io-client` zaten otomatik
yeniden bağlanır ve o da olmasa ekran **yanlış** bir şey göstermez,
sadece eskir.

**`[Kabul Et]` YARIŞA KATILMAK DEĞİLDİR — bu sunucu sözleşmesidir.**
Katılım bir **ata** ve bir **giriş ücretine** bağlıdır ve tek yoldan
(`POST /races/:id/join`) geçer (`RespondRaceInviteResult` doc yorumu).
Kabul yalnızca davetin durumunu değiştirir; ücret ikinci adımda ödenir.
Ekran bunu metinde de söyler.

**DÜĞMELERİ GİZLEMEK İÇİN SUNUCUDAN BİLGİ ALINAMAZ.** Davet
bildiriminin `payload`'ı davetin **durumunu taşımaz** ve
`GET /race-invites/:id` diye bir uç **yoktur**. Sunucudan gelmeyen bir
durumu **tahmin etmek** yanlış olurdu: `respond` bildirimi **okundu
işaretlemez**, yani "okunmadıysa hâlâ bekliyordur" gibi bir çıkarım
düğmeleri **hiç gizlemezdi**. Bu yüzden yalnızca **kendi yaptığımız
işlem** hatırlanır (`respondedInvites` kümesi) ve yalnızca respond
**başarılı olduktan sonra** yazılır — sunucu durumunun taklidi değil,
kendi eylemimizin kaydı. **Bilinçli sınır:** sayfa yenilenince düğmeler
geri gelir ve sunucu 409 ile gerekçeyi söyler.

**GEZİNTİ ŞERİDİ — bu dilimin ikinci yarısı.** Projede **hiçbir gezinti
yoktu**; her sayfa yalnızca başka bir sayfanın içindeki tek tük
bağlantıdan bulunabiliyordu. Bu koşullarda `/notifications`
**ulaşılamaz** olurdu: var olan ama kimsenin açamadığı bir ekran **ölü
koddur**. `TopBar`'a bir şerit eklendi. Liste `nav-links.ts`'te **saf
veri** olarak durur (React'ten ayrılmıştır) ki doğrulayan test DOM'suz
koşabilsin.

**YALNIZCA GERÇEK SAYFALAR LİSTELENİR.** §35'in henüz yazılmamış
sayfaları (`/wallet`, `/messages`, `/profile/:username`, `/gifts`,
`/races/:id`, `/races/:id/spectate`) şeride **konulmadı** — kırık bir
bağlantı ya da sahte bir "yakında" satırı, listenin geri kalanına
duyulan güveni bozardı.

**KANIT (iki dosya).**
1. `apps/web/test/lib/api-client.spec.ts` — beş uç noktanın **URL/method/
   gövde** eşleşmesi + hiçbirinin `Idempotency-Key` **göndermediği** (bu
   uçlar para/mülkiyet değiştirmez, §4.7'nin kapsamı dışındadır).
2. `apps/web/test/components/top-bar-nav.spec.ts` — şeritteki **her**
   bağlantının gerçekten bir `page.tsx`'i olduğu, **gerçek dosya sistemi
   taranarak** doğrulanır. **NEDEN GEREKLİ:** Next.js'te var olmayan bir
   yola `<Link href="/yok">` yazmak **derleme hatası değildir**; ne `tsc`
   ne `next build` yakalar, sayfa yalnızca tıklanınca 404 olur. Gezinti
   listesi elle yazıldığı için liste ile `src/app` arasındaki tutarsızlık
   sessizce birikebilirdi. Test listeyi **kopyalamaz**, `NAV_LINKS`'i
   **kaynaktan import eder** ve rotaları `src/app` altından **türetir**
   (rota grupları `(dashboard)` düşülür; `[dinamik]` segmentler statik
   hedef olamayacağı için `null` döner).

**⚠️ HARNESS'E ÜÇÜNCÜ TEST GRUBU EKLENDİ — YOKSA BU TESTLER HİÇ
KOŞMAZDI.** `.claude/verify-admin.mjs` o güne kadar yalnızca `apps/api`
testlerini çağırıyordu. `apps/web/test/...` altına yazılan bir test
"yerelde doğrulandı" sanılırken **hiç çalışmamış** olurdu ve **yeşil bir
harness çıktısı bunu ele vermez**. Grup `cwd: apps/web` ile koşar: CI kök
`npm run test` → `--workspaces` ile her workspace'i **kendi dizininden**
çalıştırır; `process.cwd()`'ye bakan bir test bu yüzden yerelde geçip
CI'da düşebilirdi (aynı ders §7.2'nin `race-cancel.spec.ts` vakası).

**YENİ TUZAK — AYRIK BİRLİKTE `payload` DESTRUCTURING'İ DARALTMAYI
BOZAR.** `describe(notification)` fonksiyonunun ilk hâli
`const { payload } = notification;` yazıp `switch (notification.type)`
yapıyordu. TypeScript bağlantıyı **kaybeder**: `payload` sekiz şeklin
**birleşimi** olarak kalır ve `case 'race_invite'` içinde bile
`payload.inviteId` hata verir (yaşandı: `tsc -p apps/web` **17 hata**).
Daraltma **`notification` üzerinde** yapılmalı ve erişim her durumun
**içinde** doğrudan `notification.payload.x` biçiminde olmalıdır.

**PAYLAŞILAN SÖZLEŞME TAŞINDI:** `MarkAllNotificationsReadResult`
Application katmanından `packages/shared-types`'e alındı
(`RespondFriendRequestResult`/`RemoveFriendResult` ile **aynı sınıf**:
`apps/web` okuyorsa sözleşme paylaşılan pakettedir). Use-case onu
**yeniden dışa aktarır**, yani taşıma tüketici imzalarını kırmaz.
`markedCount` dönmesinin sebebi 204 değil: istemcinin `request()`
yardımcısı **her zaman** `response.json()` çağırır ve sayı, rozeti kaça
düşüreceğini söyler (yarış koşulunda arada gelen bir bildirim rozeti
0 yapmamalıdır).

**BU DİLİMDE KAPANMAYANLAR (dürüst):** `race_starting` bildiriminin
**üreticisi hâlâ yok** (§13.13'teki gerekçe geçerli: başlangıç **anında**
tetiklenen bir iş, yani zamanlayıcı ister — projede yok). `/wallet`,
`/messages`, `/profile/:username`, `/gifts`, `/races/:id`,
`/races/:id/spectate` **yazılmadı**. Sohbet/tribün arayüzünün istemci
tüketicisi (§13.5) hâlâ **yok**.

**Race engine'e dokunulmadı, para yolu değişmedi, hiçbir config değeri
koda gömülmedi.**

---

#### 13.22 SOSYAL PROFİL EKRANI — `/profile/:username` (brief §24, §42 PHASE 14) — 28.09.2026

**BİR ÖNCEKİ DİLİMİN İKİZİ.** §13.15'in uç noktası
(`GET /players/profile/:username`, `@Public()`) **zaten vardı**; eksik
olan yalnızca istemciydi. Bu dilim o boşluğu kapatır.

**⚠️ SÖZLEŞMENİN DIŞINA ÇIKILMAZ.** Ekran, bakiyeyi göstermek için
**ikinci bir istek ATMAZ** (`getPlayer` çağrılmaz). O uç nokta
`assertSelf` ile korunur ve başkasının bakiyesi **zaten alınamaz** —
alınabilseydi burada göstermek doğrudan bir **sızıntı** olurdu.
`PlayerProfileView` `money`/`gems` taşımaz (AUDIT Bulgu S4); ekran da
o sözleşmeye uyar.

**`isSelf` SUNUCUDAN GELMEZ, İSTEMCİDE TÜRETİLİR.** Uç nokta `@Public()`
olduğu için global `AuthGuard` token'ı **hiç ayrıştırmaz**, yani sunucu
"isteyen kim" bilgisine sahip değildir. Bunu mümkün kılmak, kimlik
doğrulamayla ilgili **küresel** bir guard'ı tek bir görünüm alanı için
gevşetmek olurdu; karşılaştırma (`player.id === profile.playerId`) tek
satırdır ve yanlış olma ihtimali yoktur.

**KARİYER KADEMESİ BURADA HESAPLANMAZ.** Eşikler tek bir yerde
(`features/career/career-tier.ts`) yaşar ve ekran onu **çağırır**; ikinci
bir kopya zamanla ayrışırdı. `getCareerProgress` son kademede
`progressToNextTier = 1` döner ("daha fazla ilerleme yok") ve ekran bunu
**metinle** söyler, çubuğun dolu görünmesini öylece bırakmaz.

**`achievements` `null` LİTERAL TİPİDİR — VE BU YÜZDEN KOŞUL YAZILMAZ.**
Alan `string[] | null` değil, düpedüz `null`'dur (kalıcı başarım veri
modeli yok, yeni migration gerektirir). Bir `if` yazmak `else` dalını
`never` yapardı. Model eklendiğinde tip genişleyecek ve **derleyici tam o
satıra gelip** "artık bir dal yazmalısın" diyecektir — sessizce boş kalan
bir liste değil.

**`encodeURIComponent` ŞART.** Kullanıcı adı URL **yoluna** gömülür;
`a b` ham birleştirmede bozuk bir URL, `a/b` ise **tamamen başka bir
rota** üretirdi. Kodlama/çözme **tek bir yerde** (api-client) yapılır —
Next.js dinamik segmenti zaten çözülmüş verir, bu yüzden sayfa ikinci kez
çözmez.

**GEÇ YANIT KORUMASI.** Kullanıcı hızlıca başka bir profile geçerse eski
isteğin yanıtı **yeni ekrana yazılmaz** (`friends/page.tsx`'teki yazışma
yüklemesiyle aynı desen).

**⚠️ SÖZLEŞME DEĞİŞİKLİĞİ — `PlayerSummary`'ye `username` EKLENDİ**
(mapper dâhil). **Gerekçe:** `/profile/:username` **dinamik** bir rotadır,
`nav-links.ts`'teki statik listeye **giremez**; yani oyuncunun **kendi**
profiline giden tek keşif yolu üst bardır ve orada yalnızca
`PlayerSummary` vardır. `username` olmadan sayfa **ölü kod** olurdu.
`username` **gizli değildir** (profilin URL'sidir, `GET
/players/profile/:username` ile herkese açıktır, sohbet mesajlarında
zaten görünür) ve `PlayerSummary` **hiçbir zaman başka bir oyuncu için
üretilmez** (`GET /players/:id` `assertSelf` ile korunur). Üst bardaki
avatar + ad artık kendi profiline bağlantıdır.

**KANIT.** `apps/web/test/lib/api-client.spec.ts` — yol parametresi, **URL
kodlaması** (`a b/c` → `a%20b%2Fc`), `GET`/gövdesiz, ve **token'sız
çalışma** (uç nokta `@Public()`). Ayrıca harness'in e2e grubuna
`test/api/player-profile.e2e-spec.ts` **eklendi** — değişen sözleşmeyi
uçtan uca kuran dosya odur (profil yanıtında `money`/`gems` olmadığını da
o doğrular).

**BU DİLİMDE KAPANMAYANLAR (dürüst):** profilin **gösterilecek bir
listesi yok** — arkadaş listesi (`SocialPlayerView`) ve sıralama tablosu
(`LeaderboardRowView`) `username` **taşımaz**, yani başka birinin profiline
gitmenin bir yolu bugün **yoktur**. Bunu açmak, o iki görünüme `username`
eklemek (ve arkadaş listesi için repository SQL'ini değiştirmek) demektir;
**yapılmadı.** Bugün erişilebilen profil, oyuncunun **kendi** profilidir.

**Race engine'e dokunulmadı, para yolu değişmedi, hiçbir config değeri
koda gömülmedi.**

---

#### 13.23 CÜZDAN EKRANI — `/wallet` (brief §20/§22/§35/§37, §42 PHASE 4) — 28.09.2026

**Ne yapıldı:** brief §35'in "Gerekli ekranlar" listesindeki `/wallet`
maddesi yazıldı. Backend **zaten vardı** ve üç uç noktanın da **istemci
tüketicisi yoktu**:

| Uç nokta | Yanıt | Ekrandaki karşılığı |
|---|---|---|
| `GET /players/:id/wallet` | `WalletView` | bakiye kutuları + işlem geçmişi |
| `POST /players/:id/wallet/deposit` | `WalletDepositResult` | "Sanal Para Yükle" formu |
| `POST /players/:id/daily-reward` | `ClaimDailyRewardResult` | "Günlük Ödülü Al" düğmesi |

**Sunucu otoritesi korunur:** ekran hiçbir finansal hesap **yapmaz**.
Bakiye sunucunun döndürdüğü `newBalance`'tan okunur; istemci toplama ya
da çıkarma yapmaz (brief §22 "Tüm finansal hesaplamalar backend'de
yapılmalı"). İşlem satırlarındaki yön (borç/alacak) sunucunun **işaretli**
`amount`'undan gelir ve `balanceAfter` ile birlikte gösterilir — oyuncunun
"o an ne kadar vardı" sorusunu cevaplayan tek alan sunucunun yazdığı bu
değerdir.

**⚠️ IDEMPOTENCY KARARI — `grandstand/page.tsx`'ten BİLEREK AYRILIR.**
Orada kural "her basışta yeni anahtar"dır ve gerekçesi yazılıdır: zarar
ikinci bir **bilet**tir. Burada zarar ikinci bir **PARA GİRİŞİ**dir ve
senaryo gerçektir: sunucu yatırımı yazıp yanıt ağda kaybolursa kullanıcı
düğmeye yeniden basar; yeni bir anahtar üretilseydi deftere **ikinci** bir
`mock_deposit` satırı düşerdi ve bu **hiçbir yerde hata üretmezdi**.
Bu yüzden `depositKeyRef` anahtarı **başarısızlıkta atar, saklar**:
anahtar yalnızca (a) tutar değiştiğinde ya da (b) işlem başarıyla
bittiğinde bırakılır. Böylece "aynı mantıksal isteğin tekrarı" sunucuda
aynı anahtarla karşılaşır ve tek satır yazılır.

`claimDailyReward` ise anahtar **göndermez** — uç noktanın kendi tekrar
koruması vardır (günlük cooldown → 409) ve bu, `economy.controller.ts`'te
`IdempotencyInterceptor`'ın yalnızca `deposit`'e konmasıyla tutarlıdır.

**⚠️ SİHİRLİ SAYI YOK — yükleme sınırları CONFIG'TEN.** Alt/üst sınır
(`mockDeposit.minAmount`/`maxAmount`) ve geçmiş sayfa boyutu
(`walletHistoryDefaultLimit`) `config/economy.config.json` →
`loadEconomyConfig()` ile okunur. `100`/`50000` değerlerini sayfaya gömmek,
sunucu politikası değiştiğinde ekranı **yalancı** duruma düşürürdü: sunucu
reddederken ekran "geçerli" derdi. `mockDeposit.enabled` **false** ise form
yerine "bu sunucuda para yükleme kapalıdır" metni gösterilir — yani kill
switch'e saygı duyulur, gizlenmez.

**Gerçek para izlenimi verilmez:** ekran yüklemenin **oyun içi (sanal)**
olduğunu gizlemez ve sağlayıcı adını (`providerId`) **yanıttan okur**.
Bugün `'mock'` yazar; gerçek bir sağlayıcı bağlandığında ekran
kendiliğinden doğru adı yazar. `mock_deposit` adının bilerek `'deposit'`
olmadığı karar (bkz. §13.14 çevresi / `economy.ts`) bu ekranda da
korunur.

**Yeni modül — `apps/web/src/features/wallet/ledger-labels.ts`:** 18 defter
türünün ve 10 kanonik türün Türkçe etiketi, `Record<...>` olarak yazıldı.
Eksik anahtar **derleme hatası** verir; sunucu yeni bir tür eklerse istemci
sessizce **boş** bir satır gösteremez. Etiketler **yönsüzdür** ("Yem
alımı", "Yem aldın" değil): yönü metne gömmek, `amount` işaretiyle
çelişebilecek **ikinci** bir yön kaynağı doğururdu — aynı etiket hem borç
hem alacak satırında görünebilir. Bilinmeyen bir tür gelirse **ham değer**
döner; boş ya da uydurma bir metin değil.

**Yan refactor — `FEED_TYPE_LABELS` taşındı.** Günlük ödül bildirimi
`grantedFeed` kalemlerini göstermek zorundaydı ve harita `app/care/page.tsx`
içinde **yereldi**. İkinci tüketici doğduğu için
`apps/web/src/features/care/feed-labels.ts`'e taşındı (aynı eşik
`lib/currency.ts`'te de yaşanmıştı; kural: ikinci tüketici çıktığında ortak
modüle taşı). Açıklama metinleri (`FEED_TYPE_DESCRIPTIONS`) yerelde
**bırakıldı** — tek tüketicililer.

**KANIT:** `apps/web/test/lib/api-client.spec.ts` (yol parametresi;
`limit` verilmediğinde sorgu dizesinin **hiç eklenmemesi** — `?limit=undefined`
sunucuda ayrıştırma hatası üretirdi; `Idempotency-Key` başlığının deposit'te
**var**, diğer ikisinde **yok** olması; deposit gövdesinin **yalnızca**
`amount` taşıması) + yeni `apps/web/test/features/wallet/ledger-labels.spec.ts`
(harita kapsamının **çalışma zamanı** kanıtı: `tsc` yeterli değildir, çünkü
`transpilePackages`/`dist` üzerinden çözülen bir birleşim `any`'ye
düşebilir ve derleyici susar; ayrıca **fazla** anahtar iddiası — silinmiş
bir türün etiketi kalırsa okuyan "bu hâlâ oluyor" sanır) +
`top-bar-nav.spec.ts` `/wallet` bağlantısını gerçek `page.tsx`'e kilitler.

**BU DİLİMDE KAPANMAYANLAR (dürüst):** geçmiş **sayfalanmaz** —
`hasMore` sunucudan okunur ve "yalnızca son N hareket gösteriliyor" yazar,
ama "daha fazla yükle" düğmesi **yoktur** (`limit` parametresi
`api-client`'ta hazırdır). Elmas yüklemenin **hiçbir yolu yoktur** ve
olmamalıdır: uç nokta yalnızca `amount` alır, para birimi seçilemez.
Bakiye `usePlayer` önbelleğinden **değil**, cüzdan yanıtından okunur; üst
bardaki bakiye bir sonraki oyuncu tazelemesine kadar eski kalabilir.

**Race engine'e dokunulmadı, para yolu DEĞİŞMEDİ** (yalnızca var olan uç
noktaların istemci tüketicisi yazıldı), **hiçbir config değeri koda
gömülmedi.**

---

#### 13.24 YARIŞ YAŞAM DÖNGÜSÜ — `startTime` kilidi + dondurulmuş snapshot + İLK ZAMANLAYICI (brief §42 PHASE 1) — 28.09.2026

**BU DİLİM BİR "AÇIK PENCERE"Yİ KAPATIR — ve pencere kapatıldığı için
`locking` diye YENİ bir durum doğdu (migration 0042).**

**ÖNCEKİ DURUM (dürüst):** `startTime`ı İŞLEYEN HİÇBİR ŞEY YOKTU. Ücretli
lobi yarışı yalnızca kimliği doğrulanmış bir oyuncu
`POST /races/:id/settle` çağırdığında koşuyordu; seed ve `horse_snapshot`
ise **kesinleşme ANINDA** üretiliyordu. Yani oyuncu `startTime` ile
kesinleşme arasındaki pencerede atını çalıştırıp (ya da ekipman
değiştirip) sonucu **etkileyebiliyordu** — ve bu, hiçbir yerde hata
üretmiyordu. `SettleRaceUseCase` doc yorumu bu pencereyi açıkça yazıyordu.

**YENİ ZİNCİR:** `scheduled` → (zamanlayıcı, `startTime` geçince) →
**`locking`** → (`settle`) → `finished`. `locking`in tek anlamı: *"kadro +
seed + snapshot donduruldu, henüz KOŞMADI."* Ödüller bu durumda
**DAĞITILMAMIŞTIR** — bu ayrım iptal kararının temelidir (aşağıda).

**PROJEDEKİ İLK ZAMANLAYICI — `RaceLockScheduler`.** `race_starting`
bildiriminin üreticisiz kalmasının ve yukarıdaki pencerenin tek sebebi,
projede zamanla tetiklenen **hiçbir işin olmamasıydı**. Sınıfın doc
yorumunda beş karar ve her birinin tuzağı yazılıdır:

1. `setInterval` DEĞİL **`setTimeout` zinciri** — yavaş bir tur turları üst
   üste bindirmesin.
2. **`unref()`** — zamanlayıcı Node sürecini ayakta tutmasın (yoksa
   kapanmakta olan bir süreç açık bir timer yüzünden bekler).
3. **`NODE_ENV === 'test'` iken KAPALI** — e2e saati KENDİSİ sürmelidir,
   yoksa arka plan turu testin kurulumu ile iddiası arasına girer ve CI'da
   **rastgele** düşen bir test doğar. **Bu, kilidin test edilmediği
   anlamına GELMEZ:** testler `tickNow()` çağırır, yani koşan kod yolu
   birebir aynıdır — yalnızca saat testin elindedir.
4. **`isTicking` yeniden giriş kilidi** (ve `finally`de bırakılır — bir
   `throw` yolu kilidi kalıcı bıraksaydı zamanlayıcı bir daha asla
   kilitlenmez ve bunu **hiçbir şey söylemezdi**).
5. **Tur seviyesinde hata yutulur** — yakalanmayan bir söz, Node sürümüne
   göre süreci öldürebilir; zamanlayıcının bir kez düşüp bir daha
   çalışmaması = kilitlenmeyen yarışlar.

**ATOMİKLİK — `scheduled → locking` TEK TRANSACTION'DA YAZILIR:**
durum + `simulation_seed` + dört sürüm kolonu (`engine_version`,
`ruleset_version`, `config_version`, `weather_config_version`) + **her
girişin `horse_snapshot`ı** + `race_starting` bildirimleri. Ayrı
`INSERT`lar olsaydı bir çökme "kilitli ama snapshotsız" satır bırakırdı ve
kesinleşme o satırı **sessizce** yeniden kurardı — yani pencere geri
açılırdı. İkinci tur `NOT_LOCKABLE_UNDER_LOCK` döner (durum kilit altında
tekrar denetlenir); `settle` zaten `scheduled|locking → finished`
geçişiyle korunuyor.

**⚠️ ÜÇ KAPI AYNI ANDA AÇILDI — biri unutulsaydı KALICI PARA KİLİDİ
doğardı.** Zamanlayıcı `startTime`da kilitler; kimse kesinleştirmezse
`checkRaceLeavable` `startTime` sonrası ayrılmayı kapattığı için oyuncu
parasını **hiçbir yoldan** geri alamazdı. Bu yüzden `locking`:
- **kesinleştirilebilir** (`checkRaceSettleable`),
- **iptal edilebilir** (`checkRaceCancelable` → `locking` için ret yok;
  iade defterdeki son `lobby_race_entry_fee`den okunur, §13.19),
- **kilitlenebilir** (asıl geçiş).

**SEED ARTIK KİLİTTE DOĞAR.** Eskiden kesinleşmede doğuyordu.
`randomUUID()` — **`Math.random()` DEĞİL**: CLAUDE.md'nin yasağı motorun
İÇİNDEKİ rastgelelik içindir (motor `deriveRandom(seed, ...)` ile
determinist olmalı); seed'in KENDİSİ rastgele olmalıdır, yoksa sonuç
önceden hesaplanabilirdi. `raceId`yi seed yapmak bu yüzden **yasak**
olurdu.

**YENİ DOSYALAR:**
- `domain/race/race-lifecycle.ts` — kapalı geçiş çizgesi,
  `Record<RaceStatus, ...>` olarak (eksik anahtar **tsc hatası** verir, yani
  "yeni durum eklendi ama tablo güncellenmedi" sessizce izin veremez).
  `TERMINAL_RACE_STATUSES` = `finished`/`cancelled`; **`finished →
  cancelled` YASAK** (ödül dağıtılmış yarışta iade, kazanana ödenen
  `race_prize` değil ödediği giriş ücreti olurdu = makul görünen YANLIŞ
  tutar).
- `infrastructure/scheduler/race-lock.scheduler.ts` — yukarıdaki 5 karar.
- `application/use-cases/lock-race.use-case.ts` — "şimdi kilitlenecek ne
  var" sorusunu **soran ve cevaplayan** use-case; **zamanlayıcı DEĞİL**.
  Ayrım bilinçlidir: testler gerçek kodu koştururken saati kendileri
  kontrol eder. Yarış başına `try`/`catch`: tek bir bozuk satır TÜM
  lobiyi kilitleyip havuzları kalıcı kilitlememelidir.
- `application/services/entrant-snapshot.builder.ts` — snapshot kurma
  mantığı `SettleRaceUseCase`in özel metodu iken **paylaşılan servise**
  taşındı. İki kopya bırakmak, `buildHorseEntrantSnapshot` girdileri
  değiştiğinde (PHASE 6'da jokey/kişilik **planlanıyor**) birinin
  güncellenip diğerinin unutulması demekti — dondurulmuş snapshot ile
  kesinleşme snapshot'ı **sessizce** ayrışırdı. `domain/` altında DEĞİL
  `application/services/` altındadır: repository portlarına bağımlıdır
  (katman yönü).

**CONFIG (sihirli sayı yok):** `config/race-lobby.config.json` →
`lockScheduler: { enabled, tickSeconds, batchSize }`, tipi
`packages/game-config/src/types.ts`'te. **Bu bir yetki kapısı değil
ayardır** — `enabled: false` kilidi kapatır ama `settle` yolu çalışmaya
devam eder (crank yolu), yani para kilitli kalmaz.

**KANIT:**
- `apps/api/test/domain/race/race-lifecycle.spec.ts` — geçiş çizgesi +
  **migration 0042'nin CHECK listesiyle BİREBİR hizalama (dosya OKUNARAK)**.
  `races.status` CHECK'i veritabanındaki tek gerçekliktir; kayma yalnızca
  **üretimde** `23514 check_violation` olarak patlar.
- `apps/api/test/api/race-lifecycle.e2e-spec.ts` — 7 test: kilit + seed +
  snapshot yazımı; ikinci turun **no-op** olması ve seed'in DEĞİŞMEMESİ;
  `startTime`ı gelmemiş yarışın kilitlenmemesi; katılımcısız yarışın
  kilitlenmemesi; `race_starting` bildiriminin katılımcılara gidip
  **yabancıya gitmemesi**; **DONDURULMUŞ SNAPSHOT KANITI**; `locking`
  yarışın iptalinde iadenin **defterden** okunması.
- Diğer: `domain/race/lobby.spec.ts` (`checkRaceLockable` — 8 test),
  `domain/admin/race-cancel.spec.ts` (`locking` iptal edilebilir;
  **yürürlükteki yetki artık 0042**, eski `races_status_check`i düşürdüğü
  iddia edilir), `domain/race/race-lobby-config.spec.ts` (`lockScheduler`).

**⚠️ DONDURULMUŞ SNAPSHOT NASIL KANITLANIR — testin asıl değeri budur.**
Test kilit anındaki `speed` ve `seed`i saklar, sonra **doğrudan SQL ile**
`horse_stats.speed`i **artırır** ve kesinleştirir; sonuç DEĞİŞMEMELİDİR.
Eğitim API'si **bilerek** kullanılmadı: `applyTraining`'in `statGain`i
meşru şekilde **0** olabilir ve o zaman iddia **boş** olurdu (test yeşil
kalır, hiçbir şey kanıtlamaz). Test önce artışın **gerçekten olduğunu**
iddia eder (`expect(bumped).toBeGreaterThan(speedAtLock)`) — bu ön koşul
olmadan sonraki iddia boş bir totolojidir.

**⚠️ `RaceEntrantSnapshot` `ports/race.repository.ts`ten İTHAL
EDİLEMEZ** — o port onu `@at-sevdalisi/shared-types`tan alır ve **yeniden
ihraç etmez**; `TS2459` verir. Doğrudan `shared-types`tan ithal edilir.

**BU DİLİMDE KAPANMAYANLAR (dürüst):**
- **`race_starting` bildirimi artık GERÇEKTEN üretilir** (kilit anında,
  aynı transaction'da) — PHASE 13'ün kalan **tek** türü buydu. Ama
  zamanlayıcı **`NODE_ENV=test` ve `lockScheduler.enabled=false` iken
  kapalıdır**, yani üretim yapılandırmasına bağlıdır.
- **`in_progress` DURUMU HÂLÂ ÖLÜDÜR.** Tabloda ve geçiş çizgesinde
  durur (miras), ama onu **yazan hiçbir kod yoktur**: yarış `locking`ten
  doğrudan `finished`a geçer. Canlı yarış **yayını** (`race.*` olayları)
  hâlâ yalnızca izleyici akışıdır; motor tek seferde koşar, kademeli
  değil. Yani "LIVE RACE" aşaması **simülasyon anlık görüntüsüdür, gerçek
  zamanlı koşu değildir**.
- **Zamanlayıcı TEK örneklidir.** İki API örneği koşarsa ikisi de tur
  atar; kilidin kendisi `FOR UPDATE` + durum geçişiyle idempotent olduğu
  için **çift kilit olmaz**, ama gereksiz yük olur (dağıtık kilit yok).
- **Snapshot hâlâ `startTime`da değil, tur ANINDA alınır** — tur
  `tickSeconds` kadar geç olabilir. Pencere **saniyeler** mertebesine
  indi, **sıfırlanmadı**; `tickSeconds` config'ten küçültülebilir.
- Yarış **geçmişi/tekrar oynatma** uçları bu dilimin dışındadır.

**Race engine'e DOKUNULMADI, para yolu DEĞİŞMEDİ** (kilit yalnızca
yazar; ödül dağıtımı aynı `settle` ucundadır), **hiçbir config değeri
koda gömülmedi.**

---

#### 13.25 SAHA KOMPOZİSYONU — `fieldSize` ≠ gerçek oyuncu sayısı + ayrıştırılabilir sonuç (brief §42 PHASE 2) — 28.09.2026

**BU DİLİM BİR "ÖLÜ CONFIG"İ ORTAYA ÇIKARDI.** `config/race-lobby.
config.json` → `aiFillEnabled` **hiçbir kod tarafından okunmuyordu**:
yalnızca JSON'da, `packages/game-config/src/types.ts`te ve "boolean mı"
diyen tek bir testte duruyordu. `SettleRaceUseCase` ise sahayı **koşulsuz
olarak** `fieldSize`a tamamlıyordu — yani sahibi onu `false` yapsa
**tek bir bot bile eksilmezdi** ve bunu **ne derleyici ne hiçbir test**
söylerdi. Bir config değerinin hiçbir etkisi olmaması, o değerin hiç
olmamasından **daha kötüdür**: okuyan onu "kapatma düğmesi" sanar.

**ÜÇ SOMUT BOŞLUK KAPATILDI:**

1. **`fieldSize` ile gerçek oyuncu sayısı ayrıldı.** Kural artık saf bir
   fonksiyondur: `domain/race/field-composition.ts` → `resolveFieldComposition`.
   `settle-race.use-case.ts` onu **tüketir** (`this.config.raceLobby.
   aiFillEnabled` + `fieldSizes`), bot sayısını kendi hesaplamaz.
2. **Sonuç artık AYRIŞTIRILABİLİR.** `RaceSettlementPlace`ten `isBot`
   KALDIRILDI; yerine `participantType: 'human' | 'ai'` geldi ve
   `jockeyId`, `startingStats` (8 sayı), `finalTimeMs` eklendi. `isBot`un
   web tüketicisi **olmadığı doğrulandı** (yalnızca
   `RaceTimelineEntrantView`/`RaceRosterEntrant` o adı kullanır; onlar
   DEĞİŞMEDİ).
3. **`startingStats` DONDURULMUŞ snapshot'tan okunur**, canlı statlardan
   değil. Canlı okunsaydı, sonucu **açıklayan** sayılar ile sonucu
   **üreten** sayılar ayrışırdı ve bu hiçbir yerde hata üretmezdi.

**YENİ DOSYA:** `apps/api/src/domain/race/field-composition.ts` —
`resolveFieldComposition(input, config)` → `{ok:true, composition}` ya da
`{ok:false, reason}`. Ret nedenleri: `UNSUPPORTED_FIELD_SIZE` ·
`TOO_MANY_PLAYERS` · `NO_HUMAN_PLAYERS`. `fieldSizes` **config'ten**
gelir (koda ikinci bir liste gömmek, config'e eklenen bir boyutu sessizce
reddeden bir kod doğururdu — kural 6). `fieldSize` kontrolü burada
**tekrarlanır**: `races.field_size` doğrudan SQL ile değiştirilebilir ve
o durumda `generateBotEntrants` negatif bir sayı alırdı.

**DEĞİŞEN DOSYALAR:** `packages/shared-types/src/race.ts` (yeni
`RaceParticipantType`, yeni `RaceStartingStats`, `RaceSettlementPlace`
yeniden yazıldı) · `domain/race/field-composition.ts` (yeni) ·
`domain/race/entrant-snapshot.ts` (yeni `pickStartingStats` — bilinçli
ALT KÜME, kopyalanır/referans geçirilmez) · `application/use-cases/
settle-race.use-case.ts` (`resolveFieldComposition` tüketimi) ·
`infrastructure/race/postgres-race.repository.ts` (`assertBotSnapshot`
yardımcısı, kilitli-giriş sorgusuna `jockey_id`, `jockeyIdByEntryId`
haritası, iki `places.push` bloğu).

**⚠️ BOT SNAPSHOT'I `?? null` İLE GEÇİŞTİRİLMEZ.** `RaceEntry.
horseSnapshot` NULLABLE'dır (gerçek atlar için kilit anında yazılır, eski
satırlarda hiç yoktur) — ama **botlar için her zaman vardır**:
`generateBotEntrants` onu simülasyon için üretir ve use-case doğrudan o
nesneyi geçirir. `null` gelmesi bir bütünlük hatasıdır ve sıfırlarla bir
`startingStats` uydurmak, yanıta **yanlış** sayılar koymak olurdu. Bu
yüzden `assertBotSnapshot` **patlar**.

**⚠️ "AI'YE GİZLİ BONUS" ARTIK TESTLE ELE VERİLİR.** Bot statları aynı
seed ile **yeniden üretilip** yanıttaki sayılarla **birebir** karşılaştırılır
(`generateBotEntrants(6, seed)`). Motora giren girdi ile oyuncuya gösterilen
sayı arasına bir çarpan girse bu test **kırılır** — brief'in "gizli +%50"
yasağının ölçülebilir karşılığı budur.

**⚠️ BRIEF'İN "8/0/8" SENARYOSU SUNUCUDA İMKÂNSIZDIR — UYDURULMADI.**
`checkRaceSettleable`/`checkRaceLockable` `joinedPlayers < 1` durumunu
`NO_PARTICIPANTS` ile keser; ödül havuzu **gerçek giriş ücretlerinden**
oluşur, yani boş sahanın havuzu da yoktur. Kural bunu `NO_HUMAN_PLAYERS`
olarak **ikinci kez** reddeder (saf fonksiyon, "0 oyuncu + N bot" diye bir
yarış kavramsal olarak yoktur). Ulaşılabilir matris **1 gerçek oyuncudan**
başlar: `8/1/7`, `8/4/4`, `8/8/0` ve aynısı 10/12/14/16 — hepsi test
edilir.

**KANIT:**
- `apps/api/test/domain/race/field-composition.spec.ts` — 8/10/12/14/16 ×
  **her** oyuncu sayısı, `aiFillEnabled` `true`/`false`, ret yolları.
  Saf fonksiyon olduğu için **veritabanı gerekmez**.
- `apps/api/test/api/race-field-composition.e2e-spec.ts` — 2 gerçek + 6
  bot: 8 satır, `1..8` **tekil** sıra, `jockeyId === null`, bot statları
  üretilenle birebir, gerçek oyuncu statları `race_entries.horse_snapshot`
  ile birebir, ve `aiFillEnabled = false` iken sahanın **gerçekten eksik
  koştuğu** (tek oyuncu → tek satır). İkinci test config'i yalnızca
  **bellekte** kapatır ve `finally` ile geri alır (config dosyası
  paylaşılan bir kaynaktır).

**BU DİLİMDE KAPANMAYANLAR (dürüst):**
- **`jockeyId` bugün HER ZAMAN `null`dur.** `race_entries.jockey_id`
  sütununu **yazan hiçbir kod yoktur** (PHASE 6). Alanın varlığı bir
  uydurma değil, sözleşmenin **dürüst** hâlidir: sonucun jokey bileşeni
  bugün "yok"tur ve `null` bunu söyler.
- **`startingStats` yalnızca 8 alandır** (`speed`/`stamina`/`acceleration`/
  `fitness`/`form`/`morale`/`fatigue`/`health`). `surfaceCompatibility`/
  `distanceCompatibility`/`weightCompatibility`/`equipmentModifier`/
  `tactic` yanıtta **yoktur** — bunlar koşu başına değişmez ve "neden
  kazandı" sorusunu cevaplamaz.
- **`aiFillEnabled = false` üretimde bir kayıptır** (gerçek oyuncu azken
  yarış oyuncu için kayıptır — CLAUDE.md'deki "BOT PAYI YANAR" notunun
  kardeşi). Bu bilinçli bir tercih kapısıdır, varsayılanı `true`dur.
- **`fieldSize` ≠ gerçek oyuncu ayrımı yalnızca `settle` yolunda
  uygulanır.** Pratik yarış ve PvP yolları kendi bot üretimlerini
  kullanır ve bu dilimin dışındadır.

**Race engine'e DOKUNULMADI, para yolu DEĞİŞMEDİ** (bu dilim yalnızca
saha kompozisyonunu ve sonucun **şeklini** değiştirir), **hiçbir config
değeri koda gömülmedi.**

---

#### 13.26 EKONOMİK MUTABAKAT — giriş ücreti = ödül havuzu + platform payı + iade (brief §42 PHASE 3) — 28.09.2026

**Bu dilim YALNIZCA testtir; hiçbir üretim kodu, hiçbir migration, hiçbir
config değeri değişmedi.** Kanıt: `apps/api/test/api/economy-reconciliation.e2e-spec.ts`
(4 test, gerçek PostgreSQL).

**BRIEF'İN DENKLEMİ TEK BİR YARIŞ İÇİN AYNEN KURULAMAZ — ve bu bir eksiklik
değil, yarışın tanımıdır.** Brief `TOPLAM GİRİŞ ÜCRETİ = ÖDÜL HAVUZU +
PLATFORM PAYI + İADELER` istiyor; ama bir yarış **ya kesinleşir ya iptal
edilir**. İade edilen bir yarışta ödül havuzu hiç dağıtılmaz; dağıtılan bir
yarışta iade hiç olmaz. Denklem bu yüzden gerçekte var olan **üç ayrı
muhasebe olayına** çevrildi ve üçü ayrı ayrı kanıtlandı:

| Olay | Denklem | Kanıt |
|---|---|---|
| **Kesinleşen yarış (botsuz)** | `giriş ücretleri = havuz` ve `havuz = ödüller + platform payı` — **tam eşitlik** | 8 gerçek oyuncu, `paidTotal === computePrizePayoutTotal(havuz, paylar)` |
| **Kesinleşen yarış (botlu)** | `havuz = ödüller + BOT ARTĞI + platform payı` | 2 gerçek + 6 bot |
| **İptal edilen yarış** | `giriş ücretleri = iadeler`, **tam eşitlik**; `havuz = 0` | yönetim iptali, 3 oyuncu |
| **Terk edilen yarış** | ayrılan oyuncunun **kendi neti = 0** | 1 ayrılan + 1 kalan |

**ASIL İDDİA DEFTERİN KENDİSİDİR.** Her olayda
`SUM(economy_transactions.amount) WHERE reference_type = 'race' AND
reference_id = <raceId>` ile **oyuncuların bakiyelerindeki GERÇEK değişim**
birebir karşılaştırılır. İki sayı ayrışırsa ya defter yalan söylüyordur ya
para yoktan var/dan yok oluyordur — ve **ikisi de hiçbir yerde hata
üretmez**. `race-settlement.e2e-spec.ts` yalnızca "havuz − ödenen = rake"
diyordu; **iadeler ve bot artığı o mutabakatta YOKTU**, yani iptal yolu
defterle hiç karşılaştırılmamıştı. Bu dilim o boşluğu kapatır.

**PLATFORM PAYI VE BOT ARTĞI KİMSEYE YAZILMAZ.** Projede bir "platform
hesabı" satırı yoktur; ikisi de oyuncu ekonomisinden **çıkar** ve başka bir
hesaba **girmez**. Mutabakatta `−(platformPayı + botArtğı)` olarak görünürler
(2 gerçek oyunculu 200 Çip'lik havuzda: ödüller + bot artığı + platform payı
= 180 + 20 = 200; defter neti oyuncular için **−20**). Uydurma bir "ev
hesabı" açmak, bakiyesi olmayan bir satır uydurmak olurdu.

**BOTLAR HAVUZA PARA KOYMAZ — iki farklı model YAN YANA yaşar ve ikisi de
bilinçlidir:**

- **Pratik yarış (kademeli):** `computeRacePool(tier) = entryFee × fieldSize`
  ve **botlar ödemiş sayılır** (`domain/race/prize.ts` — proje sahibinin
  "evet ödesin" kararı). Havuz oyuncunun ödediğinden **büyüktür**.
- **Lobi yarışı (bu dilimin konusu):** havuz = `entryFee × GERÇEK oyuncu
  sayısı`; botlar hiçbir şey ödemez ve **bota düşen ödül KİMSEYE ödenmez**
  (`CLAUDE.md` "BOT PAYI YANAR"). Yani gerçek oyuncu sayısı azken havuz
  küçüktür ve yarış oyuncu için **kayıptır**.

`docs/ECONOMY.md` §4.1.1 bu ayrımı yazmıyordu (tablo yalnızca pratik modeli
anlatıyor, ama lobi de o tabloya bakıyormuş gibi okunuyordu); bu dilimde
düzeltildi. **Bu bir denge kararıdır ve DEĞİŞTİRİLMEDİ** — brief'in
"mevcut ekonomi farklı bir bölüşüm kullanıyorsa onu koru ve belgele"
maddesi gereği belgelendi.

**İKİ ÖLÇÜM TUZAĞI (ikisi de bu dilimde yaşandı, ikisi de test hatasıydı —
para yolları doğruydu):**

1. **Bakiye ölçümü KATILIMDAN ÖNCE alınır.** Katılımdan sonra alınan bir
   "önce" ölçümü ödenen giriş ücretini gizler: defter `−200` derken bakiye
   farkı `+10` görünür ve iki sayı **tam olarak giriş ücreti kadar** ayrışır.
   İlk koşuda dört testin dördü de bu yüzden düştü.
2. **`net = 0` yalnızca İPTAL/TERK sonrası "herkes çıktı" durumunda
   doğrudur.** Terk edilmiş bir yarışta **kalan** oyuncunun ücreti hâlâ
   havuzdadır; doğru iddia `net = −kalan ücret`tir. (Buraya `toBe(0)`
   yazılmıştı; test −100 görüp düştü — **test haklıydı, iddia yanlıştı**.)

**KARARSIZ İDDİA KURULMADI.** "En az bir oyuncu ödül aldı" iddiası botlu
testte **yoktur**: 8 atlık sahada 2 gerçek oyuncu ilk beşe girmeyebilir ve
ödül sırası simülasyonun **sonucudur** (seed her koşuda yenidir). Öyle bir
iddia testi kararsız yapardı. O iddia kararlı biçimde **botsuz** sahada
kurulur: orada ödül sırasının tamamı gerçek oyuncudur, yani ödenen toplam
simülasyondan **bağımsız olarak** sabittir (`= havuzun 1 − rake'i`).

**ÇİFT İADE YOK — defter satır sayısıyla kanıtlanır.** İkinci iptal çağrısı
409 `RACE_NOT_CANCELABLE` döner (koruma `Idempotency-Key` değil,
`scheduled → cancelled` geçişidir) **ve** `race_entry_refund` satır sayısı ile
oyuncu bakiyeleri değişmez.

**Açık kalan (bu dilimin kapsamı dışında, uydurulmadı):** platform payı ve
bot artığı için bir **hesap satırı yoktur**, yani "kesilen para nerede"
sorusunun cevabı yalnızca "oyuncu ekonomisinden çıktı"dır — bir gelir
tablosu/günlüğü isteniyorsa bu ayrı bir iştir. Ayrıca pratik yarışın
"botlar ödedi sayılır" modeli **ölçülmedi** (bu dilim lobi zincirini ölçer).

---

#### 13.27 BAĞLANTI KOPMASI / YENİDEN BAŞLATMA — "CLIENT DISCONNECT ≠ HORSE REMOVED" (brief §42 PHASE 4) — 29.09.2026

**BU DİLİM HİÇBİR ÜRETİM KODU DEĞİŞTİRMEDİ.** İptal + iade zaten yazılıydı
(§13.19), çift iade zaten engelliydi (§13.26). Eksik olan şey bu güvencelerin
**kopma ve yeniden başlatma altında da geçerli olduğunun ÖLÇÜLMESİYDİ.**
Kanıt: `apps/api/test/api/race-disconnect.e2e-spec.ts` (6 test, gerçek soket +
gerçek PostgreSQL).

**İDDİA TEK CÜMLE:** oyuncunun interneti kopması, tarayıcıyı kapatması ya da
sunucunun yeniden başlaması **kadroyu, sonucu veya parayı DEĞİŞTİRMEZ**.

| # | Senaryo | Ne kanıtlanır |
|---|---|---|
| 1 | Aynı oyuncu `scheduled`/`locking`/`finished`/`cancelled` dört yarışa girer; **tek soket dört odaya** abone olur, kopar | Dört durumda da `race_entries` satırları **bayt bayt aynı** |
| 2 | Kilit **sonrası** kopma → kesinleşme | Snapshot donmuş kalır; kopan oyuncu sonuçta `participantType = 'human'` ve `finishPosition > 0` ile görünür (listede durmuyor, **koştu**); defter = bakiye farkı |
| 3 | Kopukken **iptal** | İade yine yapılır; oyuncu başlangıç bakiyesine döner; defter neti 0 |
| 4 | **Çoklu kopma** — üç oyuncu aynı anda | Üçü de sonuçta; kadro bozulmaz |
| 5 | **Yeniden bağlanma** + ikinci kesinleşme | Aynı yarışa yeni soketle abone olunur; `GET /races/:id/timeline` **aynı seed + aynı bitiş sırası**; ikinci kesinleşme 409 `RACE_NOT_SETTLEABLE`; defter satır sayısı ve bakiye sabit |
| 6 | **Sunucu yeniden başlama** (ikinci uygulama örneği) | İkinci kesinleşme 409, ikinci iptal 409 `RACE_NOT_CANCELABLE`; **hiçbir satır eklenmez, hiçbir bakiye değişmez** |

**NEDEN GERÇEK SOKET (uydurma kopma reddedildi).** Kopmayı taklit etmenin ucuz
yolu "hiç soket açma, SQL'e dokunma, sonra 'değişmedi' de" olurdu — ve o test
**boş bir cümle** söylerdi: hiç tetiklenmemiş bir kod yolu hakkında hiçbir şey
söylemez. Bu yüzden gerçek bir `socket.io-client` bağlanır, `race.subscribe`
ile odaya girer ve `disconnect()` çağrılır — yani `RaceGateway.handleDisconnect`
**gerçekten koşar**.

**VAKUM TUZAĞI (bu dilimin asıl tekniği).** `client.disconnect()` istemcide
**anında** döner; sunucu olayı **asenkron** işler. Kopmadan hemen sonra iddia
kurmak "sunucu hiçbir şey yapmadı" ile "sunucu henüz işlemedi" durumlarını
**ayırt edemez** — test yeşil kalır, hiçbir şey kanıtlamaz. Bu yüzden her
kopmadan **önce** ikinci bir **tanık soket** odaya sokulur ve kopan soketin
sayıdan düştüğü `race.spectators` olayıyla **beklenir**. O yayın tam olarak
`handleDisconnect`'in içinden çıkar, yani **sunucu tarafı kanıttır**.
Çoklu kopma senaryosunda bariyer farklıdır: kopan oyunculardan biri **yeni**
bir soketle odaya girer ve sayacı `1` okur (kopmalar işlenmemiş olsaydı `4`
okunurdu).

**ÖLÇÜLEN ŞEY `race_entries` SATIRLARININ TAMAMIDIR, `status` DEĞİL.**
`status`e bakmak yetmez: bir hata satırı `cancelled` yapmadan da bozabilir
(`horse_snapshot`ı temizlemek, `gate_position`ı sıfırlamak, `player_id`yi
NULL'a çekmek). Satırlar `JSON.stringify` ile **bütün** olarak karşılaştırılır.

**YAPISAL GERÇEK (test bunu doğruluyor, tesadüf değil):**
`RaceGateway.handleDisconnect` veritabanına **hiç dokunmaz** — yalnızca
`client.data.raceIds` kümesini gezip izleyici sayacını tazeler ve log yazar.
Soket odalardan çıkarılmayı Socket.IO'nun kendisi yapar; elle temizlik yoktur.
Yani "kopma atı yarıştan çıkarır" diye bir kod yolu **yoktur** — bu testler o
yolun **eklenmemesini** korur.

**DÜRÜST SINIRLAR (ölçülmeyen şey iddia edilmedi):**

1. **6. senaryo bir SÜREÇ yeniden başlatması DEĞİLDİR**, yeni bir **uygulama
   örneğidir**. Kanıtladığı şey korumanın DI konteynerine/örneğe özgü bellekte
   değil **veritabanı durumunda** yaşadığıdır. İki örnek **aynı Node sürecini**
   paylaştığı için `module`-scope bir önbelleği **yakalayamaz**; bu sınır test
   dosyasının başına açıkça yazıldı.
2. Gerçek bir `SIGKILL` sırasında **yarıda kalan** bir transaction senaryosu
   test **edilmez**: onun güvencesi uygulama kodu değil, Postgres'in kendi
   atomikliğidir (`withTransaction` — COMMIT'ten önce hiçbir şey kalıcı
   değildir) ve buradan taklit edilemez.

---

#### 13.28 YARIŞ DENGESİ — 10.000 koşum/saha boyutu + SÜRPRİZ PAYI BULGUSU (brief §42 PHASE 5) — 29.09.2026

**BU DİLİM HİÇBİR ÜRETİM KODU DEĞİŞTİRMEDİ.** Ne `race-engine.ts`, ne
`race.config.json`. Yaptığı şey brief'in istediği ölçümü **koşmak**,
**CI'da kilitlemek** ve sonucu **dürüstçe raporlamaktı**.

| Dosya | Rol |
|---|---|
| `apps/api/test/domain/race/race-balance-harness.ts` | Ölçüm motoru — **paylaşılan** saf modül (spec değil) |
| `apps/api/test/domain/race/race-balance.spec.ts` | CI kilidi: 10.000 koşum/saha boyutu + eşikler |
| `apps/api/tools/race-balance-report.ts` | Rapor üreticisi — aynı harness'ı koşar |
| `docs/RACE_BALANCE_REPORT.md` | **ÜRETİLEN** belge (elle yazılmaz) |
| `.claude/race-balance-report.mjs` | Kabuksuz koşturucu (yalnız bu makinede; commit EDİLMEZ) |

Raporu üretmek için (`apps/api` dizininden):

```
node ../../node_modules/tsx/dist/cli.mjs tools/race-balance-report.ts
```

**NEDEN AYNI HARNESS İKİ YERDE:** elle yazılmış bir denge raporu, config
değiştiği anda sessizce yalan söylemeye başlar. Rapor ile CI'ın eşikleri
**aynı kod yolundan** gelmezse, "yeşil CI"nın kanıtladığı şey ile raporun
anlattığı şey ayrışır. Tek modül, iki tüketici.

**ÖLÇÜM: 5 saha boyutu × 5 koşum × 10.000 = 265.125 simülasyon, 31-43 sn.**
Saha boyutları koda gömülmez, `config/race-lobby.config.json` → `fieldSizes`'tan
okunur (CLAUDE.md kural 6).

**DÖRT SAHA, ÇÜNKÜ TEK SAHA YETMEZ.** Her sahada TEK değişken oynatılır:
dar merdiven (62→74), geniş merdiven (55→85), stil (statlar özdeş, yalnız
`racingStyle`), ve **20 ayrı rastgele üretim bot lobisi**. Merdiven sahaları
**yapaydır** — sekiz özellik aynı anda aynı yönde hareket eder ve bu gerçek
bir sahada olmaz; onlar bir *yetenek aktarım probudur*, denge tablosu değil.

**⚠️ ÖLÇÜLEN BULGU — MOTORUN SÜRPRİZ PAYI DARDIR. Bu dilimin asıl çıktısı:**

- Merdiven sahalarında favori %76-98 kazanıyor ve **alt yarı 10.000 yarışta
  HİÇ kazanmıyor**. **Bandı daraltmak düzeltmiyor** (62→74'te de alt yarı
  0.00%) — yani sorun bandın genişliği değil.
- **Üretim sahasında da aynı yönde:** rastgele lobilerde favori ortalama
  `1/N`in **4.94×-8.04×** üzerinde, **en kötü lobide %99.8**, tek bir bot
  galibiyetlerin ortalama %52-70'ini alıyor ve **500 yarışta hiç kazanmayan
  botlar var** (16'lık sahada ortalama 8, en kötü lobide 11).
- **Kök neden bir hata değil, ölçülebilir bir orandır:**
  `randomFactorRange: [-6, 6]` segment başına ±6 puandır ama segment
  performansları yarış boyunca (8 segment) **toplanır** → gürültünün yarış
  düzeyindeki standart hatası `6/√3/√8 ≈ 1.2` puana iner. Bot statları
  `[45,75]` bandından bağımsız çekildiği için dört ağırlıklı statın bileşimi
  ~3.2 puan standart sapma verir; 16 botluk sahada en iyi ile en kötü
  arasında ~11 puan fark oluşur. **Yetenek farkı gürültüyü aşıyor →
  sıralama saha kurulurken belirleniyor.**

**⚠️ BU, DETERMİZMLE KARIŞTIRILMAMALIDIR.** Determinizm (§13.24/§13.27)
motorun *doğruluğudur*: aynı seed aynı sonucu verir ve ölçüm bunu her saha
boyutunda 0 ihlalle doğruladı. Buradaki bulgu ise oyunun **sürpriz payının
genişliğidir**: farklı seed'ler bile aynı sıralamayı üretir. İkisi ayrı
şeylerdir ve ikisi de doğrudur.

**⚠️ DENGE DEĞERİ BİLEREK DEĞİŞTİRİLMEDİ.** `randomFactorRange` / segment
sayısı / taban puan ölçeği değişikliği `race.config.json` değişikliğidir ve
**dondurulmuş `horse_snapshot`ların replay'ini sessizce başka bir sonuca
çevirir** (CLAUDE.md kural 2 — "RACE ENGINE'E DOKUNMA"). Brief PHASE 5
"test et ve raporla" der, "yeniden dengele" demez. Ölçüm karar için gereken
sayıyı üretir; **karar proje sahibinindir.**

**⚠️ BU YÜZDEN `race-balance.spec.ts` ÖLÇÜLEN KÖTÜ DEĞERLERİ KİLİTLEMEZ.**
"Alt yarı hiç kazanmıyor" ya da "en kötü lobide favori %99.8" bir **iyi**
durum değildir; bunları eşik yapmak, ileride düzeltme yapıldığında CI'ı
kırmızıya çevirirdi. Kilitlenen şey **kırılmaması gerekenlerdir**:
determinizm, sıra bütünlüğü, beraberlik nadirliği, yeteneğin sonuca
dönüşmesi (`1/N`in ≥3 katı), **tam determinizm OLMAMASI** (favori < 0.995),
hiçbir stilin ölü/baskın olmaması, mesafenin sonuca girmesi, üretimde
favorinin makul bantta kalması. Ölçülen risk **raporda** yazılıdır.

**DÜRÜST EKSİKLER (ölçülmeyen iddia edilmedi):**

1. **`gatePosition` ölçülmedi — motora hiç girmiyor.** `race_entries.
   gate_position` yalnızca yazılır, saklanır ve istemciye yansıtılır
   (`settle-race.use-case.ts` → `postgres-race.repository.ts` →
   `race.gateway.ts`); `simulateRace` onu **hiç okumaz**. Brief §17/§21 kapı
   pozisyonunu bir faktör sayar. Bu bir denge bulgusu değil, **bağlanmamış
   bir özelliktir** — olmayan bir etkiyi "dengeli" diye raporlamak uydurma
   olurdu.
2. **Jokey ölçülmedi** — `jockeySkillComposite` her zaman nötr `50`
   (`NEUTRAL_UNMODELED_TRAIT_SCORE`), `race_entries.jockey_id`'yi yazan kod
   yok. Ölçümde nötr bırakıldı: uydurma bir jokey değeri dengeyi üretimde
   olmayan bir sinyalle şişirirdi. **PHASE 6.**
3. **`startApproach`/`finalStretchPlan` ölçülmedi** — `assertValidRaceTactic`
   doğrular ama `simulateRace` yalnızca `racingStyle` ve `riskLevel` okur;
   ikisi bugün **doğrulanan ama kullanılmayan** alanlardır. **PHASE 6.**
4. **Tek mesafe/zemin/hava** — kanonik yarış 1600 m / çim / güneşli / 22 °C;
   yalnızca mesafe probu (1200/1600/2400) tarandı.
5. **Gerçek oyuncu atı verisiyle ölçüm yok** — sahalar sentetik merdivenler,
   sentetik özdeş alan ve üretim botlarıdır.

**KANIT:** `race-balance.spec.ts` (CI) + `docs/RACE_BALANCE_REPORT.md`
(265.125 simülasyonun tam tablosu). Rapor "ölçüm zamanı" ve "config parmak
izi" satırlarını taşır: config değişip rapor güncellenmezse okuyucu bunu
başlıktan görür.

---

#### 13.29 TAKTİK MOTORUN İÇİNDE — ve bu sırada bulunan İKİ ADALET HATASI (brief §42 PHASE 6) — 29.09.2026

**Kapanan boşluk:** `startApproach` ve `finalStretchPlan` `assertValidRaceTactic`
(`entrant-snapshot.ts`) tarafından **ZATEN doğrulanıyordu**, ama `simulateRace`
onları **hiç okumuyordu**. Oyuncu "sert kalk" seçtiğinde sonuç bit bit aynı
kalıyordu. Doğrulanan ama tüketilmeyen bir alan, oyuncuya gösterilen **sessiz
bir yalandır**; bu dilim o boşluğu kapattı.

| Dosya | Rol |
| --- | --- |
| `apps/api/src/domain/race/pace.ts` | `deriveTacticEffect` — iki eksenin motor etkisi |
| `apps/api/src/domain/race/race-engine.ts` | taktiği segmente bağlar + **`isBoxedIn` adalet düzeltmesi** |
| `config/race.config.json` → `tactic` | bütün sayılar (gizli bonus yok) |
| `packages/game-config/src/types.ts` | `RaceBalanceConfig['tactic']` |
| `apps/api/test/domain/race/tactic-effect.spec.ts` | 10 test — mekanizma + motor ölçümü |

**ÖLÇÜM MİMARİSİ İKİ KATMANLIDIR.** Katman 1 (`deriveTacticEffect` doğrudan
çağrılır) mekanizmayı iddia eder: pencereler ayrık mı, ödünleşim kapalı mı,
tanınmayan değer nötr mü. Katman 2 (`simulateRace`) **2.000 koşumla** sonucu
ölçer. Tek katman yeterli değildir: yalnızca katman 1 olsaydı "puan doğru
hesaplanıyor" derdi ama puanın **kazanmaya** dönüşüp dönüşmediğini bilmezdi;
yalnızca katman 2 olsaydı sayı yeşil/kırmızı olurdu ve **neden** olduğu
bilinmezdi.

**⚠️ BULGU 1 — `isBoxedIn` BİR ADALET HATASIYDI (üretimi de etkiliyordu).**
`computeStandings`'te `isBoxedIn: gapToAheadMs <= closeGapMs` yazıyordu.
Yarışın BAŞINDA (segment 0) her atın `cumulativeTimeMs`'i tam olarak **0**'dır,
yani `ordered` dizisinin İKİNCİ elemanı "önündeki atla aynı hizada" olduğu için
bloklanmış sayılıyor ve o segmentte **15 puanlık** bloklanma cezasını
yiyebiliyordu — birincisi ise **asla**. Yani `entries` dizisindeki SIRA, kimse
fark etmeden bir avantaj üretiyordu. İki BİT BİT ÖZDEŞ atla ölçüldüğünde
birinci at koşumların **%65.2'sini** kazanıyordu (beklenen %50). Düzeltme
`gapToAheadMs > 0` şartıdır: **aynı hizada olmak "arkada olmak" değildir.**
Ölçüm sonrası pay **0.4995**. Bu bulgu bu dilimde ortaya çıktı ama **hiçbir
zaman bu dilime ait değildi** — üretimdeki her yarışı etkiliyordu ve hiçbir
yerde hata üretmiyordu.

**⚠️ BULGU 2 — `normal` final planı NÖTR DEĞİLDİ.** `finalStretchPlan.normal`
`bonusMultiplier: 1` taşıyordu ve taban bonus `3`'tü; yani taktik seçimine
**hiç dokunmamış** her oyuncu final düzlükte sessizce **+3 puan** alıyordu.
Taban `6`'ya çıkarıldı ve `normal` artık **açıkça referans plan** olarak
belgelendi; test "sıfır etki" değil, **belgelenmiş referans değeri** iddia eder.

**⚠️ ÖLÇÜLEN KURAL 1 — BU EKSENDE STAMINA ÇARPANI OLMAZ.**
`baseStaminaConsumptionPerSegment` zaten `100 / segmentCount`'tur, yani stamina
**tam olarak bitişte** tükenir. 1.0'ın üstündeki her çarpan son segmenti
`depletionPenaltyMultiplier`a (0.85) sokar. Ölçüldü: `aggressive`e 1.15 çarpanı
verildiğinde galibiyet payı **0.529 → 0.0535**. Bu bir ödünleşim değil,
**bıçak sırtıdır**. `startApproach`'in stamina çarpanı bu yüzden hem config'ten
hem tipten **kaldırıldı**; yerine iki bonus ZIT İŞARETLİ ve EŞİT BÜYÜKLÜKTE
yapıldı (toplam değişmez, yalnızca ZAMANLAMA değişir).

**⚠️ ÖLÇÜLEN KURAL 2 — PUAN SİMETRİSİ, SONUÇ SİMETRİSİ DEĞİLDİR.**
`segmentTimeMs = 1_250_000 / performanceScore` **dışbükeydir** (Jensen): aynı
ortalamaya sahip **dalgalı** bir puan profili, **düz** olandan DAHA YAVAŞTIR.
Bu yüzden erken puan kazanıp final düzlükte geri veren bir plan, puanı
"ödünç verdiği" için değil, profili **dalgalandırdığı** için kaybeder. Ölçüm:
`balanced` (en düz) **0.4965**, `aggressive` **0.441**, `controlled` **0.345**.
Bu, "sıra bitişte ters döner" hipotezini **çürüttü** — hipotez ölçüldü ve
testten çıkarıldı, spec'in yorumuna bulgu olarak yazıldı.

**⚠️ ÖLÇÜLEN KURAL 3 — TAKTİK BİR RİSK-DAĞILIMI SEÇİMİDİR, BEDAVA PUAN DEĞİL.**
Dokuz kombinasyonun hiçbiri "ölü" değil ve hiçbiri uniform payın 3 katını
aşmıyor: en düşük **%7.0**, en yüksek **%14.3** (uniform **%11.1**).

**DEĞİŞEN SÜRÜMLER.** `RACE_RULESET_VERSION` `1.1.0` → **`1.2.0`** (kural
modülü formülü değişti). `RACE_ENGINE_VERSION` **`1.0.0`'da KALIR** — üç geçişli
segment döngüsünün YAPISI değişmedi. `race.config.json` sürümü `1.0.0` →
`1.1.0`; `docs/RACE_BALANCE_REPORT.md` **yeniden üretildi** (`1.2.0`, parmak
izi `3dd447a8a8dd`).

**DÜRÜST EKSİKLER (ölçülmeyen iddia edilmedi):**
1. ~~**Jokey hâlâ nötr** — `jockeySkillComposite` her zaman `50`.~~
   **KAPANDI (§13.30, PHASE 6.2)** — aşağıdaki madde bu dilimin çıkış
   noktasıydı ve artık geçerli değil.
2. **Kişilik hâlâ yok** — `Horse.temperament` motora hiç girmiyor. **PHASE 6.3.**
3. **`gatePosition` hâlâ okunmuyor** — §13.28'deki bulgu aynen durur.
4. **Ölçüm tek mesafede** (1600 m / çim / güneşli / 22 °C).
5. **Botlar taktik seçmez** — `generateBotEntrants` hepsini `balanced`/`normal`
   üretir, yani ölçüm gerçek oyuncu çeşitliliğini temsil etmez.

**KANIT:** `tactic-effect.spec.ts` (CI, 10 test, 2.000 koşum/ölçüm) +
`race-balance.spec.ts` (eşikler) + `docs/RACE_BALANCE_REPORT.md` (1.2.0).

---

#### 13.30 JOKEY MOTORUN İÇİNDE — ve zincirin hiç bağlanmamış olduğu gerçeği (brief §42 PHASE 6.2) — 29.09.2026

**Kapanan boşluk, §13.29'un 1. dürüst eksiğiydi.** `jockeys` tablosu,
`domain/jockey/jockey.ts` ve `calculateJockeySkillComposite` **FAZ 2'den beri**
vardı; `config/jockey.config.json` da öyle. Zincirin **hiçbir halkası bağlı
değildi**:

| Kırık halka | Belirti |
| --- | --- |
| `loadJockeyConfig()` | Tanımlıydı, **hiç çağrılmıyordu** |
| `jockeySkillComposite` | Motora **her zaman nötr 50** olarak giriyordu |
| Kiralama ucu | **Yoktu** — jokey hiçbir yoldan sahiplenilemiyordu |
| `race_entries.jockey_id` | Kolon vardı, çağrı yerleri dolduruyordu, **repository sessizce `NULL` yazıyordu** |

Yani jokey oyuncu için **tamamen görünmezdi**: ne etkisi, ne de sahibi.

**⚠️ ÖLÇÜLEN KURAL 4 — İKİ DEĞER TEK OKUMADAN DOĞMALIDIR.**
`EntrantSnapshotBuilder.build()` artık jokey **nesnesi** değil bir **struct**
döner: `{ snapshot, jockeyId }`. Gerekçe: motora giren kompozit ile
`race_entries.jockey_id`nin **iki ayrı okumadan** doğması imkânsız hâle gelir.
Ayrım olsaydı oyuncu **kilit ile kesinleşme arasında** jokey değiştirebilir ve
sonuç ekranı **binmediği** bir jokeyi gösterebilirdi — hiçbir yerde hata
üretmeden.

**ÜÇ YOL DA BAĞLANDI.** Yalnızca biri bağlansaydı jokey oyuncunun **en çok
kullandığı** akışta görünmez olurdu: (1) kesinleşme (`SettleRaceUseCase`),
(2) kilitleme (`LockRaceUseCase` — `jockey_id` **dondurulmuş snapshot ile AYNI
transaction'da** yazılır), (3) pratik yarış + PvP eşleşme. Jokey **oyuncuya**
aittir (`findByOwnerId(playerId)`), **ata değil** — oyuncu sahip olduğu
herhangi bir atla aynı jokeyi biner. PvP'de **iki tarafın jokeyi ayrı ayrı**
çözülür; aksi hâlde bir oyuncunun jokeyi rakibine de yazılırdı.

**⚠️ BOTLAR HER ZAMAN `null` → nötr 50.** Brief'in *"AI'ye gizli performans
bonusu verme"* kuralının doğrudan uygulanmasıdır: jokeyi olmayan oyuncu ile bot
**aynı yerde** durur. Yani jokey kiralamak bir **avantajdır** ve bu avantaj
oyuncunun **ekranında görünür** (vitrin + kompozit ucu).

**YENİ PARA YOLU: `POST /jockeys/:jockeyId/hire`.** Projenin **en küçük** para
yoludur ve yine de tam kurala uyar: `SELECT ... FOR UPDATE` (önce `jockeys`,
sonra `players`) + **aynı transaction'da** `economy_transactions` satırı.
Kanonik aile **`UPKEEP`** (`ENTRY_FEE` **değil** — jokey kiralamak bir yarışa
giriş değildir; cüzdanda "giriş ücreti" başlığı altında görünmesi oyuncuya
yanlış bir tablo çizerdi).

**⚠️ `Idempotency-Key` BİLEREK YOK — ve gerekçesi §13.23'ün tersidir.**
Çift kiralamayı anahtar değil **durum geçişi** engeller: ikinci çağrı
`owner_id`yi dolu bulur ve 409 alır (`scheduled → finished` geçişiyle **aynı
desen**). `Idempotency-Key` başlığı **okunup yok sayılmaz** — okunup yok
sayılsaydı istemci anahtar gönderdiğinde "korunuyorum" sanırdı.

**İKİ FARKLI 409 — kodlar AYRI.** `JOCKEY_ALREADY_OWNED` ("jokey başkasında")
ve `JOCKEY_ALREADY_HIRED` ("senin zaten jokeyin var"). İstemcinin önereceği
eylem farklıdır: *"başka jokey seç"* / *"önce mevcut jokeyini bırak"*.

**⚠️ ÜCRETSİZ JOKEY DEFTERE YAZILMAZ** (`salary = 0` olabilir, kolonun
varsayılanı 0). `economy_transactions.amount <> 0` CHECK'i sıfır tutarlı bir
"hareketi" reddeder ve bu **doğrudur** — muhasebe anlamında
gerçekleşmemiştir. Kiralama yine gerçekleşir; bu yüzden bu türü **arayan** bir
sorgu ücretsiz kiralamaları **bulmaz** (kiralama gerçeğinin tek kaynağı
`jockeys.owner_id`).

**⚠️ `UNMODELED_SNAPSHOT_FIELDS` ARTIK BOŞ.** Son üyesi
`jockeySkillComposite`ti ve bağlandı. Liste **silinmedi, boşaltıldı**: tripwire
testinin döngüsü duruyor (PHASE 6.3 kişilik alanı eklendiğinde yine kilitler)
ve yanına **pozitif** bir iddia eklendi — *"liste boş"* demek *"jokey bağlandı"*
demek **değildir**.

**Yol boyunca bulunan iki gerçek hata:**
1. `error-codes.ts`te `JOCKEY_ALREADY_OWNED` anahtarı **iki kez** tanımlanmıştı
   (FAZ 2 bloğu + bu dilimin eki) → `tsc` **TS1117**. Değeri kopyalamak yerine
   tek yerde tutuldu.
2. `LedgerTransactionType` **kapalı** bir birleşimdir; `jockey_hire` eklenmeden
   deftere yazmak **derleme hatası** verirdi. Eklendi + kanonik eşlemesi +
   istemci etiketi (`ledger-labels.spec.ts` ikisinin uzunluğunu karşılaştırır).

**⚠️ CI #224 KIRMIZI OLDU — VE SEBEBİ BU DİLİM DEĞİLDİ, HARNESS'Tİ.**
PHASE 6.1 `RACE_RULESET_VERSION`ı `1.1.0 → 1.2.0` yükseltti; `race.e2e-spec.ts`
ve `matchmaking.e2e-spec.ts` **sabit metinle** `'1.1.0'` bekliyordu. Yerel
harness **yeşil** raporlamıştı çünkü bu iki dosya, elle tutulan **on dosyalık**
e2e listesinde **yoktu**. Düzeltme iki katmanlıdır:

1. **İddia kaynaktan okunur.** `toBe('1.1.0')` → `toBe(RACE_RULESET_VERSION)`
   (config için `appConfig.race.version`). Eski hâli bir **değişmez** değil bir
   **olguyu** ölçüyordu: *"kimse sürümü yükseltmedi mi"*. Oysa sürüm
   yükseltmek — formül değiştiyse — **zorunludur**; onu engelleyen test yanlış
   şeyi kilitler. Sabitin **kendisinin** beklenen değerde olduğunu kilitleyen
   test `tactic-effect.spec.ts`te durur, yani pin **kaybolmadı, yeri düzeldi**.
2. **Liste kaldırıldı.** Harness'in iki elle-seçilmiş grubu (5 domain dizini +
   10 e2e dosyası) tek bir **tam paket** koşusuna indirildi: CI'ın koştuğu
   komutun ta kendisi (`vitest run --passWithNoTests`, yol filtresi yok).
   Artık *"harness'te yok"* diye bir durum **kalamaz** — yeni bir test dosyası
   için güncellenecek bir yer olmadığı için unutulması da mümkün değildir.
   Aynı tuzak **iki kez** ısırmıştı (28.09.2026 `test/domain/race`); ikinci
   kez ısırdığında çözüm *"listeye ekle"* değil *"listeyi kaldır"* oldu.

**KANIT:** `test/api/jockey.e2e-spec.ts` (13 test, **gerçek PostgreSQL**) —
para yolu (bakiye farkı = defter `amount` = `balance_after − balance_before`),
yetersiz bakiye (ne sahiplik ne defter), iki ayrı 409, 404, 403, ücretsiz jokey.
**MOTOR KANITI:** kiralama **sonrası** gerçek pratik yarış koşturulur ve
`race_entries`ten `jockey_id` **dolu** + kompozit **config'ten hesaplanan
değere eşit** okunur; **kontrol grubunda** `jockey_id` `NULL` + kompozit nötr
50. Bu iddia olmadan *"uç nokta var"* demiş olurduk.
`test/domain/jockey/jockey-config.spec.ts` (11 test) ağırlık toplamlarını ve
**"ortalama jokey (tüm beceriler 50) TAM nötr 50 verir"** değişmezini kilitler —
bu iddia ağırlıklar bozulursa kırılır ve *"jokey kiralamak gizli bonus mu?"*
sorusunu CI'da yanıtlar.

**RACE ENGINE'E DOKUNULMADI.** `jockeySkillComposite` zaten FAZ 1'den beri
`base-ability.ts`in girdisiydi; bu dilim o **girdiyi doldurdu**.
`RACE_RULESET_VERSION` ve `RACE_ENGINE_VERSION` **değişmedi**.

**DÜRÜST EKSİKLER:**
1. **İstemci tüketicisi yok** — `GET /jockeys`, `GET /players/:id/jockey`,
   `POST /jockeys/:jockeyId/hire` üçünün de **arayüzü yazılmadı**. Brief'in
   *"sadece endpoint'i var diye tamam sayma"* kuralı gereği bu dilim
   **PARTIAL**'dır, IMPLEMENTED değil.
2. **Jokey yarış sonucunda gösterilmiyor** — `race_entries.jockey_id` yazılıyor
   ama sonuç ekranı onu okumuyor.
3. **Jokey bırakma yolu yok** — `JOCKEY_ALREADY_HIRED` mesajı *"önce mevcut
   jokeyini bırak"* diyor, ama **bırakma ucu yoktur**. Yani o mesaj bugün
   **yapılamayan bir şeyi öneriyor**.
4. **Jokey yorgunluğu/sakatlığı yok** — `jockeys.experience` ve beceriler
   motora girer, ama jokeyin kendi durumu (dinlenme, form) modellenmez.
5. **`compatibilityWeights` motora girmiyor** — `calculateJockeyHorseCompatibility`
   yazıldı ve test edildi ama **hiçbir çağrı yolu yok**; motora giren tek şey
   `calculateJockeySkillComposite`tir.
6. ~~**Kişilik hâlâ yok** — `Horse.temperament` motora hiç girmiyor. **PHASE 6.3.**~~
   **KAPANDI — §13.31 (29.09.2026).**

---

#### 13.31 KİŞİLİK (MIZAÇ) MOTORUN İÇİNDE — ve ölçümün ortaya çıkardığı ASİMETRİ HATASI (brief §42 PHASE 6.3) — 29.09.2026

**Kapanan boşluk, §13.30'un 6. dürüst eksiğiydi.** `horse_stats.temperament`
**migration 0003'ten beri** veritabanındadır, üremeyle yavruya geçer
(`INHERITED_STAT_COLUMNS`), API'de okunur/yazılır — ama `simulateRace` onu **hiç
görmüyordu**. Yani oyuncunun yetiştiricilik kararlarından biri (*"hangi tayı
tutayım"*) yarış sonucuna hiç etki etmiyordu ve bunu **ne derleyici ne hiçbir
test** söylüyordu. Aynı sınıf hata, aynı ailede **üçüncü** kez (§13.25
`aiFillEnabled`, §13.30 `jockeySkillComposite`).

**YÖN — "SICAK AT HIZLI KALKAR, ÇABUK YORULUR."** `heat = (temperament − 50)/50`
ile `[-1, +1]`'e normalize edilir. Erken kalkış penceresinde sıcak at
`+heat × startBonusMax` puan alır ve `+heat × energyCostMax` kadar **fazla
stamina yakar**; final düzlüğünde **aynı puanı geri verir** ve aynı enerjiyi
**geri kazanır**. Bütün sayılar `config/race.config.json` → `temperament`
bloğundadır (`neutral: 50`, `windowFraction: 0.25`, `startBonusMax: 4`,
`latePenaltyMax: 4`, `energyCostMax: 0.06`) — **sihirli sayı yok**.

**⚠️ 50 = TAM NO-OP — ve bu, mevcut ölçümleri DEĞİŞTİRMEMENİN tek yoluydu.**
`temperament` `undefined` ise (bu alanı hiç doldurmayan eski fixture) ya da tam
olarak `neutral` (50) ise fonksiyon sabit nötr nesneyi döner. Başlangıç atları
`DEFAULT 50` alır ve **botlar `generateBotEntrants` içinde sabit 50 üretir** —
yani `docs/RACE_BALANCE_REPORT.md`'nin 265.125 koşumu ve
`race-balance.spec.ts` eşikleri **bit bit aynı** kaldı. Bu iddia sözle değil
**testle** kilitlendi: aynı seed'lerle 50 yarış, alan varken ve yokken
`JSON.stringify` ile **birebir** karşılaştırılır.

**⚠️ ÖLÇÜLEN HATA — "KAPALI ÖDÜNLEŞİM" KÂĞITTA DOĞRUYDU, MOTORDA DEĞİLDİ.**
İlk sürüm iki pencereyi **ORANLA** kuruyordu (`positionFraction <= 0.25` /
`>= 0.75`). Motor `positionFraction`ı `(segmentIndex + 1) / segmentCount` olarak
ürettiği için (bkz. `race-engine.ts`), 1600 m / 200 m'lik bir yarışta bu **erken
pencereye 2, final penceresine 3 segment** sokuyordu. Sonuç: sakin at
`3 × (+4)` kazanıp `2 × (−4)` ödüyordu — yani **net +4 puan bedava avantaj**.
5.000 koşumluk 1v1 ölçüm (rakip nötr) hatayı gösterdi:

| temperament | ilk sürüm (oran) | düzeltilmiş (segment) |
| --- | --- | --- |
| 0 (sakin) | **0.5686** | 0.4764 |
| 25 | 0.5448 | 0.5022 |
| 50 (nötr) | 0.4956 | 0.4956 |
| 75 | 0.4630 | 0.5088 |
| 100 (sıcak) | **0.3816** | 0.4814 |

Düzeltme: pencere genişliği `windowFraction × segmentCount` ile **SEGMENT
cinsinden** hesaplanır ve `floor(segmentCount / 2)` ile sınırlanır — böylece iki
pencere **her mesafede** hem aynı sayıda segment içerir hem de **asla
çakışamaz**. `temperament.spec.ts` bunu 800'den 3200 metreye **yedi** mesafede
iddia eder (`800m 1/1 · 1000m 1/1 · 1200m 2/2 · 1600m 2/2 · 2000m 3/3 · 2400m 3/3
· 3200m 4/4`).

**⚠️ BU HATAYI GALİBİYET PAYI TESTİ YAKALAMAZDI.** Spec'in "hiçbir uç nötr atı
ezmez" iddiası önce `0.75/0.25` sınırıyla yazılmıştı ve **eski hatanın 0.3816
değeri o sınırın içinde kalıyordu** — yani test yeşil kalırken hata yaşardı.
Sınır **0.56/0.44**'e çekildi: bu bir "iyi durum hedefi" değil, bulunan gerçek
hatayı **iki uçtan da** yakalayan bir değişmez sınırıdır (0.5686 > 0.56 ve
0.3816 < 0.44). Tohumlar sabit olduğu için ölçüm deterministiktir — kırılırsa
motor gerçekten değişmiştir.

**ZİNCİR — altı halka, hepsi bağlı:**

| Halka | Nerede |
| --- | --- |
| Veritabanı | `horse_stats.temperament` (migration 0003, `NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK 0..100`) |
| Snapshot | `buildHorseEntrantSnapshot` → `temperament: stats.temperament` (YENİ parametre GEREKMEZ, `stats` zaten imzada) |
| Sözleşme | `RaceEntrantSnapshot.temperament` (**opsiyonel** — `equipmentModifier` ile aynı gerekçe) |
| Kural | `domain/race/temperament.ts` → `deriveTemperamentEffect` (saf, framework'süz) |
| Motor | `race-engine.ts` Geçiş C — puan toplamı **ve** stamina çarpanı |
| Config | `config/race.config.json` → `temperament` bloğu; `RACE_RULESET_VERSION` `1.2.0 → 1.3.0` |

**⚠️ `UNMODELED_SNAPSHOT_FIELDS` LİSTESİ BOŞ KALDI — VE BU BİLİNÇLİ.** §13.30
listeyi silmeyip boşaltmıştı; PHASE 6.3 kişiliği **bağlamayı** seçti (nötr
bırakmak yerine), yani listeye yeni bir üye **eklenmedi**. Yanına **pozitif** bir
iddia kondu: `temperament` `stats`ten **aynen** okunur (82 → 82, 17 → 17), sabit
50 değil.

**⚠️ AI'YE GİZLİ BONUS TRIPWIRE'I — bu dilimde de var.** `temperament.spec.ts`
`generateBotEntrants(12, 'anti-cheat-seed')` çağırır, **hepsinin 50 olduğunu**
ve çağrılar arasında **deterministik** olduğunu iddia eder; ayrıca bot sahasının
alan varken ve yokken **JSON-özdeş** olduğunu gösterir. Motora giren girdi ile
oyuncuya gösterilen sayı arasına bir çarpan girse test **kırılır**.

**⚠️ `race-engine.ts` DEĞİŞTİ — ve bu CLAUDE.md'nin "RACE ENGINE'E DOKUNMA"
kuralıyla ÇELİŞMİYOR.** Kuralın ölçtüğü şey **determinizmdir**, "dosyaya
dokunma" değil. `RACE_ENGINE_VERSION` (3-geçişli yapı: Geçiş A/B/C) **sabit
kaldı**; yalnızca `RACE_RULESET_VERSION` yükseldi — yani *formül* değişti,
*çatı* değişmedi. `tactic-effect.spec.ts`teki sürüm pin'i tek yerde durur ve
`1.3.0`'a güncellendi.

**DÜRÜST EKSİKLER:**
1. **Başlangıç atları hep 50 alır** — etki bugün yalnızca **üreme**
   (`INHERITED_STAT_COLUMNS`) ve **pazar** çeşitliliğinden doğar. Başlangıç
   atlarına değişkenlik veren bir dilim yoktur; o gelene kadar kişilik, oyuncunun
   **kendi yetiştirdiği** atlarda anlam kazanır.
2. **Oyuncu bu statı EKRANDA göremez** — `VisibleHorseStats` `temperament`
   taşımaz. Bu bir AI bonusu **değildir** (atın kendi istatistiğidir, brief'in
   yasağı ihlal edilmez) ama *görünürlük* eksiktir: oyuncu sonucu açıklayan
   sayıyı okuyamaz.
3. **`domain/jockey/jockey.ts` içindeki `calculateTemperamentComponent` hâlâ
   çağıransız** — yönü artık motorunkiyle **aynı** (yüksek temperament = kontrolü
   zor) ama o zincir bağlandığında bu ikisinin **uzlaştırılması** gerekir.
4. **Ölçüm tek mesafede** (1600 m / çim / güneşli / 22 °C) — pencere simetrisi
   yedi mesafede test edilir, ama **galibiyet payı** ölçümü tek mesafededir.
5. **`gatePosition` hâlâ okunmuyor** — §13.28'deki bulgu aynen durur.

**KANIT:** `test/domain/race/temperament.spec.ts` (14 test: no-op kanıtı, pencere
simetrisi 7 mesafede, kapalı ödünleşim, kırpma, AI tripwire) +
`test/domain/race/entrant-snapshot.spec.ts` (pozitif okuma iddiası) +
`tactic-effect.spec.ts` (sürüm pini `1.3.0`) + `docs/RACE_BALANCE_REPORT.md`
(§7.2/§7.3/§7.4 ve §8 tablosu bu dilimde **düzeltildi** — eskiden "jokey bağlı
değil" yazıyordu ve **artık yanlıştı**).

#### 13.32 TRIBÜN — kontenjan + iade + fiyatın tek kaynağı + canlı izleyici odası (brief §42 PHASE 7) — 29.09.2026

**Dört boşluk kapatıldı ve dördü de "hata üretmeyen" türdendi** — yani hiçbiri
ne derleyiciye ne başka bir teste görünüyordu.

1. **KAPASİTE HİÇ UYGULANMIYORDU.** `races.spectator_capacity` (migration 0036)
   okunuyordu ama **hiçbir yerde karşılaştırılmıyordu**: 501. bilet de satılırdı.
   Artık `purchaseTicket` transaction'ının **içinde**, `races` satırı
   `FOR UPDATE` altındayken sayılır ve dolarsa 409 `RACE_TRIBUNE_FULL` döner.
   Dışarıda saymak TOCTOU penceresi bırakırdı.
2. **FİYATIN İKİ KAYNAĞI VARDI.** Satılan fiyat config'teki `ticketPrice`
   (her zaman 25), `races.tribune_fee` sütunu ise **ölü** idi. Artık tek kaynak
   `races.tribune_fee`: `PurchaseTicketInput` `price`/`currency` **taşımaz**,
   repository tutarı **kilitli yarış satırından** okur ve `PurchaseTicketResult`
   ile geri döner — yanıt defterle çelişemez. Config'teki değer yeniden
   adlandırıldı (`defaultTribuneFee`) ve **oluşturma anı varsayılanı** oldu;
   yanına `defaultSpectatorCapacity` eklendi (500 SQL şemasında gizli bir denge
   parametresiydi).
3. **İADE YOKTU.** `DELETE /races/:id/tickets` eklendi: `race_tickets` satırı
   `DELETE ... RETURNING` ile silinir, tutar **satırın kendi `price` sütunundan**
   okunur (`races.tribune_fee` **değil** — yarışın ücreti sonradan değişse bile
   geçmiş bir satın alma kendi tutarını korur), bakiyeye credit edilir ve **aynı
   transaction'da POZİTİF** bir `grandstand_ticket_refund` defter satırı yazılır.
   Çift iadeyi `IdempotencyInterceptor` değil, **0 satır dönmesi** engeller (404).
4. **`tribune_fee = 0` SEMANTİĞİ TANIMSIZDI.** 0 bir yokluk değil, "tribün
   ÜCRETSİZ" demektir: izlemek için bilet **gerekmez**
   (`canWatchRaceWithoutTicket`) ve o yarışa bilet **satılmaz** (409
   `RACE_TRIBUNE_FREE` — 0 tutarlı bir defter satırı
   `economy_transactions.amount <> 0` kısıtına da uymazdı). Karar **tek
   fonksiyonda** durur çünkü iki yerde aynı olmak zorundadır (timeline kapısı +
   satın alma kapısı); ayrışırlarsa ya bedava yarışa bilet satılır ya bedava
   yarış kimseye açılmaz — ikisi de sessiz hata.

**⚠️ SESSİZ HATA DÜZELTMESİ — `@IdempotencyScope('player')` ANAHTAR UZAYI
ÇAKIŞMASI.** Bu scope'u kullanan **tüm** rotalar aynı `idempotency_keys` anahtar
uzayını paylaşıyordu: PK `(scope_id, idempotency_key)` ve `scope_id` **rotayı
içermiyor**. İki farklı rotada aynı `Idempotency-Key` kullanılırsa ikinci istek
**birincinin önbelleklenmiş yanıtını** alır ve handler **hiç koşmaz**. Artık
`scope_id` `ControllerClass.handlerMethod:` ile öneklenir
(`market.e2e-spec.ts`'teki tek literal iddia güncellendi).

**⚠️ `insertRaceRow` YER TUTUCU SAYISI — 25 SÜTUN / 24 İFADE (29.09.2026).** Bu
dilimin **kendi hatasıydı** ve tam paket koşumunda patladı: `tribune_fee` +
`spectator_capacity` sütunları eklenirken VALUES kuyruğu **+1** kaydırılmıştı
(+2 yerine), yani `created_at`/`updated_at` birer ifade eksik kalıyordu.
`INSERT has more target columns than expressions` → **her pratik yarış / PvP
insert'i 500** → 53 test düştü. Ders: **SQL bir metindir; `tsc` onu görmez.**
Bu yüzden `.claude/phase7-db-check.mjs` yazıldı — şemayı sıfırlar, migration'ları
uygular ve `insertRaceRow`u **gerçekten çalıştıran** e2e dosyalarını koşar
(~53 sn). Saf domain testleri + tip kontrolü bu sınıf hatayı **yapısal olarak**
göremez.

**⚠️ İSTEMCİ TARAFI (PHASE 7.3/7.4/7.5) — SUNUCU HAZIRDI, TÜKETİCİ YOKTU.**
`chat.message`/`chat.message.received`/`chat.history`/`chat.error`/
`race.spectators` olayları 27.09.2026'dan beri sunucuda vardı ama **hiçbir
istemci tüketicisi yoktu**. `RaceChatPanel` bunları tüketir ve **bilerek
`RaceHud`'un İÇİNE KONMADI**: `RaceHud` `memo()` + 10 Hz HUD kısıtlaması taşır,
sohbet durumunu ona geçirmek her mesajda tüm HUD'ı yeniden çizerdi.

**⚠️ GÖNDERİLEN MESAJ İYİMSER (optimistic) EKLENMEZ.** Sunucu **kaydedilen**
satırı `chat.message.received` ile yayar; iki kaynak aynı mesajı iki kez
gösterirdi. Geçmiş de **tekilleştirilir** çünkü `chat.history` **her
`race.subscribe`'da** (socket.io otomatik yeniden bağlanmaları dahil) yeniden
gönderilir. Birleştirme `chat-history-merge.ts`'te **saf** bir fonksiyondur
(`segment-merge.ts` kardeşi): tarayıcısız test edilebilir. Sıralama `createdAt`'e
göredir çünkü gateway geçmişi **`await` ederken** odadaki başka bir izleyicinin
canlı mesajı **önce** varabilir — naif "sona ekle" eski mesajı yeninin arkasına
koyardı. Hiçbir şey değişmediyse **aynı referans** döner. Mesaj tavanı
`config/chat.config.json → historyLimit` (**sihirli sayı yok**).

**⚠️ GRANDSTAND'IN "İZLE" BAĞLANTISI YANLIŞ SAYFAYA GİDİYORDU (7.5).**
`/replays/[raceId]` yarışı `GET /races/:id/timeline` ile **statik** bir tekrar
olarak oynatır — HTTP, tek seferlik, **soket YOK**. Sonuç: `race:${raceId}`
odası **boş** kalıyordu, yani `race.spectators` hiçbir izleyiciyi
**saymıyordu** ve tribün sohbeti **ölüydü**. "İzleyici" kavramı sunucuda vardı,
istemcide **yoktu**. Yeni `/races/[raceId]/watch` sayfası `LiveRaceViewer`'ı
mount eder, o da `race.subscribe` gönderir. **Yetki kapısı YENİDEN
YAZILMADI:** `race.subscribe` sunucuda `GetRaceTimelineUseCase.execute(raceId,
playerId)` çağırır — yani `GET /races/:id/timeline` ile **aynı** kapı.
`GET /races/:id` **uydurulmadı** (böyle bir uç nokta yok); `ownHorseId`
geçirilmedi (izleyicinin bu yarışta atı yoktur, uydurma bir id "benim atım" gibi
gösterirdi).

**⚠️ İKİ İDEMPOTENCY DESENİ BİLEREK FARKLIDIR.** `grandstand/page.tsx` bilet
alırken her basışta **yeni** anahtar üretir (zarar: ikinci bir *bilet*),
`wallet/page.tsx` anahtarı başarısızlıkta **saklar** (zarar: ikinci bir *para
girişi*). **İade** ise bir **gelir** yoludur: ikinci istek `DELETE ... RETURNING`
0 satır döndürdüğü için 404'e düşer, yani anahtarın başarısızlıkta yaşaması
**gerekmez**. Kural değil, soru sabittir: *"bu isteğin tekrarı neyi iki kez
yapar?"*

**KANIT:** `test/api/grandstand.e2e-spec.ts` (10 yeni test: kontenjan, ücretsiz
tribün, iade para yolu, çift iade, iade sonrası yeniden satın alma) +
`test/domain/grandstand/ticket.spec.ts` + `grandstand-config.spec.ts` +
`apps/web/test/features/race-viewer/chat-history-merge.spec.ts` (7 test:
tekilleştirme, aynı-referans, canlı-mesaj-önce-gelirse kronoloji, eşit
`createdAt`'te `messageId` kararlılığı, limit, reconnect katlanması), gerçek
PostgreSQL. **RACE ENGINE'E DOKUNULMADI**, hiçbir config değeri koda gömülmedi,
`domain/` framework'süz kaldı.

**AÇIK KALAN (PHASE 7) — dürüst liste:**

1. **İade için ZAMAN/DURUM PENCERESİ YOKTUR.** `refundRaceTicket` yarışın
   `status`una **bakmaz**: `finished` bir yarışın bileti de iade edilebilir.
   Bu bugün için **kabul edilebilir** (izleyici bileti bir bahis değildir;
   yarış koşmuşsa da seyirci koltuğunu geri vermek havuzdan para çekmez) ama
   **test edilmemiştir** ve "yarış koştu, bilet iade edilemez" kuralı
   istenirse o gün **buraya bir kapı eklenecek** yerdir.
2. **Koltuk seçimi / oturma düzeni yoktur** — brief istemiyor, uydurulmadı.
3. **Yarış başına elle fiyatlandırma ucu yoktur.** `tribune_fee` yarış
   oluşturulurken `grandstand.config.json → defaultTribuneFee`'den yazılır;
   onu sonradan değiştiren bir uç nokta **yoktur**. (Satın alma fiyatı
   **her zaman** satırın kendisinden okunduğu için, böyle bir uç eklenirse
   eski satın almalar kendi tutarlarını korur — `price` sütunu bu yüzden var.)

---

#### 13.33 BAĞIMSIZ YENİDEN DENETİM → ÜÇ SUNUCU AÇIĞI + LOBİ ARAYÜZÜ — 30.09.2026

Projenin kendi denetimi (`docs/FINAL_PROJECT_AUDIT.md`) koddan
bağımsız olarak yeniden doğrulandı. Yerel kanıt (temiz PG16 + Redis, CI ile
aynı komutlar): lint 0 hata · typecheck · build · API 125 dosya/2134 test ·
web 27 dosya/418 test.

**Bulunan ve kapatılanlar:**

1. **Lobi yarışının arayüzü YOKTU** (denetim "var" diyordu). `api-client.ts`
   `GET/POST /races`, `/join`, `/ready`, `/leave`, `/settle`i hiç
   çağırmıyordu. → `features/race-lobby/` (`LobbyPanel` + saf
   `lobby-logic.ts`), `/races` sayfasına bağlandı. `GET /races` satırı
   artık çağıranın kendi katılımını taşır (`RaceLobbyListItem.myEntry`) —
   olmadan istemci "katıldım mı" bilgisini yalnızca belleğinde tutabilirdi.
2. **Satılan at eski sahibi adına koşuyordu.** Katılım `horses` satırını
   kilitlemiyor, pazar aktif yarışa bakmıyor, kilit sahipliği yeniden
   doğrulamıyordu → ödülü SATICI alıyordu; aynı at aynı anda birden çok
   açık yarışa da yazılabiliyordu. → `HORSE_IN_ACTIVE_RACE` (katılım, ilan,
   satın alma); tek tanım `infrastructure/horse/active-race-entry.ts`.
   Lobi katılımı ayrıca pazardaki atı artık reddeder (pratik/antrenmanla
   aynı kural). Kilit sırası: `races` → `horses` → `players`.
3. **READY yalnızca bilgiydi** (§13.7 "HENÜZ YOK"). → Kilitte (ve
   `scheduled`dan doğrudan kesinleşmede) hazır demeyen katılım `cancelled`
   + defterden okunan tutarla İADE (`race_entry_refund`). **Karar: yakma
   değil iade** — hazır olmamak bir vazgeçmedir, `leave` ile aynı sonuç.
   Kimse hazır değilse yarış iptal. ⚠️ Lobi yarışı koşturan her e2e
   katılımdan sonra `ready` DEMELİDİR (7 dosya bu yüzden uyarlandı).
4. **Kilitlenen yarışı kesinleştiren iş yoktu** — `/settle` bir crank'ti ve
   çağıranı yoktu; ücretler havuzda süresiz kalıyordu. →
   `SettleDueRacesUseCase`, zamanlayıcı turunda kilidin ARDINDAN.

**Kanıt:** her sunucu dilimi için yeni e2e (`race-horse-lock`,
`race-ready-gate`, `race-auto-settle`) düzeltme GERİ ALINARAK koşuldu ve
DÜŞTÜ (5/5, 3/3, 2/2), düzeltmeyle geçti.

**CI:** Node 20 → 22 (20'nin desteği 30.04.2026'da bitti), `npm install`
→ `npm ci` + `cache: 'npm'` (kilit dosyası `npm ci` ile doğrulandı).

**BİLEREK YAPILMAYANLAR (sahibin kararı gerekir):**
- Kökte izlenen 22 geçici dosya (`*.bat`, `*.bundle` ~6.4 MB, `*-log.txt`)
  `.gitignore`da ama repoda duruyor. `git rm --cached` bir sonraki
  `pull`da sahibin diskinden de SİLER; bu yüzden dokunulmadı.
- `no-magic-numbers` yalnızca UYARI: 2644 uyarının ~190'ı üretim kodunda.
  Kural 6 CI'da zorlanmıyor.
- Dağıtım altyapısı (Dockerfile/hosting) yok; misafir hesap tarayıcıya
  bağlı (kurtarma yok); OAuth kimlik bilgileri yok.

#### 13.34 İKİNCİ DİLİM — tribün iadesi, eşleştirme taraması, cüzdan sayfalama — 30.09.2026

`FINAL_PROJECT_AUDIT.md` §5'teki üç `PARTIAL` madde kapandı (46/4):

- **#37 Tribün iadesi — TEŞHİS DÜZELTİLDİ.** Denetim "koşmuş yarışın
  bileti iade edilebiliyor, config'e iade penceresi yaz" diyordu. Yanlıştı:
  bilet YALNIZCA bitmiş yarışa satılır (`assertRaceWatchable`), yani zaman
  penceresi bütün iadeleri kapatırdı (ilk deneme tam olarak bunu yaptı ve
  geri alındı). Asıl açık: bilet al → izle → parayı geri al. Çözüm:
  migration 0044 `race_tickets.first_viewed_at`; `GetRaceTimelineUseCase`
  erişim YALNIZCA bilet sayesindeyse bileti işaretler (HTTP replay + canlı
  `race.subscribe` aynı kapı); izlenmiş bilet `409 TICKET_ALREADY_USED`.
  Eşzamanlı "izle + iade et": iade önce kazanırsa izleme 403 alır. Eski
  test açığı doğru davranış diye kilitliyordu (izle → iade 200) —
  düzeltildi.
- **#21 Eşleştirme taraması.** Eşleştirme yalnızca katılım anında
  deneniyordu. `JoinMatchmakingQueueUseCase.scanQueue` + `MatchmakingScheduler`
  (ayrı sınıf: `RaceModule → MatchmakingModule` modül döngüsü doğururdu).
  Bayat bilet (at satılmış/sakat) düşürülür. Config
  `online.matchmaking.queueScan`, düşüren test `matchmaking-scheduler.spec.ts`.
- **#33 Cüzdan sayfalama.** `?before=<işlem id>`, `(created_at, id)`
  anahtar-tabanlı; `nextCursor`; `/wallet` "Daha fazla göster".

#### 13.35 TURNUVA — otomatik takvim + tek final (migration 0045) — 30.09.2026

Sahibin kararı: sunucu her kademe için otomatik açsın, turnuva tek büyük
final olsun. **Turnuva sıfırdan yazılmadı, lobi yarışının üstüne kuruldu** —
para yolu, iade, READY, at kilidi, hazırlık kapısı, kilit ve kesinleşme
ikinci kez yazılmadı. Turnuvaya özgü dört şey: seviye kapısı (katılımda,
kilitli transaction içinde), botsuz final (`aiFillEnabled` turnuvada
`false`), 50/30/20 ödül (tek kaynak `online.tournament`, `economy`ye kopya
yok), `minParticipants` altında iptal + herkese iade
(`dropUnreadyLobbyEntries({ minRemaining })`). Boş turnuva: kilit
zamanlayıcısı katılımsız yarışı seçmediği için takvim onu ayrıca iptal eder,
yoksa o kademe sonsuza dek "açık" kalırdı. Altın kademe 32 → 16 (tek yarışta
en büyük saha). Eleme formatı bilinçli olarak yok.

#### 13.36 E-POSTA + ŞİFRE GİRİŞİ — misafir hesabı kaydetme (migration 0046) — 30.09.2026

Sahibin talebi. Hesaplar yalnızca tarayıcıdaki JWT'de yaşıyordu: tarayıcı
verisi silinince, cihaz değişince ya da **30 günlük token dolunca** oyuncu
her şeyini kaybediyordu. Google/Apple kimlik bilgisi beklemeden çözüldü:
`player_credentials` (PK `player_id`, tekil `lower(email)`), `scrypt`
(Node yerleşik — yeni bağımlılık yok; özet `scrypt$N$r$p$tuz$özet`, config
değişse de eski özet doğrulanır). "Hesabını kaydet" oyuncu satırına
dokunmaz — atlar/para aynı `player_id`de. Giriş hatası tek kod
(`INVALID_CREDENTIALS`) + sahte özetle zaman eşitleme. Web: `/account`.
**Yok:** şifre sıfırlama (e-posta servisi gerekir).

#### 13.37 ŞİFRE SIFIRLAMA (migration 0047) — 30.09.2026

`password_reset_tokens` (yalnızca SHA-256 özeti; tek kullanımlık; 30 dk).
İstek ucu kayıtlı olsun olmasın 202 döner ve `minIntervalSeconds` içinde
ikinci e-posta göndermez; gönderim hatası yutulup loglanır (farklı yanıt
"kayıtlı" demek olurdu). Onay `FOR UPDATE` altında şifreyi değiştirir ve
oyuncunun tüm bekleyen bağlantılarını kapatır. E-posta: Resend (yerleşik
`fetch`, yeni bağımlılık yok); anahtar yoksa `OutboxEmailSender` —
üretimde içerik loglanmaz. **Bilinen sınır:** JWT durumsuzdur; şifre
değişince mevcut oturumlar süreleri dolana kadar geçerli kalır.

#### 13.40 XP / SEVİYE İLERLEMESİ BAĞLANDI — 01.10.2026

**Bulgu:** `applyXpGain` yazılmıştı ama hiçbir yerden çağrılmıyordu —
oyuncular ve atlar sonsuza dek Seviye 1'deydi; seviye şartlı turnuvalar
(Gümüş 15, Altın 30) ve kariyer kademeleri ölüydü. **Çözüm:**
`progression.xpRewards` (oyuncu/at: yarışı bitirme + ilk üç bonusu +
antrenman). Pratik yarış (`savePracticeRaceWithStakes`) ve lobi
kesinleşmesi (`settleLobbyRace` adım 7) XP'yi para ile aynı transaction'da
yazar; antrenman ata `updateWithLock` içinde, oyuncuya kendi kilidiyle.
Pratik yarış yanıtı `xpGained` taşır. Test: `progression.e2e-spec.ts` (4;
yazım kapatılınca 2'si düşüyor). **Denge notu:** XP eğrisi
(`100·L^1.5`) ile Sv. 15 ≈ 300 yarış — sahibin ayarlayacağı bir değer.

#### 13.39 TASARIM YENİLEMESİ — tema, menü, ana sayfa, yarış ekranı — 01.10.2026

Sahibin paylaştığı konsept görsellere göre. **Arayüz:** altın-lacivert tema
(Cinzel başlık, altın çerçeveli paneller), tek satır simgeli üst bar +
telefonda alt sekme çubuğu, ana sayfa (öne çıkan at, ahır/cüzdan/kariyer,
yaklaşan yarışlar), ahırda atlar üstte, yarışlar sekmeli. **Yarış ekranı:**
gökyüzü shader'ı, kum pist, beyaz korkuluk, çatılı tribün + kalabalık,
ağaçlar, bayrak; kapsül yerine bacakları dörtnal salınan, numaralı eyer
örtülü, formalı jokeyli prosedürel at; yayın kamerası (iç sahadan lideri
takip); HUD: koşu bilgisi, renkli rozetli sıralama, odak at kartı (gerçek
hız/tempo/kalan), ilerleme şeridi, pist çizgili mini harita. **Düzeltilen
hata:** drei `<Environment preset="sunset">` HDR'yi CDN'den indiriyordu;
indirme başarısız olunca yarış ekranı çöküyordu — artık yerel
`<Lightformer>` ortamı. **Fotoğraf gerçekliği YOK:** gerçek at/hipodrom
görüntüsü lisanslı `.glb`/görsel ister (CLAUDE.md kural 8).

#### 13.38 GOOGLE GİRİŞİ + HESAP BAĞLAMA (migration 0048) — 01.10.2026

Sunucu doğrulayıcısı (`GoogleAppleIdentityProvider`) ve `POST /auth/login`
önceden vardı; eksik olan istemci ve mevcut oyuncuya bağlama idi.
`POST /auth/link` (oturumdaki oyuncuya Google kimliği; oyuncu token'dan) ·
`GET /auth/providers` (`@Public`; `googleClientId` yoksa `null` → web düğmeyi
GÖSTERMEZ) · `GET /auth/credentials` artık `linkedProviders` taşır (misafir =
e-posta yok VE bağlı sağlayıcı yok). Kimlik başka oyuncudaysa 409
`PROVIDER_IDENTITY_TAKEN` — **hesaplar birleştirilmez** (para/at taşımak
ayrı bir karardır). Oyuncu başına sağlayıcı tekilliği migration 0048
kısıtıyla (eşzamanlı istekler; kısıt kaldırılınca test düşüyor).
Web: `GoogleSignInButton` (GIS betiği yalnızca gerektiğinde yüklenir) →
`/account`. **Canlıya almak için:** Google Cloud Console'da OAuth istemci
kimliği + "Yetkili JavaScript kaynakları"na web adresi; sunucuda
`GOOGLE_OAUTH_CLIENT_ID`. Apple: ücretli üyelik bekliyor.

#### 13.41 KULÜP BAĞLANDI — 01.10.2026

`domain/club` (brief §44) yalnızca birim testinden çağrılıyordu; `/club`
"Yakında" yer tutucusuydu. **Migration 0049:** `clubs` (+`name_key` tekil) ve
`club_members` (`player_id` BİRİNCİL ANAHTAR = tek kulüp kuralı DB'de).
**Uçlar** (`api/club`): `GET /clubs?search=` (puana göre sıralama, LIKE
jokerleri kaçırılır, `club.listLimit`), `GET /clubs/mine`, `GET /clubs/:id`,
`POST /clubs` (ad/etiket DOMAIN'de doğrulanır, `club.name`/`club.tag`),
`POST /clubs/:id/join` (kulüp satırı `FOR UPDATE` → son koltuğu iki kişi
dolduramaz), `POST /clubs/leave` (lider ayrılamaz), `DELETE
/clubs/:id/members/:playerId` (subay+), `POST .../role` (yalnızca lider;
`leader` = devir, eski lider subay, `clubs.leader_id` aynı transaction'da),
`DELETE /clubs/:id` (fesih, lider). Bütün yazma rotaları `@RateLimit`.
**Puan:** yarış XP'si (pratik + lobi kesinleşmesi) kulüp puanına ve üyenin
katkısına aynı transaction'da yazılır; seviye `levelThresholds`ten.
**Bulunan hata:** ad tekilliği ilk sürümde `lower(name)` idi — `C` yerel
ayarında Türkçe büyük harfler küçülmediği için "IŞIK ÜÇLÜSÜ" ile "Işık
Üçlüsü" iki ayrı kulüp olabiliyordu; e2e yakaladı, `clubNameKey`e geçildi.
Kanıt: `club.e2e-spec.ts` (7), `test/domain/club/club.spec.ts` (21); tam
paket temiz DB'de 138 dosya / 2225 test.

#### 13.42 PERSONEL BAĞLANDI — 01.10.2026

`staff` tablosu (migration 0012) ve `domain/staff` DOMAIN ONLY idi; yeni
migration GEREKMEDİ. **Uçlar** (`api/staff`, oyuncu token'dan): `GET /staff`
(kadro + aday pazarı + kapasite; havuz rol başına `market.candidatesPerRole`
adaya tamamlanır), `POST /staff/:id/hire`, `POST /staff/:id/renew`,
`POST /staff/:id/release`. **Para:** sözleşme peşin (`salary ×
contractMonths`), `staff_contract` defter satırı aynı transaction'da; kilit
sırası `staff` → `players`; kapasite (`staff_building`) `players` kilidinden
SONRA sayılır (aynı oyuncunun eşzamanlı iki kiralaması kapasiteyi aşamaz).
Tekrar koruması durumla: sahipli aday 409 `STAFF_ALREADY_HIRED`, erken
yenileme 409 `STAFF_RENEWAL_NOT_DUE`; süresi dolmuş sözleşme yenilenince
yeni dönem ŞİMDİ başlar (ölü günlere ödeme yok). Bırakma iade etmez, deftere
yazmaz. **Etkiler:** antrenör → antrenman `trainerFactor` (motor kancası
FAZ 1'den beri hazırdı, hep 1'di); seyis/veteriner/nalbant → ilgili bakım
eyleminin bütün deltaları. Yanıtlara `staffMultiplier` eklendi, ekranlar
gösterir. Kanıt: `staff.e2e-spec.ts` (7; antrenör bağlantısı koparılınca
test düşüyor — doğrulandı), domain `staff.spec.ts` + `care.spec.ts`; tam
paket temiz DB'de 139 dosya / 2237 test.

#### 13.43 SEZON BAĞLANDI — 01.10.2026

`domain/season` DOMAIN ONLY idi. **Migration 0050:** `seasons` (numara,
pencere, `rewards_paid_at`). Sezon skoru için tablo YOK: sıralama genel
sıralamanın formülüyle (`sumRankingScores` + `buildLeaderboard`), yalnızca
`races.start_time` pencere içindeki dereceli kayıtlardan türetilir.
`GET /seasons/current` güncel sezonu (yoksa ardışık olarak açar), ilk
`season.leaderboardSize` satırı, çağıranın satırını, ödül tablosunu ve
önceki sezonun podyumunu döner. **Ödül (PARA YOLU):** `SeasonScheduler`
(`season.schedule`) bitmiş ve ödenmemiş sezonu `FOR UPDATE` kilitler,
`rewardsByRank`e göre (eşit puan = eşit sıra = eşit ödül) bakiye + `season_reward`
defter satırı + `rewards_paid_at`i aynı transaction'da yazar; ikinci tur
hiçbir şey ödemez. Web: `/leaderboard` "Genel / Sezon" sekmeleri, kalan
süre, sıran ve olası ödülün; tablo mobilde yatay kaydırılır. Kanıt:
`season.e2e-spec.ts` (3); tam paket temiz DB'de 140 dosya / 2242 test.

#### 13.44 3D YOL HARİTASI ADIM 1-2 — VARLIK HATTI + OYUNCUNUN ATI (01.10.2026)

Varlık denetimi: depoda HİÇBİR 3D/doku/HDRI/ses dosyası yok; at, jokey,
tribün prosedürel PLACEHOLDER. **Adım 1 (hat):** yerel Draco/KTX2 çözücüleri
(drei'nin gstatic CDN varsayılanı kapatıldı), `asset-pipeline.ts`
(yoklama + önbellek + `useMissingAssetPaths`), `GltfAssetLoader` (dosya
yoksa denemez; `children(gltf, clips)`), manifest'e ahır ortamı, HDRI, üç
PBR doku ve ahır sesi eklendi; `resolveAnimationClips` rol → klip adı;
`PlaceholderBadge`. **Adım 2 (oyuncunun atı):** migration 0051 görünüş
sütunları (CHECK = shared-types sabitleri, test migration'ı okur); eski
atlar özetten tekdüze, yeni atlar config ağırlıklarıyla, taylar ebeveyn
donundan. `Horse.appearance` API'de döner. `deriveHorseDemeanor` (sakat >
keyifsiz > yorgun > durgun > enerjik > nötr) → `HorseModel` bekleme
davranışı (nefes, baş, kuyruk, ağırlık aktarma, kulak) + don/işaret
renkleri. `/stable` kartında "3D Önizle" (`HorseShowcase`, yörünge kamera,
dışarıya istek YOK — tarayıcıda doğrulandı). Kanıt: `appearance.spec.ts`,
`horse-appearance.e2e-spec.ts`, `breeding.e2e-spec.ts` kalıtım iddiası,
web `horse-demeanor`/`coat-palette`/`asset-pipeline`/`asset-manifest`
testleri; API 142/2253, web 32/452, `next build` geçti. **Görsel sıçrama
gerçek GLB'lere bağlıdır** (adım 4+).

#### 13.45 3D YOL HARİTASI ADIM 3 — ANA SAYFA 3D VİTRİN (01.10.2026)

Ana sayfanın CSS degrade + SVG pist çizgili hero'su kaldırıldı; yerine
`HomeHero` + `HomeScene3D`: hipodrom (`TrackScenery` — pist, korkuluk,
instanced tribün kalabalığı, kuleler, ağaçlar), önde oyuncunun atı (görünüş
+ durum → bekleme davranışı, jokeyli, numarasız), iç sahada PLACEHOLDER
ahır. Kamera 6 çekim (Hipodrom, At, Yakın Çekim, Ahır, Pist, Jokey) —
config'ten, yumuşak geçişli; HUD'da çekim seçici + durdur/başlat. HUD:
atın adı, ırk/cinsiyet/seviye, ruh hâli, 4 değer; "Yarışa Katıl" / "Ahır"
(oyuncu yoksa "Oyuna Başla"). PLACEHOLDER rozeti 5 bekleyen varlığı
listeler (mobilde yalnızca sayı). Kalite kademesi yarış sahnesiyle aynı
algılayıcıdan (`detect-quality-tier.ts`). Bulunan iki hata: prosedürel atın
başı geriye bakıyordu (düzeltildi); ışık kulesi ve ahır genel planı
kapatıyordu (at kuleler arasına alındı). Tarayıcıda 1440 ve 390 px'de
doğrulandı: dışarıya istek yok, konsol hatası yok, yatay taşma yok. Kanıt:
`showcase-camera.spec.ts` (10); web 33/462; `next build` (ana sayfa 15.3 kB).

#### 13.46 3D ADIM 4 — AT + JOKEY GLB BAĞLAMA (01.10.2026)

Gerçek varlık hâlâ yok (lisans kararı sahipte); bu adım dosya konduğu anda
her sahnenin gerçek modele geçmesini sağlar. `HorseAvatar3D` üç sahnenin
ortak bileşeni oldu. Manifest'e `binding` sözleşmesi (ileri eksen, hedef
boy, renklendirilecek malzemeler, jokey kemikleri/oturma noktası).
`model-fit.ts` (saf), `asset-inspect.ts` (saf GLB/HDR/KTX2/MP3 doğrulama) +
`npm run assets:check`. Tarayıcıda GEÇİCİ bir test GLB'si (Z'ye bakan kutu,
"Coat" malzemesi, "Idle" klibi — testten sonra silindi, repoya girmedi) ile
doğrulandı: model döndürüldü, 2.5 m'ye ölçeklendi, zemine oturdu, don rengi
uygulandı, rozetten düştü. Kanıt: `model-binding.spec.ts` (10; sentetik GLB
bellekte üretilir); web 34/472.

#### 13.47 3D ADIM 5 — HİPODROM ORTAMI + TRİBÜN KALABALIĞI (01.10.2026)

`HippodromeSurroundings` (yarış + ana sayfa): `hippodrome-environment.glb`
varsa kendi koordinatıyla (manifest `keepOrigin`) yerleşir ve prosedürel
tribün/kule/ağaçların yerini alır; pist/korkuluk/çim her durumda oyunun.
Kalabalık artık yarışın gerçek ilerlemesine tepki verir:
`computeCrowdExcitement` (öncesi sakin → koşu → final düzlüğü → bitiş
coşkusu, sonra söner), `spectatorLift` (eşik üstünde ayağa kalkma +
heyecanla büyüyen zıplama). Performans: güncelleme `animationHz` ile
seyreltilir, kamera tribünden uzaksa durur (LOD), kalite kademesi koltuk
yoğunluğunu düşürür (low %35). Kanıt: `race-atmosphere.spec.ts` (5);
demo yarışta tarayıcıda doğrulandı. Billboard dokusu (`crowd-billboard.
ktx2`) bu adımda BAĞLANMADI: dokunun atlas düzeni paket gelmeden
bilinemez; kalabalık bugün instanced kutulardır (PLACEHOLDER).

#### 13.48 3D ADIM 6 — AHIR SAHNESİ (01.10.2026)

`/stable` artık bir 3D ahır bölmesiyle açılır: seçili at (varsayılan öne
çıkan at) bölmesinde, gerçek görünüş + durumdan gelen bekleme davranışıyla
durur; sıcak fener + kapı ışığı, temas gölgesi, sınırlı yörünge kamera.
Ortam GLB'si yoksa `PlaceholderStall` (ahşap duvar, yarım kapı, saman,
yemlik, kova, eyer askısı, balyalar) + PLACEHOLDER rozeti. Kart başına
Canvas açan eski "3D Önizle" kaldırıldı; kartlardaki "Ahırda Göster"
sahneye at seçer (sayfada tek WebGL bağlamı). Tarayıcıda 1440/390 px
doğrulandı: dışarıya istek yok, hata yok, taşma yok.

#### 13.49 3D ADIM 7 — IŞIK (01.10.2026)

Ortak `SceneRenderSettings` (ACES ton eşleme, `lighting.config.json`
pozlaması, ultra'da PCSS yumuşak gölge) + `SCENE_GL_OPTIONS` üç sahnede.
Bloom değerleri config'ten, ölçülü (eşik 0.85, yoğunluk 0.3); ana sayfaya
yüksek/ultra kademede bloom ve atın altına temas gölgesi eklendi.
`HdriEnvironment`: `public/hdri/golden-hour.hdr` varsa dış mekânda gökyüzü +
ortam ışığı, ahırda yalnızca ortam/yansıma; yerel, yoklanmış, hata sınırlı
(CDN `preset` yasağı `lighting.spec.ts` ile kaynak taranarak kilitli).
Geçici bir test HDR'si ile tarayıcıda doğrulandı (sonra silindi).

#### 13.50 3D ADIM 8 — YARIŞ ENTEGRASYONU (01.10.2026)

`StartGate`: `start_gate.glb` varsa `open` klibiyle, yoksa şerit ofsetlerine
dizilmiş prosedürel bölmeler; kapılar yarış başlayınca açılır (`gateOpen`,
süre `vfx.config.json` `startGate.openSeconds`). Toz artık yüzeye bağlı
(çim < sentetik < kum), atın gerçek hızıyla (`HorseDust`, konum farkından)
ve kamera uzaklığıyla ölçeklenir (`dustSpawnRate`, saf + test). Pist rengi
de yüzeye göre. `/races/demo`da tarayıcıda görüldü (kapı + kalabalık);
toz yazılımsal GPU'da düşük kademede seyrek görünür.

#### 13.51 3D ADIM 9 — SES (01.10.2026)

`RaceAudioManager` (önceden hiçbir yerden çağrılmıyordu) artık iki yarış
izleyicisine ve ahıra bağlı. Olaylar (`race_start`/`gate_open`/
`start_signal`/`overtake`/`final_stretch`/`finish`/`winner`) oynatma
durumundan saf `deriveRaceAudioCues` ile türetilir; ses yarış ortasında
açılırsa geçmiş tek seferlik sesler çalınmaz, geri sarma döngüleri susturur,
lider değişimi `overtakeCooldownMs`ten sık çalmaz. Kalabalık döngüsü
heyecanla ölçeklenir (`crowdExcitementMinFactor`), nal sesi lider hızıyla
(`hoofbeat.referenceSpeedMps`). Arka uç her yolu HEAD ile yoklar — `public/`
boş olduğu için bugün her ses sessizce düşer (tarayıcıda doğrulandı: yalnızca
HEAD istekleri, GET/uyarı yok). Varsayılan sessiz; düğme tercihi saklar.
**Ses dosyası YOK (PLACEHOLDER)** — manifestteki yollara konunca çalar.

#### 13.52 3D ADIM 10 — PERFORMANS + MOBİL + CİLA (01.10.2026)

Ortak kalite kaynağı `useQualityTier` (ana sayfa, yarış, ahır): oyuncu
seçimi tarayıcıda saklanır ve açık sahneler arasında eşitlenir; "Otomatik"te
cihaz algılamasıyla başlar, kare hızı `lowerFps` altına düşerse çalışma
anında kademe iner (`performance.config.json`; saf mantık
`resolveQualityTier`, test `quality-preference.spec.ts`). Yarış ve ahırda
ses + kalite düğmeleri (`scene-controls`). 390 px genişlikte yarış/ahır/ana
sayfa yatay taşma yok, dış istek yok (tarayıcıda doğrulandı); `next build`
temiz.

**3D YOL HARİTASI (10 ADIM) KOD OLARAK TAMAM.** Görüntü hâlâ prosedürel
PLACEHOLDER'dır: gerçek `.glb`/HDRI/ses dosyaları `asset-manifest.ts`teki
yollara konunca kod değişmeden devreye girer (`npm run assets:check`
boyut/üçgen/klip denetler). **Bekleyen karar: varlık kaynağı (CC0 mi,
ücretli/özel üretim mi).**

#### 13.53 YARIŞ TAKVİMİ (01.10.2026, migration 0052)

Oyuncu yarış açmasa da lobi boş kalmasın: `race-lobby.config.json` →
`calendar` (`horizonHours` 3, `minLeadMinutes` 10, üç program: Kum Sprint
30 dk, Çim Mil 60 dk, ücretsiz Açık Koşu 20 dk). `RaceCalendarScheduler`
(`TournamentScheduler` deseni, testte kapalı) her tur
`ScheduleRaceCalendarUseCase`i çağırır: başlangıcı geçmiş katılımsız takvim
yarışlarını iptal eder, sonra penceredeki açılmamış yuvaları açar. Yarış
sıradan lobi yarışıdır — giriş ücreti, READY, bot dolgusu, kilit ve
kesinleşme değişmedi. Her yuva oyuncunun kuralından
(`validateRaceCreation`) geçer; geçemeyen program loglanır ve açılmaz.
Tekrar koruması yuva PK'sı + `pg_advisory_xact_lock` (eşzamanlı iki tur
testte). Lobi satırı `calendar.programId` taşır; `LobbyPanel` "Takvim
yarışı" etiketi gösterir. Test: `race-calendar.spec.ts` (saf),
`race-calendar.e2e-spec.ts` (4 senaryo; iptal adımı kapatılınca düştüğü
doğrulandı), `race-calendar-scheduler.spec.ts` (`enabled` okunuyor).

#### 13.54 ÇİFTLİK TESİSİ ETKİLERİ (01.10.2026)

Bulgu: `domain/farm`taki altı çarpanın hiçbiri çağrılmıyordu; yalnızca
personel binası (kapasite) işliyordu. Oyuncu 4.000–55.000 para ödeyip etkisiz
tesis alıyordu — personeldeki "işe yaramayan şey satma" sorununun aynısı.
Bağlandı: padok → `rest` bakım deltaları (`farmMultiplier` yanıtta), antrenman
pisti × nalbant alanı → antrenman sakatlık olasılığı (kaydedilen risk de
tesis sonrası değer), depo → yem satın alma TOPLAMI (`discountedTotal`:
yukarı yuvarlama, kayan nokta artığı temizlenir; `totalCost` yanıtta ve
defterde aynı; yem listesinde `discountPercent`), üreme merkezi → tayın doğum
sağlık riski. **Veteriner merkezi bağlanamaz:** "tedavi maliyeti" düşürür
ama bakım ücretsizdir → `inactiveFacilities`, inşa 409 `FACILITY_INACTIVE`,
ekranda "şu an etkisiz". Bakım ücretli yapılırsa (sahibin kararı) listeden
çıkarılıp bağlanır. Test: `farm.spec.ts` (+ kapalı küme), `breeding.spec.ts`,
`farm-effects.e2e-spec.ts` (depo/padok/veteriner; depo ve padok bağlantısı
kapatılınca düştüğü doğrulandı).

#### 13.55 OYUNCU KONTROLLÜ PRATİK YARIŞ (01.10.2026, migration 0053)

Sahibinin talebi: "atı kullanıcı kendisi koştursun — yön verme, kırbaçlama".
Karar: önce pratik yarış; kırbaç sınırsız, dayanıklılık bedelli.

- **Motor:** her 200 m'lik segmentte jokey kararı zaten vardı; oyuncu komutu
  bu kararın yerine geçer (kırbaç → finişe zorla, bonus dayanıklılıkla
  orantılı × `kırbaç^0.5`, bedel dayanıklılık + kalıcı yorgunluk; sakin →
  −4 hız, dayanıklılık ×0.6; sol/sağ → kulvar ±1). Denge ölçüldü:
  `RACE_BALANCE_REPORT.md` §9. Komutsuz yarış bit bit eskisiyle aynı (120 yarışlık parmak izi
  testi); `race.config.json` 1.3.0 (`playerControl`).
- **Canlı oturum:** `POST /horses/:id/interactive-race` (ücret hemen,
  defter), `GET /interactive-races/current|:id` (yalnızca gösterilmiş
  segmentler; sonuç ve tohum yarış bitmeden GİTMEZ), `POST .../commands`
  (`{control}`), `POST .../finish`. Segment `j`, lider ona başlamadan
  `revealLeadMs` önce gösterilir; komut ilk gösterilmemiş segmente düşer
  (kilit altında hesaplanır). `interactive-race.config.json`: geri sayım,
  `timeScale` 2, zamanlayıcı.
- **Ekran:** `features/ride/InteractiveRaceViewer` — tam ekran 3D, sunucu
  saatine göre oynatma, dört düğme + klavye, dayanıklılık çubuğu, kamera
  seçimi, sonuç kartı. Sayfa yenilenince süren yarış geri gelir.
- **Kanıt:** motor testleri (parmak izi, önek, kırbaç/kulvar/sakin), e2e 5
  senaryo (ücret, tek oturum, at kilidi, komut hedefi, geçmiş değişmez,
  erken kesinleşme 409, ödül tek sefer, terk → zamanlayıcı). Komut gösterilmiş
  segmente yazdırılınca "geçmiş değişmez" testinin düştüğü doğrulandı.
  Tarayıcıda masaüstü + 390 px uçtan uca koşuldu (sonuç ekranı dahil).
- **Açık:** ~~lobi/turnuva yarışları kontrollü değil~~ → §13.56. Kırbaç
  dengesi config'ten ayarlanır.

### 13.56 Kontrollü lobi/turnuva yarışı (01.10.2026, migration 0054)

- **Veri:** `races.player_control` + `races.live_starts_at`;
  `race_entries.player_commands` (JSONB, segment → komut).
- **Akış:** kilit kadroyu + tohumu dondurur ve kontrollü yarışta
  `live_starts_at = kilit + startCountdownSeconds` yazar. Katılımcı
  `GET /races/live/current` ile canlı yarışını bulur (`/races` 5 sn'de bir
  yoklar ve sürüş ekranını açar), komutlarını gönderir; segmentler pratik
  yarışla AYNI açıklama kuralıyla gösterilir. Koşu bitince `…/live/finish`,
  crank ya da zamanlayıcı kesinleştirir; motor herkesin komutlarını
  `playerCommands` olarak alır. Kopan oyuncunun atını AI jokey sürer.
- **Kurallar:** uçlar yalnızca katılımcıya (yoksa 404, varlık sızdırmaz);
  canlı koşu bitmeden kesinleşme 409 `InteractiveRaceNotFinishedError`;
  `GET /races/:id/timeline` tohumu yalnızca `finished` yarışta döner
  (önceden kilitli yarışın tohumu sızıyordu).
- **Yan düzeltmeler:** `JoinRaceDto` taktik alanları `@IsOptional()` (gerçek
  sunucu taktiksiz katılımı 400'lüyordu; esbuild e2e'de görünmez —
  `test/api/join-race-dto.spec.ts`), lobi formunun en kısa gecikmesi sunucu
  alt sınırına hizalandı.
- **Kanıt:** `lobby-live-race.e2e-spec.ts` (kalan-süre kapısı kapatılınca
  düştüğü doğrulandı), `tournament.e2e-spec.ts` (canlı başlangıç geriye
  çekilerek), web `lobby-logic.spec`. Tarayıcıda form → katıl → hazır →
  kilit → sürüş ekranı → sonuç kartı uçtan uca koşuldu.

### 13.57 Bekleyen tribün — bitmemiş yarışa abonelik (01.10.2026)

- **Hata:** `race.subscribe` bitmemiş yarışta boş bir oynatma oturumu
  kuruyordu; 4 sn sonra sıra bilgisi olmayan `race.finished` yayınlanıyor ve
  oturum 60 sn önbellekte kalıyordu. O sürede (kesinleşmeden sonra bile)
  gelen izleyici yarışı göremiyordu. Kontrollü yarışta (§13.56) pencere
  dakikalar sürdüğü için görünür hâle geldi.
- **Düzeltme:** gateway önce `GetRaceTimelineUseCase.pollForPlayback` ile
  durumu sorar (`findRaceStatus`). Bitmemiş yarışta oda + sohbet + kadro +
  `race.waiting`; `spectatorWaitPollSeconds` (race-lobby config) aralığıyla
  yoklanır; kesinleşince `createPlaybackSession` odaya yayınlar; iptalde
  `race.cancelled`. İzleme ekranı iki durumu bir bildirimle gösterir.
- **Kanıt:** `race-spectator-wait.e2e-spec.ts` (eski abonelik koduyla iki
  test de düşüyor; iptal senaryosu gerçek zamanlayıcıyla).
- **Açık:** ~~kontrollü yarış canlı koşarken tribün segmentleri ANINDA görmez~~
  → §13.58.

### 13.58 Canlı tribün — kontrollü yarışı izlemek (01.10.2026)

- **Uç:** `GET /races/:id/live/spectate` → `LobbyLiveRaceUseCase.spectate`.
  Kontrollü + `locking`/`finished` değilse 404; yetki `assertCanWatch`
  (zaman çizelgesinden ÇIKARILDI, iki uç aynı kapıyı kullanır: katılımcı /
  ücretsiz tribün / bilet → yoksa 403 `RACE_TICKET_REQUIRED`).
- **Görünüm:** `InteractiveRaceView.role` (`rider` | `spectator`). Tribün
  görünümü komut, `canFinish` ve sonuç taşımaz; segmentler oyuncunun
  gördüğü sınırla AYNIDIR.
- **Ekran:** `/races/:id/watch` canlı yarışta sürüş ekranını tribün modunda
  açar (kontrol düğmesi yok, rozet lideri gösterir, sonda kazanan + "Tekrarı
  izle"). Kazanan `finishOrder` (son segment zamanı) ile bulunur — bitişte
  mesafe eşittir.
- **Yan düzeltme:** izleme sayfası doğrudan açılınca girişli oyuncuya "hesap
  oluştur" diyordu (token ilk render'da okunuyordu) → `usePlayer`.
- **Kanıt:** `lobby-live-race.e2e-spec.ts` "CANLI TRİBÜN" (yetki kapısı
  kaldırılınca düştüğü doğrulandı), web `ride-logic.spec` `finishOrder`.
  Tarayıcıda: bekleme bildirimi → kilit → canlı tribün (kontrol yok) →
  kazanan kartı → tekrar oynatma (aynı kazanan).
- **At adları (02.10.2026):** canlı görünüm (sürücü + tribün) "Oyuncu 1 /
  Rakip 2" yerine gerçek at adlarını (`horses.name`, bağlam sorgusunda JOIN)
  ve botların tekrar oynatmadaki etiketlerini (`bot-2`) gösterir — canlı
  ekran ile tekrar aynı adları kullanır. Kanıt: aynı e2e'de ad iddiaları.
- **Not:** her yoklama yarışı yeniden simüle eder (oyuncu görünümüyle aynı);
  çok kalabalık tribünde önbellek gerekebilir.

### 13.59 Canlı görünüm önbelleği + çok oyunculu kontrol dengesi (02.10.2026)

- **Önbellek:** sürücü ve tribün saniyede bir yoklar; her yoklama yarışı
  baştan koşturuyordu. `LobbyLiveRaceUseCase.liveTimeline` sonucu
  `BoundedCache`te (LRU, `liveRunCacheEntries`) tutar; anahtar yarış + tohum
  + tüm katılımların komutları. Tohumsuz/dondurulmamış kadroda önbellek yok.
  Kesinleşme kendi simülasyonunu koşar (önbellekten okumaz).
  Kanıt: `test/api/lobby-live-race-cache.spec.ts` (anahtardan komutlar
  çıkarılınca düştüğü doğrulandı; 0 → kapalı).
- **Denge:** yön komutu ve 1–4 sürücülü saha ölçüldü — sömürü yok, avantaj
  birden çok sürücüde küçülüp kalıyor, beceri ödüllendiriliyor
  (`RACE_BALANCE_REPORT.md` §9.1). Kilitler `race-engine-player-control.spec.ts`.

### 13.60 Müzayede + pazarda satış ekranı (02.10.2026, migration 0055)

- **Model:** `market_bids` emanet modeli. Teklif anında para düşer
  (`auction_bid_hold`), geçilen teklif aynı transaction'da iade edilir
  (`auction_bid_refund`), kapanışta satıcıya geçer (`auction_sale_credit`).
  Kanonik türler: hold/credit → MARKET, refund → REFUND.
- **Kurallar (saf, `domain/market/auction.ts`):** ilk teklif ≥ başlangıç
  fiyatı; sonraki ≥ mevcut + max(⌈mevcut × %5⌉, 10) (`economy.auction`).
  Satıcı kendi ilanına teklif veremez; sabit fiyatlıya teklif, müzayedeye
  "hemen al" yok; müzayede bitişsiz açılamaz; teklif almışsa iptal edilemez.
- **Kapanış:** `AuctionSettleScheduler` (`economy.auction.settleScheduler`).
  Satış gerçekleşemezse (at el değiştirmiş, alıcının ahırı dolu, at açık
  yarışta) emanet iade + `expired`; teklifsizse `expired`. Kapanış satır
  kilidiyle korunur — ikinci tur ikinci ödeme yapmaz.
- **Tuzak kapatıldı:** pazarın tembel süre süpürmesi ve satın alma yolu
  müzayedeyi `expired` yapsaydı teklif emaneti askıda kalırdı; ikisi de
  artık müzayedeyi atlar.
- **Ekran:** `/market` — bu tarihe kadar web'de ilan AÇMA yolu YOKTU
  (yalnızca satın alma). Artık "Atımı Sat" (sabit fiyat / müzayede, süre),
  teklif kutusu (varsayılan sunucunun `minimumNextBid`i), "Öndesin" rozeti,
  ilan kaldırma ve at adları (`horseName`; eskiden "At ID: uuid").
- **Kanıt:** `market-auction.e2e-spec.ts` (5 senaryo: kurallar, emanet/iade/
  tekrar, süpürme kapalı, kapanış + defter mutabakatı, iade yolu, eşzamanlı
  teklif) — süpürme koruması ve iade satırı ayrı ayrı bozulunca düştüğü
  doğrulandı; `test/domain/market/auction.spec.ts`; web `market-logic.spec`.
  Tarayıcıda: satıcı formla müzayede açtı, alıcı (390 px) teklif verdi,
  bakiye emanet kadar düştü, "Öndesin" göründü.
- **Bildirimler (migration 0056):** geçilen teklif sahibine `auction_outbid`
  (iade tutarı + yeni en düşük teklif; kendi teklifini yükseltene gitmez),
  kapanışta `auction_won`/`auction_sold`, satışsız bitişte satıcıya
  `auction_unsold`, iade yolunda alıcıya `auction_refunded`. Hepsi para
  hareketiyle aynı transaction'da; `/notifications` metinleri ve bağlantıları
  (pazar/ahır/cüzdan) eklendi. CHECK kısıtı adıyla düşürülüp genişletildi;
  kapalı küme testi artık CHECK'i yazan EN SON migration'ı okur.

### 13.61 PWA — ana ekrana kurulabilir (02.10.2026)

- `public/manifest.json` hiçbir sayfaya bağlı değildi ve ikonu yoktu (silindi).
  Yerine `app/manifest.ts` (`/manifest.webmanifest`, Next `<head>`e bağlar).
- İkonlar DOSYA DEĞİL: `HorseHeadIcon`un `HEAD_PATH`/`MANE_PATH` yolları
  `next/og` ile PNG'ye çevrilir — `/pwa-icon/192|512` (any + maskable, logo
  %62 → güvenli bölge), `app/icon.tsx` (favicon), `app/apple-icon.tsx` (iOS).
  Uydurma/lisanssız görsel yok (kural 8); logo değişirse ikon da değişir.
- iOS: `metadata.appleWebApp`. Service worker bilinçli olarak YOK (sunucu
  otoritesi — çevrimdışı oyun anlamsız; önbellek bayat bakiye gösterirdi).
- Kanıt: web `pwa.spec.ts`; üretim sunucusunda manifest + ikonlar 200,
  yanlış ölçü 404; Chromium `Page.getInstallabilityErrors` → boş.

### 13.62 Jokey-at uyumu bağlandı (02.10.2026)

- `effectiveJockeySkill` (saf): beceri × (1 + `compatibilityInfluence` ×
  (uyum − 50)/50). Üç yerde kadro kurulurken kullanılır: lobi
  (`EntrantSnapshotBuilder`, ortak geçmiş `findJockeyPairAveragePerformance`),
  pratik yarış (ortak geçmiş dahil), hızlı eşleşme (geçmiş nötr).
- **Motor değişmedi**; değer dondurulan kadroya yazılır → eski yarışların
  yeniden oynatması bozulmaz. Etki 0 = eski davranış.
- Ölçüm ve gerekçe: `RACE_BALANCE_REPORT.md` §10 (≈ ±0.2 sıra).
- Ekran salt beceri puanını göstermeye devam eder: uyum gizli mizaca bağlıdır,
  sayısal göstermek gizli stat'ı sızdırırdı.
- Kanıt: `test/domain/jockey/effective-jockey-skill.spec.ts`; `jockey.e2e-spec.ts`
  motora giren değeri bağımsız girdilerle yeniden hesaplar ve salt beceriden
  farklı olduğunu iddia eder (mizaç sabitlenerek).

### 13.63 Oturum: refresh token + çıkış + tüm cihazlardan çıkış (02.10.2026, migration 0057)

- Eskiden tek bir 30 günlük JWT vardı: iptal edilemiyordu, sunucuda çıkış
  yoktu, şifre sıfırlama çalınmış token'ı öldürmüyordu.
- Şimdi erişim JWT'si kısa (`auth.session.accessTokenTtlSeconds` = 1 sa) ve
  `sid` taşır; refresh token rastgeledir, DB'de yalnızca SHA-256 özeti
  (`auth_sessions`), HER yenilemede döner. Önceki token tekrar sunulursa
  oturum `reuse_detected` ile kapanır (çalıntı tespiti).
- `AuthGuard` ve soket el sıkışması TEK sorguyla (`players` ⟕ `auth_sessions`)
  oturumun açık ve hesabın var olduğunu denetler → çıkış ANINDA etkilidir.
  Var olmayan oyuncunun token'ı artık 401 (eskiden 404'e kadar iniyordu).
- Eski (`sid`siz) token'lar reddedilmez (misafirin hesabı onda); web açılışta
  `POST /auth/session` ile yükseltir. `players.tokens_valid_after` tüm
  cihazlardan çıkışta ve şifre sıfırlamada eski token'ları da keser.
  Şifre sıfırlama tüm oturumları AYNI transaction'da kapatır.
- Uçlar: `POST /auth/refresh` (`@Public`), `/auth/session`, `/auth/logout`,
  `/auth/logout-all`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`
  (başkasınınki 404). `maxActiveSessionsPerPlayer` aşılınca en eski kapanır.
- Soket kimlik doğrulaması `afterInit` ara katmanına taşındı: async kapı
  `handleConnection`da beklenince bağlanır bağlanmaz gelen `race.subscribe`
  reddediliyordu (yaşandı). Reddedilen istemci artık `connect_error` alır.
- Web: 401 → tek uçuşlu yenileme + bir kez tekrar; bitişten 60 sn önce
  proaktif yenileme; sekmeler arası `navigator.locks`. **Oturum yalnızca 401'de
  silinir** — eskiden HER hata (ağ kopması dahil) misafir hesabını
  kaybettiriyordu; "Oyuncu oluştur" depodaki çözülmemiş oturumu ezmez.
  `/account` → "Oturumlar" paneli (kayıtlı hesapta).
- Kanıt: `test/api/auth-session.e2e-spec.ts`, `test/domain/auth/session.spec.ts`,
  `realtime.e2e-spec.ts` (çıkmış token soket açamaz), web
  `player-context.spec.tsx` / `session-logic.spec.ts` / `api-client.spec.ts`;
  tarayıcıda yerel Playwright ile uçtan uca denendi.

### 13.64 E-posta doğrulama (02.10.2026, migration 0058)

- `player_credentials.email_verified_at` + `email_verification_tokens`
  (yalnızca SHA-256 özet, hedef e-posta, tek kullanımlık, 48 sa —
  `auth.emailVerification`). 0058 öncesi kayıtlar doğrulanmamış görünür ve
  bağlantı isteyebilir; veri bozulmaz.
- Kayıt (`POST /auth/credentials`) doğrulama e-postasını kendiliğinden yollar;
  gönderim hatası kaydı BOZMAZ (yalnızca loglanır, bağlantı loglanmaz).
- `POST /auth/email/verification` (oturumlu; `sent: false` = kısa aralıkta
  tekrar; misafir 409 `NO_ACCOUNT_EMAIL`, doğrulanmış 409
  `EMAIL_ALREADY_VERIFIED`) · `POST /auth/email/verify` (`@Public`; geçersiz /
  süresi dolmuş / kullanılmış / e-posta değişmiş → TEK 400
  `INVALID_VERIFICATION_TOKEN`). `GET /auth/credentials` → `emailVerified`.
- Web: `/account` rozeti + "tekrar gönder"; `/account/verify` doğrulamayı
  DÜĞMEYLE yapar (JS çalıştıran e-posta tarayıcıları tek kullanımlık
  bağlantıyı tüketmesin).
- **Bugün hiçbir özelliği kapatmaz** — yalnızca sahipliği kaydeder. Bilinen
  açık: başkasının e-postasıyla doğrulanmamış kayıt o adresi meşgul eder
  (sahibi kaydolamaz); "doğrulanmamış kaydı devralma" ayrı bir karar.
- Kanıt: `test/api/email-verification.e2e-spec.ts` (5 test); tarayıcıda uçtan
  uca (kayıt → e-postadaki bağlantı → doğrula → rozet).

### 13.65 Hesap silme (02.10.2026, migration 0059)

- **Satır fiziksel olarak silinemez:** `economy_transactions` değiştirilemez
  (0038 tetikleyicisi; CASCADE de DELETE'tir), `pvp_matches`/`admin_audit_log`
  kısıtlar. Silme = kişisel verinin silinmesi + anonimleştirme:
  `players.username → silinmis_<id>`, görünen ad "Silinmiş oyuncu", avatar
  NULL, `deleted_at`. Silinenler: e-posta/şifre, Google kimliği, bekleyen
  bağlantılar, eşleştirme bileti, bildirimler (başkalarının bu oyuncuya atıf
  yapan bildirimleri dahil), yarış sohbeti, özel mesajlar (iki yön),
  arkadaşlık, davet, engeller; oturumlar kapanır + cihaz etiketi silinir.
  Defter, yarış ve hediye kayıtları anonim olarak KALIR.
- **Parası emanette olan hesap silinemez** (409 `ACCOUNT_DELETION_BLOCKED`):
  lider müzayede teklifi, teklif almış müzayede, açık yarış katılımı, süren
  kontrollü yarış, süren PvP maçı, üyesi olan kulübün liderliği. Engeller
  `FOR UPDATE` altında yeniden denetlenir (kilit sırası ilan → oyuncu);
  reddedilen silme hiçbir şey yazmaz. Teklifsiz ilanlar iptal olur, tek
  başına liderin kulübü kapanır.
- Onay: kullanıcı adı + e-postalı hesapta şifre. Yanlış şifre **403**
  (`DELETION_PASSWORD_INVALID`) — 401 istemcide oturumu sildirirdi.
- Silinmiş oyuncu: guard/soket 401 (`authorizationState` `deleted_at IS NULL`),
  `findById`/`findByUsername`/profil bulunamaz, genel ve sezon sıralamasına
  girmez. Eski kullanıcı adı ve e-posta serbest kalır.
- Uçlar: `GET /account/deletion` (engeller + şifre gerekir mi), `POST
  /account/delete`. Web: `/account` → "Hesabı sil" paneli.
- Kanıt: `test/api/account-deletion.e2e-spec.ts` (5); tarayıcıda uçtan uca.
- Bilinen sınır: verdiği şikâyetlerin metni (`player_reports`) moderasyon
  kaydı olarak kalır; açık soket bağlantısı silmede koparılmaz (yeni
  bağlantı reddedilir).

### 13.66 Üretim temeli (02.10.2026, Faz 13-A)

- **Ortam kapısı:** `NODE_ENV=production`da eksik/zayıf `JWT_SECRET`,
  `DATABASE_URL`, `REDIS_URL`, localhost `CORS_ORIGIN`/`WEB_BASE_URL` ya da
  `DISABLE_RATE_LIMIT=true` → açılış durur (`production-env.ts`, saf).
- **Sağlık:** `/health` canlılık (değişmedi) + `/health/ready` (DB + Redis,
  zaman aşımlı, 503, ayrıntı sızdırmaz).
- **İstek kimliği:** `RequestIdMiddleware` (AppModule'de → e2e de alır);
  `X-Request-Id` başlığı + `error.requestId` + log.
- **Sahte yatırma:** Faz 0'ın "üretimde açık" tespiti YANLIŞTI (sunucu zaten
  kapalıydı); web formu artık `WalletView.depositAvailable`a bağlı.
- **CI:** `security` işi (bağımlılık kapısı + gitleaks), `docker` işi
  (üç imaj + "eksik ortamla açılmaz" duman testi). Docker yerelde YOK.
- ⚠️ **Next 14 / Nest 10 açıkları** (Next'te uzaktan kod çalıştırma dahil)
  yalnızca büyük sürümle kapanır; izin listesi 2026-11-01'de biter.
  `images.unoptimized` savunma katmanıdır, etkisi yerelde gösterilemedi.
- Belge: `docs/DEPLOYMENT.md`. Kanıt: `test/security/production-env.spec.ts`,
  `test/api/ops.e2e-spec.ts`.

## 14. Kendime hatırlatmalar (kısa liste)

1. **Race Engine'e dokunmadan önce iki kez düşün.** Denetim onu "KEEP, dokunma"
   diye işaretledi. Değişiklik şartsa determinizm testini kırmadığımı kanıtlarım.
2. **`Math.random()` yazmam.** Seed'li PRNG + isim-uzaylı `deriveRandom`.
3. **Sihirli sayı yazmam.** Önce `config/*.config.json`.
4. **`@Inject()` yazmadan constructor'a bağımlılık koymam.** (esbuild tuzağı, §7.1)
5. **Domain'e NestJS/ORM importu sokmam.** Katman yönü tek yönlü.
6. **Para/mutasyon yolunda `FOR UPDATE` + aynı tx'te defter kaydı** olmadan kod
   yazmam.
7. **Sahte GLB/ses dosyası uydurmam.** Bu mutlak bir çizgi.
8. **`README.md`/`ROADMAP.md` faz tablosuna güvenmem** — bayat. Gerçek durum §5'te.
9. **"Çalışıyor" demem** — npm install ve tarayıcı yok; doğrulama CI'da olur.
10. **Commit'i ben atar ve doğrudan `main`'e push ederim** (sahibinin
    27.09.2026 tarihli açık talebi — eski `bundle + .bat` teslimatı geçersiz).
    Push'tan ÖNCE `git fetch` + `git merge-base --is-ancestor origin/main HEAD`
    şart; atalık sağlanmazsa push ETMEM.
11. **Bayat belgeleri not ederim** (§10.2) ama istemeden "düzeltme" adına büyük
    refactor başlatmam.

---

*Bu dosya bir kavrayış aracıdır, sözleşme değil. Proje ilerledikçe güncellenmelidir —
özellikle §5 (gerçek durum), §10 (boşluklar) ve §13 (sıradaki iş).*
