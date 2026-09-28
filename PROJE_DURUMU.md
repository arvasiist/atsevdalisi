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

App Router sayfaları: `(dashboard)`, `stable`, `market`, `races`, `races/demo`,
`replays`, `replays/[raceId]`, `training`, `care`, `equipment`, `online`, `club`,
`farm`, `leaderboard`.
Feature'lar: `race-viewer/` (15 dosya + assets/ + audio-vfx/ + fixtures/),
`matchmaking/lobby-socket.ts`, `career/career-tier.ts`, `pedigree/`,
`player-demo/PlayerDemoWidget.tsx`.
Lib: `api-client.ts`, `player-context.tsx`. Bileşenler: `layout/TopBar.tsx`,
`ui/{ComingSoon,GlassPanel,HorseAvatar,StarRating,StatBar}.tsx`. Tema: `theme.ts`.

### 5.5 Veritabanı: 28 migration, 24 tablo

`players`, `tracks`, `horses`, `horse_stats`, `horse_surface_stats`,
`horse_distance_stats`, `horse_health`, `jockeys`, `training_sessions`, `races`,
`race_entries`, `race_entry_segments`, `market_listings`, `breeding_pairs`,
`pedigrees`, `player_auth_providers`, `staff`, `facilities`, `horse_care_log`,
`matchmaking_tickets`, `pvp_matches`, `economy_transactions`, `idempotency_keys`,
`horse_equipment` (+ `schema_migrations`).

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
| **OAuth canlı değil** | `GoogleAppleIdentityProvider`, `GOOGLE_OAUTH_CLIENT_ID`/`APPLE_OAUTH_CLIENT_ID` boş olduğu için **her zaman** `InvalidProviderTokenError` fırlatır → `POST /auth/login` pratikte çalışmaz |
| **Frontend'de gerçek giriş yok** | `player-context.tsx` sadece localStorage (`atSevdalisi.playerId`, `atSevdalisi.authToken`) + `jokey_${random}` isimli sahte oyuncu üretir. Login formu, logout, OAuth akışı YOK |
| **Yarış takvimi yok** | Planlı, çok katılımcılı `GET /races` takvimi yok; yalnızca practice race + PvP |
| **Matchmaking senkron** | `JoinMatchmakingQueueUseCase.playMatch` eşleşmeyi **HTTP isteği içinde** yapar. `@nestjs/schedule`/cron/worker YOK → arka plan işi yok |
| **Pazar süresi dolması tembel** | `PostgresMarketListingRepository.sweepExpiredListings` — lazy sweep, zamanlanmış iş değil |
| **Müzayede ilanı yok** | Yalnızca `fixed_price` |
| **Jokey bağlanmamış** | `calculateJockeySkillComposite` race engine'den **hiç çağrılmıyor**; `jockeySkillComposite` nötr 50, `RaceEntry.jockeyId` hep `null` |
| **Çiftlik/personel çarpanları bağlanmamış** | `domain/farm/farm.ts`'teki tüm `get*Multiplier` fonksiyonlarının çağıranı yok; `domain/staff/` tamamen bağlanmamış |
| **Bağlanmamış domain modülleri** | tournament, club, ranking, season, progression, breeding/genetics — mantık + spec var, controller/use-case/repository yok |
| **Placeholder sayfalar** | `/club`, `/farm`, `/leaderboard` yalnızca `<ComingSoon>` render eder |
| **Bağlanmamış iskeletler** | `RaceAudioManager`/`html-audio-backend`, `GltfAssetLoader` — hiçbir yerden import edilmiyor; `PlayerDemoWidget.tsx` hiçbir sayfada mount edilmiyor. (**`DustParticles` ve `PedigreeTree` artık BAĞLI** — 27.09.2026, bkz. §13 ve §13.2) |
| **PWA nominal** | `public/manifest.json` → `icons: []`, `layout.tsx`'ten link'lenmiyor, `next-pwa` yok |
| **`notification.new`** | WebSocket olayı planlandı, uygulanmadı |

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
