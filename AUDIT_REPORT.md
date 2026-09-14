# AUDIT_REPORT.md — AT SEVDALISI Full Repo Audit

> Master Plan §1/§66 kapsamında yapılan tam repo denetimi. **Bu doküman salt
> tespit raporudur — bu turda hiçbir kod değiştirilmedi.** Tarih: 2026-09-14.
> Kapsam: `apps/api` (NestJS, domain/application/infrastructure/api katmanları),
> `apps/web` (Next.js 14), `database/migrations/0001-0022`, `packages/*`,
> `docs/*`. AUDIT_AND_HARDENING turunda (bir önceki oturum) kapatılan 8 risk
> tekrar bulgu olarak listelenmedi; bu rapor onların ÜZERİNE, kalan/yeni
> alanlara odaklanır.

## Nasıl okunmalı

Her bulgu: **Severity** (Critical/High/Medium/Low/Info) · **Evidence**
(dosya:satır) · **Impact** · **Fix** · **Test requirement**. Bulgular önce
severity'ye göre sıralı bir özet tablo, sonra 6 ana alan halinde ayrıntılı
olarak veriliyor. Her alanın sonunda "Zaten sağlam / IMPLEMENTED" listesi var
— rapor sadece sorunları değil, neyin doğru çalıştığını da göstermeli.

---

## ÖZET — Severity'ye göre sıralı tüm bulgular

