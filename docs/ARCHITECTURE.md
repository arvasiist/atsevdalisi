# ARCHITECTURE.md — Mimari Kararlar

> Bu doküman `docs/PROJECT_BRIEF.md`'nin (source of truth) üzerine inşa edilir.
> Brief'te belirsiz veya çelişkili bırakılan noktalar burada netleştirilir.
> Herhangi bir çelişki durumunda önce bu doküman güncellenir, sonra kod yazılır
> (brief §91).

---

## 1. Neden web tabanlı mimariye pivot edildi?

Orijinal brief (§6, §48) bir **Unity + C# istemci** ve **ASP.NET Core backend**
öngörüyordu. Proje sahibi ile yapılan netleştirme görüşmesinde şu karar alındı:

> İstemci, **web tabanlı, responsive ve mobil uygulamaya uygun** olacak şekilde
> geliştirilecektir.

Gerekçeler:

1. **Dağıtım hızı:** Web tabanlı bir istemci, app store onay süreçleri
   olmadan anında güncellenebilir; bu, brief'in "günlük görev/sezon/canlı
   servis" hedefleriyle (§37, §68, §69) daha uyumludur.
2. **Tek kod tabanı, çoklu platform:** Responsive bir web istemcisi; masaüstü
   tarayıcı, mobil tarayıcı ve (PWA veya Capacitor/React Native sarmalayıcı ile)
   mobil uygulama mağazaları için tek bir kaynaktan servis edilebilir.
3. **Erişilebilirlik:** Oyuncu, kurulum gerektirmeden bir bağlantıyla oyuna
   girebilir; bu, brief'in "az tıklamalı, hızlı" UI hedefiyle (§47) örtüşür.
4. **Ekip/araç uyumu:** Bu proje TypeScript tabanlı bir geliştirme ortamında
   sürdürülecektir; Unity/C#/.NET araç zincirine bu ortamda erişim yoktur.
   Node.js tabanlı bir yığın hem geliştirme hem CI için daha uygundur.

**Değişmeyenler:** Brief'in tüm oyun tasarımı, veri modeli, algoritmalar,
server-authoritative prensipleri, katman mimarisi (Domain/Application/
Infrastructure/API) ve geliştirme sırası **birebir korunmuştur.** Sadece
"istemci nasıl render edilir" ve "backend hangi runtime'da çalışır" kararları
güncellenmiştir.

---

## 2. Teknoloji eşleme tablosu (Brief → Güncel karar)

| Brief'teki karar | Güncel karar | Gerekçe |
|---|---|---|
| Unity + C# istemci | **Next.js 14+ (React + TypeScript)**, App Router | Web tabanlı, SSR/SSG destekli, responsive, SEO ve PWA'ya uygun |
| Unity 3D sahne/animasyon | **Three.js** (`@react-three/fiber` + `@react-three/drei`) | Tarayıcıda WebGL ile 3D yarış sahnesi; brief §22'deki "önce simülasyon, sonra render" prensibi birebir korunur |
| ASP.NET Core backend | **NestJS (Node.js + TypeScript)** | Modüler DI mimarisi Domain/Application/Infrastructure/API katımanı doğrudan destekler; WebSocket Gateway'leri yerleşik gelir |
| PostgreSQL | **PostgreSQL** (değişmedi) | Brief'teki transaction/row-locking gereksinimleri (§55) için ACID uyumlu ilişkisel DB şart |
| Redis | **Redis** (değişmedi) | Session, leaderboard, race lobby cache (§78) |
| REST API | **REST API** (değişmedi) + gerektiğinde WebSocket | Brief §50 endpoint tasarımı korunur |
| WebSocket gerektiğinde | **Socket.IO / Nest Gateway** | Canlı yarış telemetrisi ve online lobi (§41) için |
| — (belirtilmemiş) | **TypeScript her katmanda** (frontend, backend, shared-types) | Tek dil, paylaşılan tipler, daha az entegrasyon hatası |

---

## 3. Güncel sistem mimarisi

```text
                    ┌───────────────────────────┐
                    │   Next.js Web İstemcisi   │
                    │  React + TypeScript + PWA │
                    │  (responsive, mobil dahil)│
                    └─────────────┬─────────────┘
                                  │ HTTPS (REST) + WebSocket
                                  ▼
                    ┌───────────────────────────┐
                    │       NestJS API           │
                    │  Authentication            │
                    │  Player / Economy          │
                    │  Horse / Stable / Training │
                    │  Market / Breeding         │
                    └─────────────┬─────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                 ▼
          PostgreSQL           Redis          Race Engine Modülü
        (authoritative)     (cache/session)   (Domain katmanında,
                                                deterministic simülasyon)
                                                       │
                                                       ▼
                                                Race Result
                                             (DB'ye persist edilir)
                                                       │
                                                       ▼
                                        Next.js istemcisi Three.js ile
                                        sonucu görselleştirir (replay)
```

**Kritik kural (brief §6, §64 ile birebir aynı):** İstemci yarış sonucunu asla
hesaplamaz. İstemci sadece "yarışı göster" der; NestJS API + Race Engine
modülü sonucu authoritative olarak üretir, istemci bu sonucu Three.js ile
zaman çizelgesine (timeline) göre oynatır (§22, §25).

### 3.1 Monorepo yapısı

