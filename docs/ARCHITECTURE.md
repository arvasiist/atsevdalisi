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

---

## 6. Backend mimarisi (NestJS)

- Her domain alanı (`horse`, `player`, `race`, `jockey`, `economy`,
  `training`, `breeding`, `market`) kendi NestJS modülüne sahiptir.
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