| # | Alan | Severity | Özet |
|---|---|---|---|
| S1 | Güvenlik | **CRITICAL** | Hiçbir authentication/authorization mekanizması yok — her endpoint `:id`/body alanındaki kimliğe kör güveniyor |
| S2 | Güvenlik | **CRITICAL** | IDOR: herhangi bir client başka bir oyuncunun atını antrenman/bakım/yarış ile zorla kullanabilir, para/sağlık durumunu etkileyebilir |
| S3 | Güvenlik | **CRITICAL** | At Pazarı: başkasının atını zorla listeleme, başkasının parasıyla zorla satın alma (hırsızlık), herkesin herkesin ilanını iptal edebilmesi |
| D1 | Veritabanı | **CRITICAL** | ✅ **DÜZELTİLDİ** — Bir at için aynı anda birden fazla aktif ilan engellenmiyordu → iki alıcı aynı atı "satın alabiliyordu", biri parasını kaybediyordu |
| S4 | Güvenlik | High | `GET /players/:id`, `GET /horses?ownerId=`, `GET /market/my-listings?sellerId=` — herhangi bir UUID biliniyorsa herkesin verisi okunabilir |
| D2 | Veritabanı | High | ✅ **DÜZELTİLDİ** — Satın alma, `horses.owner_id`'nin hâlâ `listing.sellerId`'e eşit olduğunu kontrol etmiyordu (D1 ile birleşince atın "geri alınması" mümkündü) |
| E1 | Ekonomi | High | Pratik yarış/PvP: cüzdan güncellemesi ile yarış kaydı iki AYRI transaction'da — arada hata olursa çift ödeme/kayıp riski |
| H1 | At Durumu | High | `injured` durumundan `active`'e dönüş yolu YOK — sakatlanan at kalıcı olarak kullanılamaz hale geliyor |
| C1 | Veritabanı | High | ✅ **DÜZELTİLDİ** (At Pazarı yolunda) — Ahır kapasitesi hiçbir yerde zorunlu kılınmıyordu — sınırsız at alınabiliyordu |
| S5 | Güvenlik | High | Helmet/CSP yok, rate limiting yok |
| C2 | Veritabanı | Medium | Antrenman/bakım/besleme `FOR UPDATE` kilidi kullanmıyor — eşzamanlı istekler "lost update" üretebilir |
| H2 | At Durumu | Medium | Pazarda listelenmiş bir at yine de antrenman/yarış için kullanılabiliyor |
| E2 | Ekonomi | Medium | At Pazarı satın alma ile iptal aynı anda çalışırsa, satılmış bir ilan "iptal edildi" olarak üzerine yazılabilir |
| E3 | Ekonomi | Medium | At Pazarı satın almanın Idempotency-Key kapsamı `listingId` — `buyerId` değil; farklı alıcılar aynı anahtarı paylaşırsa çapraz veri sızıntısı |
| R1 | Yarış Motoru | Medium | Hava durumu config'i versiyonlanmıyor (pist config'i zaten mevcut değil, ama hava durumu AKTİF kullanılıyor) |
| R2 | Yarış Motoru | Medium | Yalnızca oyuncunun segmenti kalıcı — botların tam alan (full-field) replay'i mümkün değil, yalnızca yeniden simülasyonla |
| T1 | Test | Medium | Hiçbir akış için 10/50/100 eşzamanlı istek testi yok (yalnızca At Pazarı'nda n=2) |
| T2 | Frontend | Medium | `apps/web`'de SIFIR component/UI testi (`--passWithNoTests` sessizce geçiyor) |
| F1 | Frontend | Medium | Mobil: 360-430px için hiçbir responsive tasarım yok; yarış HUD'u sabit piksel genişlikli, dokunma hedefleri küçük |
| F2 | Frontend | Low | WebSocket hiç uygulanmamış — canlı yarış/yeniden bağlanma tasarımı henüz yok (PLANNED) |
| R3 | Yarış Motoru | Low | Davranış hattının yarısı (Track Fit, Carried Weight, Temperament, Draw, gerçek Jockey, Current Form) hâlâ nötr placeholder |
| T3 | Test | Low | Hiçbir testte 100+ yarış çalıştırılıp taktik/şans dağılımı ölçülmüyor |
| G1 | Repo Hijyeni | Low | `docker-compose.yml`'de sabit-kodlanmış dev-only DB şifresi (yalnızca localhost, gerçek risk değil) |
| DOC1 | Doküman | Low | `docs/ECONOMY.md`: gem shop whitelist'in "kod seviyesinde zorunlu" olduğu iddiası abartılı — böyle bir endpoint yok |

---

## 1. Güvenlik / Server-Authoritative Sınırlar

### S1 — CRITICAL: Authentication mekanizması hiç yok
**Evidence:** `apps/api` içinde `@UseGuards`/`CanActivate`/`AuthGuard`/Passport-JWT hiç yok (tam grep taraması). `AppConfigService.env.jwtSecret` okunuyor ama hiçbir yerde KULLANILMIYOR. `domain/player/auth-provider.ts` yalnızca zaten-doğrulanmış bir kimliği DB kaydına çeviren saf fonksiyon — hiçbir controller'dan çağrılmıyor.
**Impact:** Sistemde "ben kimim" sorusunu doğrulayan HİÇBİR mekanizma yok — docs'un bahsettiği "FAZ-0 kullanıcı adı only" şeması bile controller seviyesinde uygulanmamış.
**Fix:** Gerçek session/JWT auth + global `AuthGuard` + `@CurrentPlayer()` decorator. Her controller, kim olduğunu client'ın gönderdiği bir alandan DEĞİL, doğrulanmış oturumdan almalı.
**Test requirement:** Her mutasyon endpoint'inin geçerli oturum olmadan 401 dönmesi; Oyuncu A'nın geçerli kendi oturumuyla bile Oyuncu B'nin kaynağına erişemediği e2e testleri.
**DÜZELTME NOTU (bu oturum):** Bu raporun ilk taslağı, sağlayıcı seçiminin (Google/Apple Sign-In) proje sahibinin onayını HÂLÂ beklediğini varsaymıştı — bu YANLIŞ. `docs/ARCHITECTURE.md` §10 madde 1 zaten "✅ KARAR VERİLDİ" olarak işaretli ve `player_auth_providers` tablosu (migration 0011) + `domain/player/auth-provider.ts` (saf dönüşüm fonksiyonu) zaten scaffold edilmiş durumda. Gerçekten eksik olan/proje sahibini bekleyen şey KARAR değil, ikisi: (1) gerçek implementasyon — hiçbir controller'a `AuthGuard` bağlanmamış, Google/Apple ID token doğrulaması yapan infrastructure kodu yazılmamış, oturum/JWT ihraç eden bir login endpoint'i yok; (2) Google/Apple Developer konsollarından alınacak GERÇEK OAuth client kimlik bilgileri (Google OAuth Client ID, Apple Sign-In Service ID/Key) — bunları yalnızca proje sahibi temin edebilir, uydurulamaz/test değeriyle production'a konulamaz. (1) hemen başlanabilir (test/staging'de sahte/mock bir sağlayıcıyla), (2) proje sahibinden gelmeden GERÇEK Google/Apple girişi uçtan uca test edilemez.

### S2 — CRITICAL: IDOR — herhangi biri başkasının atını kullanabilir
**Evidence:** `apps/api/src/api/training/training.controller.ts:29-41`, `care.controller.ts:35-53`, `race.controller.ts:32-48` — hepsi yalnızca `@Param('id') horseId` alıyor, `horse.ownerId` karşılaştırması YOK. Aynı şekilde `train-horse.use-case.ts:59-64`, `perform-care-action.use-case.ts:35-39`, `run-practice-race.use-case.ts:75-84`.
**Impact:** Bir at UUID'sini bilen HERKES o atı zorla antrenman ettirebilir/bakabilir/yarıştırabilir — yorgunluk verebilir, sakatlanma tetikleyebilir (`status: 'injured'`), ve pratik yarışta gerçek sahibinin CÜZDANINDAN giriş ücretini düşebilir, sahibinin haberi/onayı olmadan.
**Fix:** Doğrulanmış oturum zorunlu kılınmalı; her mutasyondan önce `horse.ownerId === session.playerId` kontrolü eklenmeli.
**Test requirement:** Oyuncu B, Oyuncu A'nın atı üzerinde train/feed/care/practice-race çağırdığında 403 dönmeli, A'nın atı/cüzdanı DEĞİŞMEMELİ.