```text
at-sevdalisi/
├── docs/                         # Bu doküman dahil tüm mimari/tasarım dokümanları
├── apps/
│   ├── web/                      # Next.js istemcisi
│   │   └── src/
│   │       ├── app/              # App Router sayfaları (Ana Sayfa, Ahırım, ...)
│   │       ├── components/       # Paylaşılan UI bileşenleri
│   │       └── styles/           # Tema config'e bağlı stil sistemi
│   └── api/                      # NestJS backend
│       └── src/
│           ├── domain/           # Saf oyun kuralları (framework'ten bağımsız)
│           ├── application/      # Use-case'ler (BuyHorse, TrainHorse, ...)
│           ├── infrastructure/   # PostgreSQL, Redis, config erişimi
│           └── api/               # REST controller'lar, DTO'lar
├── packages/
│   ├── shared-types/             # Frontend + backend arasında paylaşılan TS tipleri
│   └── game-config/              # Tip güvenli config loader
├── database/
│   ├── migrations/               # Sıralı, geri alınabilir SQL migration'lar
│   └── seeds/                    # Geliştirme verisi
└── config/                       # Oyun dengesi JSON dosyaları (brief §52)
```

Bu yapı, brief §48'deki `client/`→`server/` ayrımını `apps/web/`→`apps/api/`
olarak korur; `packages/` yeni eklenen ortak katmandır (Unity mimarisinde
karşılığı yoktu, çünkü C# istemci ile C# backend zaten tip paylaşamıyordu —
TypeScript'in avantajı budur).

---

## 4. Katman kuralları (brief §49 ile birebir)

- **Domain**: Framework'ten habersiz, saf TypeScript sınıfları/fonksiyonları.
  `Horse`, `Race`, `RaceEntry`, `TrainingSession`, `BreedingPair`,
  `MarketListing` gibi varlıkların iş kuralları burada yaşar. Hiçbir NestJS
  dekoratörü, hiçbir ORM importu burada bulunmaz.
- **Application**: Use-case orkestrasyon katmanı (`BuyHorseUseCase`,
  `TrainHorseUseCase`, `SimulateRaceUseCase` ...). Domain nesnelerini
  kullanır, Infrastructure'a arayüzler (interface/port) üzerinden bağlanır.
- **Infrastructure**: PostgreSQL repository implementasyonları, Redis
  client'ları, config loader, dış servisler.
- **API**: NestJS controller'ları, DTO validasyonu, HTTP/WebSocket giriş
  noktaları. İş kuralı içermez; sadece Application katmanını çağırır.

Bağımlılık yönü tek yönlüdür: `API → Application → Domain`,
`Infrastructure → Domain (interface implementasyonu)`. Domain hiçbir zaman
dışa bağımlı değildir.

---

## 5. Frontend mimarisi (Next.js)

- **App Router** kullanılır (`apps/web/src/app`), her ana ekran (Ana Sayfa,
  Ahırım, At Pazarı, Yarışlar, Antrenman, Çiftlik, Online, Sıralama, Kulüp)
  kendi route segmentine sahiptir (brief §70 UI ekran haritası birebir).
- **Responsive tasarım**: Mobil öncelikli (mobile-first) CSS, breakpoint'ler
  `apps/web/src/styles` altında merkezi tema config'inden yönetilir (brief
  §47 "renkler tema config üzerinden yönetilmelidir" kuralı, breakpoint ve
  spacing dahil genişletilmiştir).