### S3 — CRITICAL: At Pazarı — zorla listeleme, zorla satın alma (hırsızlık), yetkisiz iptal
**Evidence:**
- Zorla listeleme: `create-market-listing.use-case.ts:62-71` — `sellerId` atın `ownerId`'sinden alınıyor ama çağıranın o atın sahibi olduğu KONTROL EDİLMİYOR.
- Zorla satın alma: `buy-market-listing.dto.ts` + `market.controller.ts:157-167` — `buyerId` doğrudan request body'den (yalnızca UUID format kontrolü) alınıyor, `buy-market-listing.use-case.ts:43-45`'te doğrudan kullanılıyor. Herhangi bir client, kurbanın UUID'sini `buyerId` olarak göndererek kurbanın GERÇEK parasını düşürüp, saldırganın (satıcı) hesabına aktarabilir.
- Yetkisiz iptal: `cancel-market-listing.use-case.ts:14-21`'in kendi doc yorumu bunu açıkça "BİLİNÇLİ SINIRLAMA" olarak belirtiyor — herkes herkesin ilanını iptal edebilir.
**Impact:** Zorla mülkiyet devri, kurbanın cüzdanından hırsızlık, rakiplerin ilanlarını iptal ederek hizmet engelleme.
**Fix:** Üç use-case de çağıran kimliği kontrolü gerektiriyor: listeleme → caller == horse.ownerId; satın alma → caller == buyerId (DTO'dan `buyerId` tamamen KALDIRILMALI, `JoinMatchmakingQueueDto`'nun zaten kullandığı desenle — oturumdan türetilmeli); iptal → caller == listing.sellerId.
**Test requirement:** Üçü için de: saldırgan kurbanın atını listeleyemez, kurban adına zorla satın alma yapamaz, kurbanın ilanını iptal edemez.

### S4 — High: Okuma uçlarında geniş IDOR
**Evidence:** `player.controller.ts:56-59` (`GET /players/:id`), `horse.controller.ts:37-52` (`GET /horses?ownerId=`), `market.controller.ts:131-142` (`GET /market/my-listings?sellerId=`) — hiçbiri çağıranın "subject" olduğunu kontrol etmiyor.
**Impact:** Yalnızca UUID bilinerek başka bir oyuncunun cüzdan bakiyesi, at listesi, pazar aktivitesi tam olarak okunabilir.
**Fix:** Auth eklendikten sonra bu uçlar doğrulanmış çağırana (veya kasıtlı bir "genel profil" DTO'suna) kısıtlanmalı.
**Test requirement:** `GET /players/:otherId` doğrulanmış ama sahibi olmayan biri için 403 (veya sansürlü genel görünüm) dönmeli.

### S5 — High: Helmet/CSP yok, rate limiting yok
**Evidence:** `apps/api/package.json`'da `helmet` yok, `main.ts`'te CSP/güvenlik başlığı yok. `@nestjs/throttler` veya eşdeğeri hiç yok. `docs/SECURITY.md` §7 bunu "önerilen, sahip onayı bekleyen" madde olarak listeliyor ama uygulanmamış.
**Impact:** S1/S2/S3 ile birleşince — auth yok + rate limit yok + ownership kontrolü yok kombinasyonu, tek bir scriptli client'ın sınırsız hızda rastgele oyuncuları mağdur edebilmesi anlamına geliyor.
**Fix:** `@nestjs/throttler` ekle (register/login ve ekonomi uçlarına özel limit), `helmet` middleware ekle.
**Test requirement:** Rate-limit aşıldığında 429 dönen entegrasyon testi.

### Zaten sağlam (IMPLEMENTED)
- Gizli `potential` sızıntısı: `horse.mapper.ts`'in `toPublicHorse`'u her yerde doğru uygulanıyor.
- `HorseStats`'ın gerçek gizli alanları (`temperament`, `focus`, `courage`...) hiçbir endpoint tarafından hiç döndürülmüyor.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — client'ın DTO'ya beklenmeyen alan (`money` gibi) eklemesini reddediyor.
- `HttpExceptionFilter` beklenmeyen hatalarda stack trace/detay SIZDIRMIYOR, jenerik `INTERNAL_ERROR` dönüyor.
- CORS yapılandırılmış (`origin`/`credentials`), geliştirilebilir ama mevcut.
- Git geçmişinde gerçek sır/kimlik bilgisi YOK — yalnızca `.env.example` placeholder'ları commit edilmiş.
- WebSocket henüz hiç YOK — bu bir "BROKEN" değil, "PLANNED" durumu; inşa edildiğinde aynı auth/authorization ile korunmalı.

---

## 2. Veritabanı Bütünlüğü / Eşzamanlılık / At Durum Makinesi

### D1 — CRITICAL: Aynı at için birden fazla aktif ilan engellenmiyor
> ✅ **DÜZELTİLDİ (bu oturum)** — `database/migrations/0023_add_market_listing_unique_active_index.{up,down}.sql`
> (kısmi UNIQUE index) + `PostgresMarketListingRepository.save()`'in `unique_violation`'ı
> yakalayıp `HorseAlreadyListedError`'a çevirmesi. Test: `market.e2e-spec.ts`
> "eşzamanlı iki ilan oluşturma isteğinden (aynı at) yalnızca BİRİ 201 döner...".

**Evidence:** `database/migrations/0007`, `0017` — `market_listings` tablosunda `horse_id` üzerinde `status='active' WHERE` şartlı UNIQUE index YOK. `CreateMarketListingUseCase` (`create-market-listing.use-case.ts:63-70`) yalnızca "önce oku, sonra yaz" yapıyor, kilit/transaction YOK.
**Impact:** İki eşzamanlı `POST /market/listings` isteği aynı at için iki aktif ilan oluşturabilir. `PostgresMarketPurchaseRepository` (D2 ile birleşince) atın GERÇEK sahibini kontrol etmediğinden, iki farklı alıcı iki ayrı ilanı "satın alabilir" — ilk alıcı parasını verip atı gerçekten alır, ikinci alıcının satın alması da domain kontrollerinden geçer (o ilan hâlâ `active` görünür), atın sahipliğini KOŞULSUZCA ikinci alıcıya devreder ve parasını ORİJİNAL satıcıya öder (artık atın gerçek sahibi olmayan kişiye) — ilk alıcı parasını ödemiş ama atını sessizce kaybetmiş olur.
**Fix:** `CREATE UNIQUE INDEX ... ON market_listings(horse_id) WHERE status = 'active';` (yeni migration) + `executePurchase`'ın kilitli transaction içinde `horses.owner_id = listing.seller_id` doğrulaması (uyuşmazsa yeni bir `ListingStaleOwnerError` / 409).
**Test requirement:** Aynı `horseId` için paralel iki `CreateMarketListingUseCase` çağrısı → yalnızca biri başarılı olmalı; manuel olarak iki aktif ilan seed edilip paralel satın alınırsa ikincisi reddedilmeli.

### D2 — High: Satın alma, ilanın satıcısının hâlâ gerçek sahip olduğunu doğrulamıyor
> ✅ **DÜZELTİLDİ (bu oturum)** — `PostgresMarketPurchaseRepository.executePurchase`
> artık at satırı kilitliyken `horses.owner_id === listing.sellerId` doğruluyor,
> uyuşmazsa yeni `ListingStaleOwnerError` (409 `LISTING_STALE_OWNER`) fırlatıyor.
> Test: `market.e2e-spec.ts` "ilanın satıcısı artık atın gerçek sahibi değilse...".

**Evidence:** `postgres-market-purchase.repository.ts:100-105`; `domain/market/market.ts:purchaseListing` hiçbir zaman `horse.ownerId` almıyor/kontrol etmiyor.
**Fix:** Kilitli transaction içinde `horse.owner_id === listing.sellerId` doğrulaması eklenmeli (D1'in düzeltmesiyle aynı satır).
**Test requirement:** `sellerId`'si atın gerçek `owner_id`'siyle uyuşmayan bir ilan üzerinde satın alma denemesi — hata fırlatmalı, transfer YAPILMAMALI.

### C1 — High: Ahır kapasitesi hiçbir yerde zorunlu kılınmıyor
> ✅ **DÜZELTİLDİ (bu oturum)** — `PostgresMarketPurchaseRepository.executePurchase`
> artık alıcının `players` satırı kilitliyken `getStableCapacity`/
> `assertCanAddHorseToStable` ile kapasiteyi kontrol ediyor, doluysa
> `StableCapacityExceededError` (409 `STABLE_CAPACITY_EXCEEDED`) fırlatıyor.
> Test: `market.e2e-spec.ts` "alıcının ahırı doluysa...". (Not: bu yalnızca
> At Pazarı satın alma yolunu kapatır — yetiştiricilik/FAZ 3 gibi at
> ÜRETEN diğer yollar henüz bu kontrolden geçmiyor, ayrı bir bulgu değil
> çünkü FAZ 3 kapsamı bu denetimin dışında.)

**Evidence:** `assertCanAddHorseToStable`/`canAddHorseToStable` (`domain/stable/stable.ts:19-42`) tüm `apps/api/src` içinde HİÇBİR YERDE çağrılmıyor. `PostgresMarketPurchaseRepository.executePurchase`, alıcının `stable_level`/mevcut at sayısına hiç bakmadan mülkiyeti devrediyor.
**Impact:** `GetStableSummaryUseCase` "5 kapasite, 47 at" gibi tutarsız bir durumu mutlu mutlu raporlayabilir — kapasite tamamen kozmetik.
**Fix:** `executePurchase` içinde, alıcının `players` satırı zaten kilitliyken, aynı transaction'da `SELECT COUNT(*) FROM horses WHERE owner_id = $1` kontrolü eklenmeli.
**Test requirement:** Kapasite dolu bir alıcının satın alması reddedilmeli (para/mülkiyet DEĞİŞMEMELİ); kapasite-1'deki bir alıcının iki paralel satın alması → yalnızca biri başarılı olmalı.

### H1 — High: `injured` durumundan çıkış yok
**Evidence:** `TrainHorseUseCase` (`train-horse.use-case.ts:108`) `status: 'injured'` yazıyor ama hiçbir kod yolu bunu geri `'active'`'e çevirmiyor — `PerformCareActionUseCase`'in `vet` eylemi bile `horse.status`'a hiç dokunmuyor.
**Impact:** Antrenmanda sakatlanan bir at, antrenman/yarış için KALICI OLARAK kullanılamaz hale geliyor — normal oynanışta hemen ortaya çıkacak bir fonksiyonel çıkmaz.
**Fix:** `vet` bakım eylemine (veya özel bir "tedavi et" eylemine) `injuryRisk`/`health` belirli bir eşiği geçtiğinde `status: 'active'`'e dönüş eklenmeli.
**Test requirement:** `injured` bir at + yeterli `vet` bakımı → `status` `'active'`'e dönmeli, antrenman/yarış tekrar başarılı olmalı.

### C2 — Medium: Antrenman/bakım/besleme kilitsiz read-modify-write
**Evidence:** `train-horse.use-case.ts`, `perform-care-action.use-case.ts`, `feed-horse.use-case.ts` — hepsi `findById` → JS'de hesapla → `update()`, `FOR UPDATE` YOK, transaction YOK.
**Impact:** İki eşzamanlı antrenman isteği aynı başlangıç değerinden hesaplama yapar, biri diğerinin sonucunu sessizce ezer ("lost update") — ayrıca bakım cooldown kontrolü de aynı TOCTOU açığına sahip.
**Fix:** `PlayerRepository.updateWithLock`'un aynısı `HorseRepository.updateWithLock` olarak eklenmeli, bu üç use-case ondan geçirilmeli.
**Test requirement:** Aynı `horseId` için paralel iki antrenman çağrısı → sonuç HER İKİSİNÜ de yansıtmalı (lost update olmamalı).

### H2 — Medium: Pazarda listelenmiş at yine de kullanılabiliyor
**Evidence:** Ne `CreateMarketListingUseCase` ne de train/care/race use-case'leri karşılıklı bir kontrol yapıyor.
**Fix:** Ya bilinçli kapsam dışı olarak belgelensin, ya da train/race use-case'lerine "aktif ilanı varsa reddet" kontrolü eklensin (mevcut `injured` koruması ile aynı desende).
**Test requirement:** (b) seçilirse: aktif ilanlı bir atta `TrainHorseUseCase.execute` reddedilmeli.

### Zaten sağlam (IMPLEMENTED)
- `players.money/gems` DB seviyesinde `CHECK (>= 0)`.
- `economy_transactions`'ta `CHECK (balance_after = balance_before + amount)` — ledger satırı iç tutarsızlıkla asla yazılamaz.
- Dual-layer idempotency (Redis hızlı yol + Postgres `idempotency_keys` PK rezervasyonu) — gerçek DB seviyesinde atomiklik.
- At Pazarı satın alma: listing+horse+iki player satırı TEK transaction'da `FOR UPDATE` ile kilitleniyor (D1/D2 bunun ÜZERİNE ek doğrulama gerektiriyor, mevcut kilit mekanizması doğru).
- 22/22 migration'ın up/down çifti eksiksiz, numaralandırma sıralı, kırılma yok.
- Breeding domain saf/tamamlanmış ama hiçbir use-case/controller'a bağlı değil — PLANNED, bozuk değil.

---

## 3. Yarış Motoru Determinism / Versioning / Replay

### R1 — Medium: Hava durumu config'i versiyonlanmıyor
**Evidence:** `config/weather.config.json`'da `version` alanı yok, `weather_config_version` sütunu yok — ama `getEnvironmentModifier` AKTİF olarak kullanılıyor ve `combinedConditionModifier`'ı doğrudan etkiliyor.
**Impact:** `race.config.json` için migration 0021'in kapattığı TAM AYNI risk (eski yarışların yeniden üretilememesi), hava durumu config'i için hâlâ AÇIK.
**Fix:** `WeatherConfig`'e `version` alanı + yeni `weather_config_version` sütunu (yeni migration) + aynı wiring deseni.
**Test requirement:** Mevcut `config_version` testine benzer, yeni sütunun doldurulduğunu doğrulayan test.

### R2 — Medium: Sadece oyuncunun segmenti kalıcı — tam alan replay'i yok
**Evidence:** `postgres-race.repository.ts:31-36`, `run-practice-race.use-case.ts:250-254` — yalnızca `playerSegments` yazılıyor, botlar için `race_entries`/`race_entry_segments` satırı YOK (bilinçli, kendi yorumunda belirtilmiş).
**Impact:** Tam alan replay'i yalnızca `simulationSeed` + versiyonlarla YENİDEN SİMÜLE ederek mümkün — DB'den doğrudan okunamaz. Ayrıca hiçbir `GET /races/:id` uç noktası yok; frontend statik bir demo fixture'ı oynatıyor, canlı veri değil.
**Fix:** Gerçek replay gerekiyorsa: tüm katılımcıların (botlar dahil) segment verisini kalıcı hale getir, `GET /races/:id/timeline` uç noktası ekle, repository port'una okuma metodu ekle.
**Test requirement:** Bir yarışı kaydet, tam alanı iki yoldan yeniden oluştur (DB okuma vs. yeniden simülasyon) → eşleşmeli.

### T3 — Low: 100+ yarış ölçekli denge/adalet testi yok
**Evidence:** `race-engine.spec.ts` en fazla 60 deneme, yalnızca 2 at senaryosu — gerçekçi 8-12 atlı alan/taktik baskınlığı testi yok.
**Fix:** 200+ denemeli, gerçekçi karma-taktik alan testi; stil/kulvar başına galibiyet oranını ölçüp baskınlık eşiğini aşmadığını doğrulayan yeni bir test dosyası.

### R3 — Low: Davranış hattının yarısı hâlâ nötr placeholder
**Evidence:** Track Fit, Draw/post-position, Carried Weight, Current Form, gerçek Jockey skill, Temperament — ya hiç yok ya da her zaman nötr 50 (`entrant-snapshot.ts`'in kendi `UNMODELED_SNAPSHOT_FIELDS` listesiyle DÜRÜSTÇE belgelenmiş).
**Not:** Bu YENİ bir gizli açık DEĞİL — proje kendi kodunda zaten işaretlemiş. Master Plan'ın Phase B/C kapsamına giren, kasıtlı olarak ileri bırakılmış derinleştirme çalışması.

### Zaten sağlam (IMPLEMENTED)
- Determinism: `Math.random()`/`Date.now()` YOK, tüm rastgelelik `createSeededRandom`'dan geçiyor — aynı seed+snapshot+config bit-bit aynı sonucu üretiyor (test edilmiş).
- `engine_version`/`ruleset_version`/`config_version` uçtan uca doğru bağlı (hem pratik yarış hem PvP).
- Foto-finiş: `finishTimeMs`/`finishPosition` tamamen `cumulativeTimeMs`'den türetiliyor, animasyon karesine YOK bağımlılık — deterministik berabere-bozma sırası (zaman → performans → horseId).
- Pace/Fatigue/Stamina/Overtaking/Sprint/Environment gerçek, çok faktörlü ve deterministik.

---

## 4. Ekonomi İstismarları / Idempotency / Test Kapsamı

### E1 — High: Cüzdan güncellemesi ile yarış kaydı iki ayrı transaction
**Evidence:** `run-practice-race.use-case.ts:150-200` (para) ayrı, `:254` (yarış kaydı) ayrı; `join-matchmaking-queue.use-case.ts` aynı desen.
**Impact:** İkinci adım başarısız olursa, para zaten hareket etmiş ama yarış kaydı yok — ve `IdempotencyInterceptor`'ın hata durumunda `pending` satırı SİLMESİ, aynı anahtarla tekrar denemenin işlemi baştan çalıştırmasına (ÇİFT ödeme/tahsilat) izin verir.
**Fix:** Cüzdan mutasyonu ile yarış/PvP kaydını TEK transaction'a birleştir; `idempotency_keys` için sıkışmış `pending` satırları temizleyen bir zaman aşımı/reconciliation işi ekle.
**Test requirement:** `savePracticeRace`'i para transaction'ı commit olduktan SONRA hata fırlatacak şekilde mock'la → düzeltmeden sonra bakiyenin de geri alındığını doğrula.

### E2 — Medium: Satın alma/iptal yarışı — satılmış ilan "iptal edildi" olarak üzerine yazılabilir
**Evidence:** `cancel-market-listing.use-case.ts:27-37` kilitsiz `findById` + koşulsuz `UPDATE`.
**Fix:** İptal de kilitli transaction'dan geçmeli, ya da `UPDATE ... WHERE status = 'active'` koşullu yazım + 0 satır etkilendiğinde `ListingNotActiveError`.
**Test requirement:** Aynı ilan üzerinde eşzamanlı satın alma + iptal → nihai durum hangisi kazandıysa onunla tutarlı olmalı (asla `horses.owner_id`ile çelişmemeli).

### E3 — Medium: Market satın almanın idempotency kapsamı yanlış (listingId, buyerId değil)
**Evidence:** `IdempotencyInterceptor`, `request.params.id` (yani `listingId`) kullanıyor — ama bir ilan birden fazla farklı alıcıyla etkileşebilir.
**Impact:** İki farklı alıcı aynı `Idempotency-Key` değerini kullanırsa, ikinci alıcı BİRİNCİ alıcının önbelleğe alınmış yanıtını (bakiyesi dahil) alabilir — çapraz hesap veri sızıntısı.
**Fix:** Market-buy idempotency kapsamını `(buyerId, key)`'e çevir.
**Test requirement:** Aynı listing'e aynı anahtarla iki FARKLI alıcı → ikincisi bağımsız işlenmeli, asla birincinin yanıtını almamalı.

### T1 — Medium: Hiçbir akış için 10/50/100 eşzamanlı istek testi yok
**Evidence:** Yalnızca `market.e2e-spec.ts`'de n=2 iki eşzamanlılık testi var (aynı anahtar, farklı alıcılar). Ahır yükseltme/günlük ödül/yarış girişi/iptal/breeding/antrenman/bakım için SIFIR eşzamanlılık testi.
**Fix:** Master Plan §42'nin istediği gibi en az market-buy (n=2'den genişlet), ahır yükseltme, günlük ödül, pratik yarış girişi için n=10/50/100 `Promise.all` yük testleri eklenmeli.

### DOC1 — Low: `docs/ECONOMY.md`'nin "gem shop whitelist kod seviyesinde zorunlu" iddiası abartılı
**Evidence:** `gemShopWhitelist` yalnızca config'te var, `apps/api/src` içinde SIFIR referans — hiçbir gem shop endpoint'i yok.
**Fix:** Doküman "planlanan, henüz uygulanmayan" olarak düzeltilmeli.

### Zaten sağlam (IMPLEMENTED)
- At Pazarı satın alma double-spend'e karşı GERÇEKTEN güvenli (kilit sırası + gerçek e2e testle doğrulanmış).
- Idempotency: Postgres UNIQUE rezervasyonu gerçek otorite, Redis yalnızca hızlandırma katmanı — tasarım doğru.
- Günlük ödül: Idempotency-Key olmasa bile satır kilidi sayesinde çift ödemeye karşı güvenli (bilinçli, belgelenmiş tasarım).
- `economy_transactions` DB seviyesinde iç-tutarlılık kontrolüyle destekli — gerçek defense-in-depth.

---

## 5. Frontend / 3D Performans / Mobil UX / Repo Hijyeni

### T2 — Medium: `apps/web`'de sıfır component/UI testi
**Evidence:** `package.json`'daki test script'i `--passWithNoTests` bayrağı taşıyor; sadece 4 saf-mantık test dosyası var (337 satır), hiçbir `.tsx` test edilmemiş. `@testing-library/react` kurulu ama hiç kullanılmıyor.
**Fix:** En azından `RaceHud.tsx` için (Three.js'siz, saf DOM) `@testing-library/react` ile duman testleri eklenmeli; `--passWithNoTests` kaldırılmalı.

### F1 — Medium: Mobil responsive tasarım neredeyse yok
**Evidence:** Tüm uygulamada TEK bir media query var (`globals.css:69-73`, yalnızca 768px+ için padding). `RaceHud.tsx` sabit piksel genişlikli paneller (200px + 160px yan yana) — 360px genişlikte taşacak. Oynat/duraklat düğmesi 32×32px, kamera düğmeleri 12px font — 44px dokunma hedefi kuralının altında.
**Fix:** En az 360-430px telefon + ~768px tablet breakpoint'leri eklenmeli; HUD panelleri dar ekranda alt alta dizilmeli/katlanmalı; düğme boyutları ≥44px'e çıkarılmalı.

### F2 — Low: WebSocket hiç yok (PLANNED)
**Evidence:** `apps/web`/`apps/api`'de hiçbir socket/gateway kodu yok — bu bir hata değil, henüz inşa edilmemiş.
**Not:** Canlı yarış özelliği inşa edilirken yeniden bağlanma/durum senkronizasyonu tasarımı baştan (retrofit değil) düşünülmeli — mevcut deterministik `RaceTimeline` bu açıdan doğal bir avantaj sağlıyor (istemci sunucudan seek ederek devam edebilir).

### G1 — Low: `docker-compose.yml`'de sabit-kodlanmış dev-only DB şifresi
**Evidence:** `POSTGRES_PASSWORD: at_sevdalisi`, yalnızca localhost'a bağlı.
**Impact:** Gerçek risk yok (yalnızca yerel geliştirme), ama gerçek bir ortamda yeniden kullanılırsa zayıf kimlik bilgisi olur.
**Fix:** Dosyaya "yalnızca yerel geliştirme, prod/staging'de asla yeniden kullanma" notu eklensin.

### 3D / Three.js — PARTIAL (ayrı bir "critical" bulgu değil, ama not edilmeli)
Gerçek bir Three.js sahnesi var (basit geometrik şekillerle, kendi README'sinde AÇIKÇA "iskelet" olarak belgelenmiş) ama LOD/instancing/texture-compression/mobil kalite ön ayarlarının HİÇBİRİ yok; 96 pist karosu ayrı ayrı çiziliyor (instance edilmemiş). `RaceScene3D.tsx` bu ortamda hiç derlenmemiş/test edilmemiş — doğrulama tamamen CI build'ine bırakılmış. Küçük ölçekte (5 at) sorun değil, alan/kare yoğunluğu büyüdükçe optimize edilmeli.

### Zaten sağlam (IMPLEMENTED)
- Hiçbir gerçek sır/kimlik bilgisi git geçmişinde YOK (tam geçmiş taraması temiz).
- `.env`/`.env.local` hiç commit edilmemiş, `.gitignore` doğru yapılandırılmış.
- Backend hata mesajları gerçek, anlamlı Türkçe metinler üretiyor (`InsufficientFundsError` vb.) — sadece bunları tüketen gerçek bir frontend ekranı henüz yok.
- `next/dynamic(..., {ssr:false})` ile 3D modülün tembel yüklenmesi doğru uygulanmış.
- Henüz commit edilmiş hiçbir ikili varlık (3D model/ses/font) yok — lisans riski YOK (henüz).

---

## Öncelik sırasına göre önerilen ilk remediation adımları

Master Plan §61 Phase A ("Security & Data Integrity") ile birebir uyumlu olarak:

1. **S1+S2+S3+S4 (auth + ownership)** — en kritik küme, ama gerçek bir kimlik doğrulama sistemi (Google/Apple Sign-In) gerektirir; bu proje sahibinin onayını bekleyen açık bir mimari karardır (`docs/ARCHITECTURE.md` §10.6). **Bu rapor bu kararı proje sahibine bırakıyor** — aşağıdaki diğer tüm maddeler auth'tan BAĞIMSIZ olarak hemen düzeltilebilir.
2. ✅ **D1+D2** — At Pazarı'nda tekil-aktif-ilan kısıtı + sahiplik doğrulaması. Küçük, izole, yeni özellik değil. **DÜZELTİLDİ (bu oturum)** — bkz. §2 D1/D2 durum notları.
3. ✅ **C1** — Ahır kapasitesi zorunluluğu. **DÜZELTİLDİ (bu oturum)** — bkz. §2 C1 durum notu.
4. **H1** — Sakatlıktan iyileşme yolu. *(sıradaki adım)*
5. **E2+E3** — İptal/satın alma yarışı + idempotency kapsam düzeltmesi.
6. **C2** — Antrenman/bakım/besleme için satır kilidi.
7. **R1** — Hava durumu config versiyonlaması.
8. **T1+T3+T2** — Eşzamanlılık ve UI test kapsamının genişletilmesi.

Madde 2-7 hiçbiri yeni bir özellik gerektirmiyor, mevcut mimariyi bozmuyor, ve Mutlak Kural #11/#12'ye (test zayıflatma yok, gereksiz rewrite yok) uygun şekilde küçük, izole değişikliklerle kapatılabilir — bu yüzden bu rapordan hemen sonra bunlarla devam edilecek.