- **UI ↔ Domain ayrımı**: Brief §47'deki `Button → ViewModel → Service → API
  → Domain → Result → UI` akışı frontend'de şu şekilde uygulanır:
  `Component → Hook/ViewModel → API Client (services/) → NestJS API`.
  Hiçbir component doğrudan `fetch` ile veri tabanına ya da iş kuralına
  erişmez.
- **PWA desteği**: `manifest.json` + service worker ile ana ekrana eklenebilir
  mobil deneyim sağlanır; ileri fazda React Native/Capacitor sarmalayıcı ile
  gerçek mağaza dağıtımı değerlendirilebilir (bu, brief'in "mobil uygulamaya
  uygun" talebini karşılar).
- **3D/Görsel katman**: Yarış ekranı `@react-three/fiber` ile ayrı bir modül
  olarak izole edilir; bu modül **sadece** Race Engine'den gelen
  `RaceTimeline` verisini render eder, hiçbir simülasyon mantığı içermez
  (brief §22 kuralı).

**Uygulama notu (FAZ 6, `apps/web/src/features/race-viewer/`):** bu izolasyon
birebir uygulandı — `RaceScene3D.tsx` (Three.js Canvas) ve `RaceViewer.tsx`
(orkestratör) SADECE zaten hesaplanmış `RaceTimeline`'ı (segment kontrol
noktaları arasında saf lineer ara değerleme ile, `timeline-playback.ts`)
render eder. Gerçek 3D asset'ler (model/animasyon/ses/VFX/crowd) henüz
yoktur — "basit şekillerle iskelet" kapsamında kapsül/küre gibi temel
geometrik şekiller kullanılır (proje sahibinin bu oturumdaki kapsam kararı,
bkz. `features/race-viewer/README.md`). Kamera sistemi (Pist/Jokey/Son
Düzlük/Fotofiniş) ve mini harita tamamlandı; `next/dynamic` + `ssr:false`
ile lazy-load (§7 hedefiyle tutarlı) uygulandı. **Doğrulama notu:** bu
fazda eklenen `three`/`@react-three/fiber`/`@react-three/drei`
bağımlılıkları §9'daki kısıt nedeniyle bu ortamda kurulamadı; JSX/Three.js
içeren dosyalar CI'da doğrulanacak, framework'ten bağımsız pist/kamera/
oynatma/mini-harita matematiği ise yerel `tsc` + gerçek testlerle
doğrulandı (`apps/web/tsconfig.logic.json`).

---

## 6. Backend mimarisi (NestJS)

- Her domain alanı (`horse`, `player`, `race`, `jockey`, `economy`,
  `training`, `breeding`, `market`, `farm`, `staff`, `progression`,
  `online`, `ranking`, `club`, `tournament`, `season`) kendi NestJS
  modülüne sahiptir. FAZ 7 (Online) eklentileri — `domain/online`
  (matchmaking, Elo, anti-cheat, race room), `domain/ranking`
  (RankingScore, leaderboard), `domain/club`, `domain/tournament`,
  `domain/season` — brief §41-44/§68-69 ile birebir uyumludur; bkz. o
  klasörlerin README.md'leri ve `docs/ROADMAP.md` "FAZ 7 tamamlanma
  durumu". Online yarışlar YENİ bir simülasyon motoru GEREKTİRMEZ — mevcut
  `domain/race/race-engine.ts` bir "oda" (room) bağlamında çağrılır.
- Race Engine, **Domain** katmanında framework'ten bağımsız, saf bir
  hesaplama modülü olarak yaşar (`apps/api/src/domain/race/race-engine.ts`);
  böylece hem NestJS içinde hem de ayrı bir CLI/test aracında (`tools/`
  altındaki balance simülatörü, brief §83) hiçbir değişiklik olmadan
  çalıştırılabilir.
- **Idempotency** (brief §54): Ödül/ödeme endpoint'lerinde `Idempotency-Key`
  header'ı zorunludur; Redis'te kısa süreli anahtar takibiyle tekrarlanan
  istekler engellenir.
- **Transaction/row-locking** (brief §55): Para ve mülkiyet değişikliği
  içeren tüm use-case'ler PostgreSQL transaction'ı içinde, `SELECT ... FOR
  UPDATE` ile çalışır.

---

## 7. Performans hedefleri (brief §76'nın web karşılığı)

Unity'nin "Object pooling, LOD, texture optimization" hedeflerinin web
karşılığı:

- **Core Web Vitals** hedeflenir (LCP < 2.5s, INP < 200ms, CLS < 0.1).
- Next.js code-splitting ve route bazlı lazy loading kullanılır; Three.js
  sahnesi sadece yarış ekranına girildiğinde yüklenir (dynamic import).
- 3D modeller için düşük poligon sayılı, mobil GPU'da çalışabilir asset
  bütçesi belirlenir (ileride `docs/GAME_DESIGN.md`'ye asset bütçesi
  eklenecektir).
- Görseller `next/image` ile otomatik optimize edilir, WebP/AVIF kullanılır.
- Backend tarafı brief'teki hedeflerle birebir aynıdır: async I/O, caching,
  pagination, database index, connection pooling.

---

## 8. Ortam / Deploy stratejisi (öneri, onay bekliyor)

| Bileşen | Öneri |
|---|---|
| Web (Next.js) | Vercel veya kendi Node sunucusu / Docker |
| API (NestJS) | Docker container, herhangi bir Node hosting (Railway, Fly.io, kendi VPS) |
| PostgreSQL | Yönetilen servis (Supabase, RDS, Railway) veya self-hosted |
| Redis | Yönetilen servis (Upstash, Redis Cloud) veya self-hosted |
| CI/CD | GitHub Actions: lint → typecheck → test → build |

Bu bölüm bir öneridir; proje sahibinin tercih ettiği barındırma sağlayıcısı
netleştiğinde güncellenecektir.

---

## 9. Bu oturumdaki bilinen kısıt

Bu depo, geliştirme ortamının **npm registry'ye (registry.npmjs.org) erişimi
güvenlik politikasıyla kısıtlı** olduğu bir ortamda hazırlanmıştır. Bu nedenle:

- Tüm `package.json` dosyaları doğru bağımlılıkları **tanımlar** ancak bu
  ortamda `npm install` **çalıştırılamamıştır**.
- Kod, framework importları (örn. `@nestjs/common`, `next`) içeren dosyalarda
  **yapısal olarak doğru** yazılmış, ancak bu ortamda derlenerek
  doğrulanamamıştır.
- Bağımlılık gerektirmeyen saf TypeScript dosyaları (`packages/shared-types`,
  domain modelleri, config loader) yerel `tsc` ile **derlenerek
  doğrulanmıştır.**
- Proje sahibi, `npm install` komutunu kendi makinesinde veya CI ortamında
  çalıştırarak projeyi ayağa kaldırabilir; bu depoda eksik veya hatalı bir
  import bulunursa ilk `npm install && npm run typecheck` çalıştırmasında
  ortaya çıkacak ve bir sonraki oturumda hızlıca düzeltilecektir.

**Önemli fark:** Bu kısıt yalnızca BU geliştirme ortamı içindir — GitHub
Actions'ın kendi runner'ının (`.github/workflows/ci.yml`) internet erişimi
bu ortamdan tamamen bağımsızdır ve `npm install`'ı sorunsuz çalıştırabilir.
Bu, GitHub'a push edilen kodun her seferinde **gerçekten** derlenip test
edildiği, bu geliştirme ortamındaki kısıttan etkilenmediği anlamına gelir
— CI sonucu bu nedenle NestJS/Next.js gibi framework koduna dair gerçek
bir doğrulama sinyali olarak güvenle kullanılabilir (bkz. §9.1).

**Yeni CI yeteneği (FAZ 1 wiring, bu oturum):** `.github/workflows/ci.yml`
artık job süresince ayakta duran geçici bir `postgres:16-alpine` "service
container" başlatıyor ve "Test" adımından önce `npm run migrate`
çalıştırıyor. Bu, projede İLK KEZ gerçek bir veritabanına karşı e2e test
çalıştırılabildiği anlamına gelir (`apps/api/test/api/player.e2e-spec.ts`,
ayrıca daha önce bir glob-eşleşme kusuru yüzünden hiç koşmamış olan
`health.e2e-spec.ts` — bkz. `docs/ROADMAP.md` "FAZ 1 wiring" bölümü).
Service container job bitince otomatik silinir; kalıcı veri/maliyet
oluşturmaz.

### 9.1. CI'da bulunan gerçek hatalar (düzeltildi)

**Hata 1 — lock dosyası eksik:** İlk 4 push'ta (`f05e9f1`, `b4ec0cd`,
`a5677dc`, `f9703cd`) CI, saniyeler içinde "Dependencies lock file is not
found" hatasıyla başarısız oldu — `npm ci` ve `actions/setup-node`'un
`cache: 'npm'` seçeneği bir `package-lock.json` gerektirir, ama bu dosya
hiç üretilememişti (yukarıdaki kısıt nedeniyle). Düzeltme: `npm ci` →
`npm install`, `cache: 'npm'` kaldırıldı (bkz. `.github/workflows/ci.yml`
yorumları). Bu, gerçek CI sinyalinin bu ortamdan WebFetch ile okunabilir
olduğunun (dolayısıyla NestJS wiring gibi framework kodunun proje
sahibine ekstra bir komut satırı işi çıkarmadan doğrulanabileceğinin) ilk
kanıtıdır.

**Hata 2 — paket derleme sırası:** Bir sonraki push'ta (`4712935`) CI,
`npm install`'ı geçti ama typecheck adımında `@at-sevdalisi/shared-types`
ve `@at-sevdalisi/game-config` modülleri bulunamadı hatası verdi. Kök
neden: bu iki paketin `package.json`'ı `main`/`types` alanlarını
`dist/index.js`/`dist/index.d.ts`'e işaret ediyor, ama `dist/` klasörü
yalnızca o paketin kendi `build` script'i (`tsc -p tsconfig.json`)
çalıştırılınca oluşuyor — ve kök `package.json`'daki `typecheck` script'i
`build` script'inden ÖNCE çalışıyordu, dolayısıyla paketler henüz
derlenmemişken apps/api'nin typecheck'i onları arıyordu. Ayrıca bu
paketlerin `tsconfig.json`'ı temel konfigürasyondan `"module": "ESNext"`
miras alıyordu — apps/api (NestJS) CommonJS derlendiğinden, ESM `dist/
index.js`'i çalışma zamanında `require()` etmeye çalışsaydı hata verirdi.
Düzeltme: kök `package.json`'a paketleri her zaman önce derleyen bir
`build:packages` script'i eklendi ve `build`/`test`/`typecheck`
script'lerinin başına eklendi; `packages/shared-types` ve `packages/
game-config`'in `tsconfig.json`'larına `"module": "CommonJS"` geçersiz
kılması eklendi (yerel `tsc` ile derlenip CommonJS çıktı ürettiği
doğrulandı).

**Hata 3 — `moduleResolution: Bundler` + `module: CommonJS` uyumsuzluğu:**
Hata 2'nin düzeltmesi CI'da yeni bir hata açığa çıkardı: "Option 'bundler'
can only be used when 'module' is set to 'preserve' or to 'es2015' or
later." `tsconfig.base.json`'daki `"moduleResolution": "Bundler"`,
`"module": "CommonJS"` ile uyumsuzdur (TypeScript bunu artık sert bir
hata olarak işaretliyor). Düzeltme: her iki paketin `tsconfig.json`'ına
`"moduleResolution": "Node10"` eklendi (CommonJS için doğru/klasik
çözümleme modu). Simüle edilmiş `node_modules` symlink'leri ile uçtan uca
doğrulandı (bir domain dosyasının hem `@at-sevdalisi/shared-types` hem
`@at-sevdalisi/game-config`'i gerçek paket adlarıyla çözümleyebildiği
test edildi) — bu üçüncü hatanın son olacağına dair yüksek güven var,
ancak CI yine de nihai doğrulama kaynağıdır.

*(Not: Bu ortamdaki yerel `tsc` sürümü — 6.0.3 — "Node10"u zaten
kaldırılmaya aday gösterip zararsız bir uyarı/hata satırı basıyor; ancak
tüm `package.json` dosyaları `"typescript": "^5.5.0"` ile sabitlendiğinden
gerçek CI ortamı ASLA TypeScript 6.x kurmaz, bu satır yalnızca yerel
doğrulamaya özgü kozmetik bir gürültüdür.)*

**Hata 4 — testi olmayan workspace'te `vitest` boş test setiyle
başarısız oluyor:** Hata 3'ün düzeltmesinden sonra CI, lint/typecheck/
build adımlarını geçti ama "Test" adımı sessizce `exit code 1` ile
başarısız oldu — GitHub'ın annotation panelinde (yalnızca lint/tsc gibi
araçların ürettiği uyarı/hata satırlarını yakalar) görünür bir hata
yoktu, bu yüzden kök nedenin teşhisi iki ayrı CI log okuma denemesi
gerektirdi. Kök neden: `apps/web` workspace'inin henüz hiç test dosyası
yok (yalnızca iskelet `src/app` dosyaları var), ama `package.json`'ında
`"test": "vitest run"` script'i tanımlı; kök `npm run test` script'i
`--workspaces --if-present` ile HER workspace'te (packages/* ve apps/*)
"test" script'i varsa çalıştırıyor. Vitest, eşleşen hiçbir test dosyası
bulamadığında varsayılan olarak "No test files found" mesajıyla `exit
code 1` ile çıkar — bu, gerçek bir test başarısızlığı değil, sadece
"henüz test yok" durumudur, ama CI'ı aynı şekilde kırmıştı. Düzeltme:
`apps/web`, `apps/api`, `packages/shared-types`, `packages/game-config`
paketlerinin dördünün de `"test"` script'i `"vitest run
--passWithNoTests"` olarak güncellendi (resmi, belgelenmiş Vitest CLI
bayrağı — Jest'teki aynı isimli bayrağın karşılığı). `apps/api` ve her
iki `packages/*` paketinin zaten gerçek testleri var; bu bayrak onlarda
mevcut testleri ATLAMAZ veya zayıflatmaz — yalnızca "hiç test dosyası
yok" durumunu başarısızlık saymaz. Bu, gelecekte FAZ 2+'da yeni bir
workspace/paket geçici olarak testsiz eklenirse aynı hatanın tekrar
CI'ı kırmasını da önler.

**Hata 5 — `Function` tipi (FAZ 1 wiring, bu oturum, GERÇEK kök neden):**
"Lint" adımı FAZ 1 wiring'in Player kaydı teslimatında ÜÇ kez üst üste
başarısız oldu. İlk iki teşhis denemesi (bir DTO'daki sabit sayıları
kaldırmak, sonra `@typescript-eslint`/`eslint` sürümlerini
`package.json`'da tam sürüm olarak sabitlemek — ikisi de kendi başına
makul, iyi hijyen adımlarıydı ve korundu) sorunu ÇÖZMEDİ. Annotation
paneli her seferinde yalnızca bilinen/zararsız "no magic number"
uyarılarını gösteriyordu; gerçek hata bir "Show more" katlanmış grubunun
arkasına gizlenmişti ve ham CI günlüğü bu ortamdan (kimlik doğrulama
gerektirdiği için) okunamadığından fark edilmedi. Geçici bir teşhis
adımıyla (eslint çıktısının her satırını `::error::` iş akışı komutu
olarak yazdırmak — bkz. `docs/ROADMAP.md` "FAZ 1 wiring" bölümü) gerçek
hata ortaya çıkarıldı: `apps/api/src/api/middleware/http-exception.filter.ts`
içinde `DOMAIN_ERROR_MAP`'in tipi `Map<Function, {...}>` idi;
`plugin:@typescript-eslint/recommended`, tip güvenliği sağlamayan
`Function` tipini HATA (uyarı değil) seviyesinde yasaklar. Düzeltme:
`Function` yerine `type ErrorClassConstructor = new (...args: never[])
=> Error` tanımlanıp kullanıldı. Bu, bu oturumun en zor teşhis edilen
CI hatasıydı — ders: annotation panelindeki katlanmış ("Show more")
gruplar, farklı ciddiyet/kural seviyesindeki gerçek hataları
gizleyebilir; şüpheli durumda `::error::` iş akışı komutuyla açıkça
yeniden yazdırmak güvenilir bir teşhis yöntemidir.

**Hata 6 — Vitest/esbuild, NestJS'in örtük (tip tabanlı) bağımlılık
enjeksiyonu için gereken üst veriyi yaymaz (FAZ 1 wiring, bu oturum,
beşinci CI hatası):** "Lint"/"Typecheck"/"Run database migrations"
adımları ilk kez geçtikten sonra "Test" adımı, `player.e2e-spec.ts`'in
GERÇEK Postgres'e karşı yaptığı TÜM isteklerde beklenen 201/404/400/409
yerine HTTP 500 ile başarısız oldu. `HttpExceptionFilter` gerçek hatayı
bilinçli olarak istemciye sızdırmadığından (`docs/SECURITY.md`), Hata
5'te işe yarayan AYNI `::error::` teşhis tekniği "Test" adımına da
uygulandı (bu kez `grep -i -E "error|exception|beklenmedik|at /home/
runner|fail"` filtresiyle, 296+ geçen test satırıyla paneli
doldurmamak için) ve gerçek hatayı ortaya çıkardı: `TypeError: Cannot
read properties of undefined (reading 'execute')`.

`apps/api/tsconfig.json`'da `experimentalDecorators`/
`emitDecoratorMetadata`'nın ikisinin de doğru ayarlandığı doğrulandı —
bu, NestJS'in tip tabanlı enjeksiyonunun `undefined` dönmesinin en
yaygın nedenini ekarte etti. Asıl neden: bu tsconfig ayarları yalnızca
`npm run build`'in kullandığı GERÇEK `tsc` derleyicisi için geçerlidir;
ama e2e testleri **Vitest** altında çalışır ve Vitest, dosyaları `tsc`
yerine **`esbuild`** ile dönüştürür. `esbuild` tip bilgisinden bağımsız
(type-unaware), dosya-bazlı bir dönüştürücüdür — `experimentalDecorators`
dekoratör sözdizimini destekler, ama `emitDecoratorMetadata`'nın
gerektirdiği `design:paramtypes` üst verisini (parametre tiplerinin tam
tip çözümlemesini gerektirdiği için) HİÇBİR ZAMAN yaymaz. Sonuç:
`PlayerController`'ın kurucusundaki `RegisterPlayerUseCase`/
`GetPlayerUseCase` parametreleri ve `RegisterPlayerUseCase`'in kendi
kurucusundaki `AppConfigService` parametresi — üçü de açık bir
`@Inject()` token'ı OLMADAN, yalnızca TypeScript tipine göre enjekte
ediliyordu — gerçek `tsc` derlemesiyle (production `main.ts` bootstrap'ı)
çalışırken sorunsuzdu, ama `vitest`/`esbuild` altında `undefined` kalıp
`.execute(...)` çağrısını patlatıyordu.

Düzeltme: bu üç yerde de, projede zaten `PLAYER_REPOSITORY`/`PG_POOL`
için yapılan desenle AYNI şekilde, açık `@Inject()` token'ı eklendi.
Tüm kod tabanı (`constructor(` içeren her dosya) tarandı; bu üçü
DIŞINDA örtük tip tabanlı enjeksiyona güvenen başka bir NestJS
sağlayıcısı bulunmadı. **Genel kural (gelecekteki tüm NestJS
kod için geçerli):** bu projede `tsc` ile derlenen kod hem gerçek build
hem Vitest/esbuild altında çalıştığından, NestJS constructor
enjeksiyonunda İSTİSNASIZ her zaman açık `@Inject(Token)` kullanılmalı —
sınıfın kendisi token olsa bile (`@Inject(SomeClass)`) — asla yalnızca
parametre tipine güvenilmemeli. Ders: Hata 5 ile aynı — ham günlük/
`$GITHUB_STEP_SUMMARY` okunamadığında `::error::` yeniden yazdırma
tekniği burada da tek güvenilir teşhis yolu oldu; ayrıca bu, "yerelde
`tsc --strict` ile doğrulanan bir tip deseni CI'da mutlaka aynı şekilde
çalışır" varsayımının YANLIŞ olabileceğini gösterdi — derleyici
(`tsc`) ile test çalıştırıcısının dönüştürücüsü (`esbuild`) farklı
araçlar olduğunda, birinin doğru kabul ettiği bir desen diğerinde
sessizce farklı davranabilir.

**Hata 7 — DTO doğrulaması (`ValidationPipe`), aynı esbuild kök nedeniyle
sessizce ATLANABİLİR (FAZ 1 wiring, dördüncü dilim, bu oturum, Antrenman
CI denemesi):** `training.e2e-spec.ts`'teki "geçersiz bir tür için 400
döner" senaryosu, beklenen `400`yerine `500 INTERNAL_ERROR` ile
başarısız oldu — `TrainHorseDto`'daki `@IsIn(TRAINING_TYPES)` kontrolü
hiç çalışmamış gibi davrandı.

Kök neden, Hata 6 ile TIPKI AYNI mekanizma, ama farklı bir NestJS
özelliğine uygulanmış hâli: NestJS'in `ValidationPipe`'ı, bir `@Body()`
parametresini HANGİ DTO sınıfına göre doğrulayacağını bilmek için
controller metodunun PARAMETRE TİPİ üst verisine (`Reflect.getMetadata(
'design:paramtypes', ...)`) bakar; bu üst veri de (Hata 6'daki
`design:paramtypes` ile AYNI neden — `emitDecoratorMetadata` yalnızca
gerçek `tsc` derlemesinde üretilir) Vitest/esbuild altında YAYINLANMAZ.
Sonuç: `ValidationPipe` metatype'ı çözemediğinde doğrulamayı SESSİZCE
ATLAR, DTO'daki hiçbir `class-validator` decorator'ı ÇALIŞMAZ, geçersiz
`type: "not-a-real-type"` değeri doğrudan `TrainHorseUseCase`'e ve
oradan `domain/training/training.ts`'e ulaşır — `config.types[trainingType]`
`undefined` döner, `.baseGain` erişimi ham bir `TypeError` fırlatır,
`HttpExceptionFilter`'ın hiçbir domain hata eşlemesine uymadığından
istemciye `500` olarak yansır.

**Neden Player'ın DTO'sunda bu hiç fark edilmedi?** `RegisterPlayerDto`
için de AYNI risk teorik olarak vardır — ama `RegisterPlayerUseCase`,
DTO'dan BAĞIMSIZ olarak `domain/player/validation.ts`'teki
`validateUsername`/`validateDisplayName`'i YİNE çağırır (bilinçli bir
tekrar, bkz. `register-player.dto.ts`'teki yorum) — bu yüzden DTO'nun
kendi kontrolü esbuild altında sessizce atlansa bile, domain katmanının
BAĞIMSIZ kontrolü `InvalidUsernameError` fırlatıp doğru `400`'ü üretiyordu.
Antrenman dilimi ilk yazıldığında `type`/`intensity` için BÖYLE bir
ikinci, domain-seviyesi kontrol YOKTU — yalnızca DTO'ya güvenilmişti.

**Düzeltme ve GENEL KURAL (gelecekteki TÜM DTO'lar için geçerli):**
`domain/training/training.ts`'teki `getTypeConfig`/`getIntensityMultiplier`
artık `config`'de tanımsız bir `type`/`intensity` geldiğinde yeni
`InvalidTrainingInputError`'ı (domain hatası, `HttpExceptionFilter`'da
`400 VALIDATION_ERROR`'a eşlenir) fırlatıyor — DTO'nun `@IsIn(...)`
kontrolü hâlâ İLK savunma hattı (gerçek `tsc` build'inde, yani PRODUCTION'da
çalışır) ama artık TEK savunma hattı DEĞİL. **Kural:** bir DTO alanı,
domain katmanında bir dizi/lookup erişimini GÜVENLİ hale getirmek için
kullanılıyorsa (örn. `config.X[değer]`), domain katmanı o değeri KENDİSİ
de doğrulamalı — `class-validator` decorator'larına TEK BAŞINA
güvenilmemeli, `RegisterPlayerUseCase`'in zaten yaptığı gibi. Bu, hem
Hata 6'nın (constructor enjeksiyonu) hem Hata 7'nin (metod parametresi
doğrulaması) ORTAK dersidir: bu projede `esbuild` altında çalışan HİÇBİR
NestJS "örtük tip üst verisine dayalı" özelliğine (implicit DI, otomatik
DTO doğrulama, vb.) TEK BAŞINA güvenilemez — ya açık bir alternatif
(`@Inject()`) kullanılmalı, ya da domain katmanında BAĞIMSIZ bir ikinci
kontrol bulunmalıdır.

---

### 9.2. `withTransaction` — çok tablolu aggregate persistence (FAZ 1 wiring, dördüncü dilim)

Bu oturumdaki dördüncü wiring dilimi (Antrenman, `POST /horses/{id}/train`)
ilk kez bir at oluşturulurken İKİ tabloya (`horses` + `horse_stats`) birlikte
yazma ihtiyacı doğurdu — bir at, kendisine ait bir `horse_stats` satırı
olmadan var olmamalıdır (Antrenman bu satırı okur/günceller). `§8`'de
(Ortam/Deploy) ve `database.module.ts`'in eski bir yorumunda "kritik işlemler
için `withTransaction()` FAZ 1'de eklenecektir" notu vardı — bu, o
yardımcı fonksiyonun ilk gerçek kullanımıdır.

`database.module.ts` → `withTransaction(pool, fn)`: `pool.connect()` ile
TEK bir `PoolClient` alır, `BEGIN`/`COMMIT`/`ROLLBACK`'i bu AYNI bağlantı
üzerinden yürütür (`pool.query(...)` kullanılsaydı her çağrı havuzdan
FARKLI bir bağlantı alabilir ve transaction hiçbir şeyi kapsamazdı — bu,
`pg` ile sık yapılan bir hatadır). `PostgresHorseRepository.save()` artık
bunu kullanıyor; `horse_stats` INSERT'i sütun listesi VERMEDEN yapılır
(`INSERT INTO horse_stats (horse_id) VALUES ($1)`) — DEFAULT değerler
(migration 0003) TEK doğruluk kaynağıdır, domain katmanında TEKRAR
tanımlanmaz.

**Genel kural (gelecekteki tüm çok-tablolu yazma işlemleri için):** bir
aggregate'in birden fazla tabloya yazması gerektiğinde (örn. ileride
Race sonucu + ödül dağıtımı, brief §54), `withTransaction` kullanılmalı —
ayrı `pool.query()` çağrıları YETERSİZDİR.

### 9.3. Satır kilitleme (`SELECT ... FOR UPDATE`) — para/mülkiyet değiştiren ilk use-case (FAZ 1 wiring, altıncı dilim)

`docs/SECURITY.md` §5, para/mülkiyet değiştiren HER use-case'in bir
transaction içinde `SELECT ... FOR UPDATE` ile satırı kilitlemesini
zorunlu kılar — ama bu oturumdaki ilk beş wiring dilimi (Player, Horse,
Ahır Özeti, Antrenman, Bakım) hiçbiri gerçek para harcamıyordu (hepsi
bilinçli olarak "Economy entegrasyonu KAPSAM DIŞI" notuyla teslim edildi),
bu yüzden bu kural şimdiye kadar hiç gerçek anlamda uygulanmamıştı. Ahır
Yükseltme (`POST /players/{id}/stable/upgrade`), `domain/economy/
wallet.ts`'teki `debit`'in İLK gerçek kullanımı olduğu için bu kuralın da
İLK gerçek uygulamasıdır.

**Neden salt `findById` + `update` YETERSİZ:** İki eşzamanlı istek (örn.
kullanıcının "Yükselt" düğmesine çift tıklaması, veya iki farklı sekme)
aynı anda `findById` ile AYNI bakiyeyi (örn. 8000 para) okursa, ikisi de
"yeterli bakiye var" sonucuna ulaşır, ikisi de düşer ve YAZAR — sonuç:
oyuncunun bakiyesi TEK bir yükseltme masrafı kadar düşmesi gerekirken İKİ
kat düşer (ya da satın alınamayacak bir şey satın alınmış olur). Bu,
`docs/SECURITY.md` §5'in "brief §55" referansıyla tam olarak önlemeye
çalıştığı sınıf hatadır.

**Uygulanan desen — `PlayerRepository.updateWithLock(id, mutate)`:**

```ts
// application/ports/player.repository.ts
updateWithLock<T>(id: string, mutate: (player: Player) => { player: Player; result: T }): Promise<T | null>;
```

```ts
// infrastructure/player/postgres-player.repository.ts (basitleştirilmiş)
async updateWithLock(id, mutate) {
  return withTransaction(this.pool, async (client) => {
    const row = await client.query('SELECT * FROM players WHERE id = $1 FOR UPDATE', [id]);
    if (!row.rows[0]) return null;
    const current = rowToPlayer(row.rows[0]);
    const { player: updated, result } = mutate(current); // ← domain hesaplaması BURADA, satır KİLİTLİYKEN
    await client.query('UPDATE players SET ... WHERE id = $1', [...]);
    return result;
  });
}
```

Kritik nokta: `mutate` callback'i (domain hesaplaması — `getNextStableUpgradeCost`
+ `debit`) BİLEREK satır `FOR UPDATE` ile kilitliyken, AYNI transaction
içinde çalıştırılır. Callback'ten ÖNCE, ayrı bir `findById` çağrısıyla
okunan bir değer STALE olabilir (başka bir transaction o sırada satırı
değiştirmiş olabilir) — bu yüzden application katmanı `findById` +
hesaplama + `update` şeklinde ÜÇ ayrı adım YAPMAZ, tek bir kilitli okuma
+ hesaplama + yazma yapar. `mutate` bir domain hatası fırlatırsa (örn.
`InsufficientFundsError`, `MaxStableLevelReachedError`), `withTransaction`
bunu yakalayıp `ROLLBACK` çalıştırır — hiçbir şey yazılmaz.

**Genel kural (gelecekteki tüm para/mülkiyet değiştiren use-case'ler
için — örn. At Pazarı satın alma, yarış ödülü dağıtımı):** `findById` +
ayrı bir `update` YERİNE bu `updateWithLock` deseni (veya birden fazla
satırı aynı anda kilitlemesi gerekiyorsa onun çok-satırlı bir türevi)
kullanılmalıdır.

**İkinci kullanım (FAZ 1 wiring, yedinci dilim — Günlük Ödül):**
`ClaimDailyRewardUseCase`, AYNI `updateWithLock` deseniyle `credit`'i
kullanır (`debit` yerine) — bu, desenin genel (yalnızca "harcama" değil,
her türlü para/durum değişimi için) olduğunu doğrular. Burada satır
kilitlemenin engellediği spesifik hata: iki eşzamanlı "günlük ödülü
talep et" isteği, ikisi de AYNI (henüz güncellenmemiş)
`lastDailyRewardClaimedAt`'ı okuyup ikisi de ödülü verebilirdi —
`updateWithLock` bunu, `assertCanClaimDailyReward` kontrolünü satır
kilitliyken çalıştırarak önler.

---

## 10. Ek öneriler — proje sahibine sunulan geliştirme fırsatları

Brief son derece kapsamlı ve tutarlı hazırlanmış. İncelemede aşağıdaki
noktaların brief'te değinilmediğini veya netleştirilmesinin fayda
sağlayacağını tespit ettik. Bunlar bu depoda **henüz karar bağlanmamış**
açık maddeler olarak işaretlenmiştir; proje sahibinin onayına sunulmuştur:

1. ✅ **Kimlik doğrulama sağlayıcısı — KARAR VERİLDİ (proje sahibi):**
   **Google/Apple Sign-In**. `players` tablosunda şifre/e-posta hash'i
   TUTULMAZ; eşleme `player_auth_providers` tablosunda tutulur (bkz.
   `database/migrations/0011_create_player_auth_providers`,
   `apps/api/src/domain/player/auth-provider.ts`). Gerçek ID token
   doğrulaması (Google/Apple SDK ile imza kontrolü) bir infrastructure
   detayıdır, domain katmanına sızdırılmaz.
2. **Çevrimdışı/zayıf bağlantı davranışı**: Mobil web için, oyuncu antrenman
   sonucu gönderirken bağlantı koparsa ne olacağı tanımlanmamış. Optimistic
   UI + yeniden deneme kuyruğu önerilir.
3. **Erişilebilirlik (a11y)**: Renk kontrastı, ekran okuyucu desteği, klavye
   navigasyonu brief'te yok; modern bir web ürünü için WCAG AA hedefi
   önerilir.
4. **Yerelleştirme (i18n)**: Şu an tamamen Türkçe. İleride global/Türkiye
   sıralaması (§43) olduğuna göre çok dilli altyapı (en az TR/EN) baştan
   i18n-hazır kurulmalı, metinler component içine gömülmemeli.
5. **Bildirim kanalı**: §46 bildirim sistemini event tabanlı öneriyor ama
   iletim kanalı (in-app, push notification, e-posta) belirtilmemiş. Web
   Push API + in-app bildirim merkezi önerilir.
6. **Ödeme altyapısı**: §67 monetization'dan bahsediyor ama gerçek para
   işlemleri için bir ödeme sağlayıcısı (Stripe, iyzico vb.) seçilmemiş.
   Türkiye pazarı için iyzico/Stripe değerlendirilebilir.
7. **KVKK/GDPR uyumluluğu**: Kullanıcı verisi (e-posta, ödeme, oyun içi
   davranış) tutulacağından, Türkiye pazarı için KVKK uyumluluğu ve gizlilik
   politikası dokümantasyonu gerekecektir.
8. **Rate limiting / bot koruması**: §64 anti-cheat'ten bahsediyor ama
   API seviyesinde rate limiting, CAPTCHA (kayıt/giriş) ve bot koruması
   ayrı bir güvenlik katmanı olarak eklenmelidir.
9. **Gözlemlenebilirlik**: §65 logging'den bahsediyor; production için
   merkezi log toplama (örn. OpenTelemetry) ve hata izleme (örn. Sentry)
   önerilir.
10. **Asset üretim hattı**: Özgün at/jokey/hipodrom görselleri ve 3D
    modellerinin nasıl üretileceği (iç tasarım ekibi mi, dış kaynak mı,
    üretken yapay zekâ araçları mı) belirtilmemiş; bu, FAZ 6 öncesi
    netleştirilmelidir.

Bu maddeler `docs/ROADMAP.md` içinde "Açık Kararlar" bölümünde de
listelenmiştir; kod yazımını bloklamazlar ama ilgili faza gelindiğinde karar
verilmesi gerekir.
