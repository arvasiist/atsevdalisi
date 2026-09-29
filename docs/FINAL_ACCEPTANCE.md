# AT SEVDALISI — FİNAL KABUL KRİTERLERİ

**Tarih:** 29.09.2026
**Bu belge nedir:** Brief §42'nin kapanış kapısı. **30 madde**, her biri
**çalışan bir zincire** ya da **koşan bir teste** dayanır. "Dosya var" ya da
"uç nokta var" **kabul değildir** — kanıt kolonunda **test dosyası** yazar.

> ⚠️ **Dürüstlük notu.** Brief'in 27 maddelik orijinal metni bu depoda
> **yoktur** (`docs/PROJECT_BRIEF.md` 72 bölümlük asıl brief'tir,
> `docs/IMPLEMENTATION_PLAN_MASTER_BRIEF.md` başka bir belgedir). Aşağıdaki
> maddeler, brief'in **8 fazından ve kesişen kurallarından** yeniden
> kurulmuştur. Uydurma madde yoktur; her madde bu depoda karşılığı olan bir
> kuraldır. Nerede kanıt zayıfsa **zayıf** diye yazılmıştır.
> 29.09.2026: 28. madde (blok/şikâyet zinciri), 29. madde (yetiştirme
> zinciri) ve 30. madde (jokey zinciri) sonradan eklendi — üçü de "sunucu
> var, istemci yok" durumundan çıkarıldı.

**Sonuç: 30/30 PASS** — 26 madde mevcut testlerle, 1 madde
(`apps/api/test/api/final.e2e-spec.ts`) yazılan uçtan uca testle, 3 madde
(28, 29 ve 30) istemci tüketicisi + istemci testiyle.

---

## A. Sunucu otoritesi ve determinizm (1–4)

### 1. İstemci hiçbir sonucu belirlemez
Yarış sonucu, para, istatistik, ödül ve envanter **yalnızca** sunucuda
belirlenir. Simülasyon tek bir yerde koşar: `domain/race/race-engine.ts`.
Saldırgan bir istemcinin "ben kazandım" demesi hiçbir uç noktada karşılık
bulmaz — kesinleştirme girdisi yalnızca `raceId`dir.
**Kanıt:** `test/api/race.e2e-spec.ts` · `test/api/race-settlement.e2e-spec.ts` · `test/security/phase16-hardening.spec.ts` — **PASS**

### 2. Determinizm: aynı seed + snapshot + config = aynı sonuç
**Kanıt:** `test/domain/race/race-engine.spec.ts` (determinizm koşumu) · `test/api/race-timeline.e2e-spec.ts` — **PASS**

### 3. Motorda `Math.random()` yok
Motor içindeki bütün rastgelelik `deriveRandom(seed, horseId, segmentIndex, purpose)`ten gelir. (Seed'in **kendisi** `randomUUID()` ile doğar — bkz. madde 4.)
**Kanıt:** `test/domain/race/race-engine.spec.ts` · `test/domain/race/bot-generator.spec.ts` — **PASS**

### 4. Seed kilit anında doğar, `raceId` seed DEĞİLDİR
`raceId`yi seed yapmak sonucu önceden hesaplanabilir kılardı.
**Kanıt:** `test/api/race-lifecycle.e2e-spec.ts` (kilit anında seed yazımı) — **PASS**

---

## B. Yarış yaşam döngüsü (5–8)

### 5. Zamanlayıcı gerçekten kilitler ve bildirimi aynı transaction'da yazar
`RaceLockScheduler` `startTime`ı geçmiş yarışları `locking`e alır; kadro, seed ve `horse_snapshot` **aynı anda** donar; `race_starting` bildirimi aynı transaction'da düşer.
**Kanıt:** `test/api/race-lifecycle.e2e-spec.ts` · `test/api/notification-producers.e2e-spec.ts` — **PASS**

### 6. `locking` — üç kapı aynı anda açık
`locking` durumu kesinleştirilebilir **ve** iptal edilebilir **ve** kilitlenebilir olmak zorundadır. Biri kapalı olsaydı **kalıcı para kilidi** doğardı (`checkRaceLeavable` startTime sonrası ayrılmayı kapattığı için).
**Kanıt:** `test/domain/race/race-lifecycle.spec.ts` · `test/api/race-lifecycle.e2e-spec.ts` — **PASS**

### 7. `finished → cancelled` YASAK
Koşmuş yarışta iade, kazanana ödenen `race_prize` değil oyuncunun ödediği giriş ücreti olurdu = **makul görünen yanlış tutar**.
**Kanıt:** `test/domain/admin/race-cancel.spec.ts` — **PASS**

### 8. Yeni bir `RaceStatus` üç yerde birden hizalanır
(1) `race-lifecycle.ts` tam `Record` (eksik anahtar **tsc hatası**), (2) migration CHECK'i **eski kısıt adıyla düşürülerek** güncellenir, (3) test migration dosyasını **okuyarak** karşılaştırır.
**Kanıt:** `test/domain/race/race-lifecycle.spec.ts` · `test/domain/admin/race-cancel.spec.ts` — **PASS**

---

## C. Gerçek oyuncu / AI ayrımı (9–12)

### 9. `fieldSize` 8/10/12/14/16 ve bot sayısı SAF fonksiyondan gelir
`domain/race/field-composition.ts` → `resolveFieldComposition`. `settle-race.use-case.ts` bot sayısını **kendi hesaplamaz**; `fieldSizes` koda gömülmez, `config/race-lobby.config.json`dan gelir.
**Kanıt:** `test/domain/race/field-composition.spec.ts` (tam matris, veritabanısız) · `test/api/race-field-composition.e2e-spec.ts` — **PASS**

### 10. Yanıt `participantType` taşır, `isBot` TAŞIMAZ
`'human' | 'ai'`. `isBot`u geri eklemek **ikinci bir doğruluk kaynağı** doğurur. (`isBot` adı zaman çizelgesi/roster sözleşmesinde ayrıca yaşar — o sözleşme değişmedi.)
**Kanıt:** `test/api/race-settlement.e2e-spec.ts` · `test/api/race-field-composition.e2e-spec.ts` — **PASS**

### 11. AI'ye gizli bonus verilmediği TESTLE ele verilir
Bot statları aynı seed ile **yeniden üretilip** (`generateBotEntrants(n, seed)`) yanıttaki sayılarla **birebir** karşılaştırılır. Motora giren girdi ile oyuncuya gösterilen sayı arasına bir çarpan girse test **kırılır**.
**Kanıt:** `test/domain/race/bot-generator.spec.ts` · `test/api/race-field-composition.e2e-spec.ts` — **PASS**

### 12. Ölü config yok: `aiFillEnabled` gerçekten okunur
28.09.2026'ya kadar bu değer **hiçbir kod tarafından okunmuyordu** ve `false` yapmak sahada tek bir botu bile eksiltmiyordu. Artık okunur **ve** onu düşüren bir test vardır.
**Kanıt:** `test/domain/race/field-composition.spec.ts` — **PASS**

---

## D. Ücretli yarış → motor → ödül → defter → cüzdan (13–18)

### 13. Kesinleştirme ucu koşar, öder ve idempotenttir
`POST /races/:id/settle` yarışı koşar, ödülleri `top5` paylarıyla dağıtır, `races.status = 'finished'` yazar. Zamanlayıcı **yoktur** — uç bir "crank"tir: kimliği doğrulanmış **herhangi** bir oyuncu çağırabilir. Tekrar koruması `scheduled → finished` geçişinin kendisidir; ikinci çağrı **409** `RACE_NOT_SETTLEABLE`.
**Kanıt:** `test/api/race-settlement.e2e-spec.ts` — **PASS**

### 14. İki havuz modeli yan yana ve doğru
**Pratik:** `computeRacePool(tier) = entryFee × fieldSize` (botlar ödemiş **sayılır**). **Lobi:** havuz = `entryFee × GERÇEK oyuncu sayısı` (botlar hiçbir şey ödemez).
**Kanıt:** `test/domain/race/prize.spec.ts` · `test/domain/race/prize-distribution.spec.ts` · `test/api/race-settlement.e2e-spec.ts` — **PASS**

### 15. Bot payı yanar; platform payının hesap satırı yoktur
Bota düşen ödül KİMSEYE ödenmez, havuzda kalır (bilinçli: aksi hâlde oyuncu kendi yarışını açıp havuzun çoğunu geri alırdı). `raceRake` ve bot artığı oyuncu ekonomisinden **çıkar**, başka bir hesaba **girmez**.
**Kanıt:** `test/api/economy-reconciliation.e2e-spec.ts` — **PASS**

### 16. Defter mutabakatı — iki ölçüm tuzağına düşmeden
(1) "Önce" bakiyesi **katılımdan önce** alınır. (2) `net = 0` yalnızca **iptal** sonrası doğrudur; terk edilmiş yarışta doğru iddia `net = −kalan ücret`.
**Kanıt:** `test/api/economy-reconciliation.e2e-spec.ts` — **PASS**

### 17. Para yolu: `FOR UPDATE` + aynı transaction'da defter
Durum kuralı (`mutate` geri çağrısının içinde) kilidin altında koşar; "iptal edilebilir mi" ile "iade et" arasında TOCTOU penceresi kalmaz.
**Kanıt:** `test/database/economy-ledger-immutability.spec.ts` · `test/api/economy-reconciliation.e2e-spec.ts` · `test/api/admin.e2e-spec.ts` — **PASS**

### 18. `Idempotency-Key` para yolunda başarısızlıkta ATILMAZ
Cüzdan ekranı anahtarı tutar (zarar: ikinci *para girişi*); tribün ekranı her basışta yeni anahtar üretir (zarar: ikinci *bilet*). Fark bilinçlidir.
**Kanıt:** `test/api/wallet-deposit.e2e-spec.ts` · `test/api/grandstand.e2e-spec.ts` — **PASS**

---

## E. İptal / kopma / iade güvenliği (19–22)

### 19. İptal bir para yoludur — üç kural bozulmaz
(1) İade tutarı **defterden** okunur (son `lobby_race_entry_fee` satırının `-amount`u), `races.entry_fee` sabitinden değil. (2) Katılım satırı **silinmez**, `cancelled` işaretlenir. (3) Denetim kaydı **aynı transaction'da** yazılır. Bot payı iade edilmez.
**Kanıt:** `test/domain/admin/race-cancel.spec.ts` · `test/api/admin.e2e-spec.ts` — **PASS**

### 20. Kopma veritabanına DOKUNMAZ
`RaceGateway.handleDisconnect` **hiçbir satır yazmaz** — yalnızca izleyici sayacını tazeler. Test **soketli** yazılır (gerçek `socket.io-client` bağlanıp `disconnect()` çağırır) ve bariyer olarak **ikinci bir tanık soketin** aldığı `race.spectators` yayını beklenir; satırlar `JSON.stringify` ile **bütün** olarak karşılaştırılır.
**Kanıt:** `test/api/race-disconnect.e2e-spec.ts` — **PASS**

### 21. Tribün bileti: kontenjan, çift alım engeli, defterden iade
Bilet fiyatı `races.tribune_fee`; kapasite config'ten; aynı oyuncu iki kez bilet alamaz; iade tutarı defterden gelir ve iki kez iade edilemez.
**Kanıt:** `test/api/grandstand.e2e-spec.ts` · `test/domain/grandstand/ticket.spec.ts` · `test/domain/grandstand/grandstand-config.spec.ts` — **PASS**

### 22. `status IS DISTINCT FROM 'cancelled'` — `<>` DEĞİL
`race_entries.status` NULL olabilir (pratik/PvP girişleri) ve `<>` NULL'lı satırları düşürür; sayım sessizce yanlış çıkardı.
**Kanıt:** `test/api/admin.e2e-spec.ts` (sayım uçları) · `test/api/economy-reconciliation.e2e-spec.ts` — **PASS**

---

## F. Motorun gerçek girdileri (23–25)

### 23. Taktik stili motora GERÇEKTEN etki eder
Aynı seed + aynı snapshot, farklı taktik → **farklı** sonuç; ve hiçbir stil ölü/baskın değil.
**Kanıt:** `test/domain/race/tactic-effect.spec.ts` · `test/domain/race/pace.spec.ts` — **PASS**

### 24. Jokey motora GERÇEKTEN etki eder; başlangıç statları DONDURULMUŞ snapshot'tan okunur
`pickStartingStats` → `race_entries.horse_snapshot` (migration 0042). Canlı `horse_stats` okunsaydı, sonucu **açıklayan** sayılar ile sonucu **üreten** sayılar ayrışırdı ve bu hiçbir yerde hata üretmezdi.
**Kanıt:** `test/domain/race/jockey-decisions.spec.ts` · `test/domain/race/entrant-snapshot.spec.ts` · `test/api/jockey.e2e-spec.ts` — **PASS**

### 25. Kişilik/mizaç motora GERÇEKTEN etki eder
**Kanıt:** `test/domain/race/temperament.spec.ts` · `test/domain/race/modifier-combination.spec.ts` — **PASS**

---

## G. Güvenlik, sosyal ve uçtan uca (26–30)

### 26. Sosyal yazma rotaları hız sınırlı — kapsam testle kilitli
`@RateLimit` **opt-in**'dir; işaretlenmeyen rota sınırsızdır. `SocialController` için **kapalı küme** iddiası vardır: yeni bir yazma rotası ekleyip `@RateLimit` koymazsan test **kırılır**. `RateLimitOptions.name` de sabitlenir (aynı `name` iki rota tek bütçeyi böler).
**Kanıt:** `test/security/phase16-hardening.spec.ts` · `test/api/rate-limit.e2e-spec.ts` — **PASS**

### 27. Uçtan uca akış tek otomatik testte
Kayıt → başlangıç atı → lobi → katıl/hazır ol → tribün bileti → kilit → kesinleştir →
ödül + bildirim → defter mutabakatı → tribün iadesi → iptal + iade → yetkisiz
erişim kapıları. Zincirin **her halkası** bu tek dosyada gerçek HTTP üzerinden
sınanır.
**Kanıt:** `test/api/final.e2e-spec.ts` — **PASS**

### 28. Blok / şikâyet zinciri uçtan uca çalışır (sunucu + istemci)
Dört uç (`POST/DELETE/GET /players/:id/blocks`, `POST /players/:id/reports`)
sunucuda çalışır **ve** istemcide tüketicisi vardır: `/profile/:username`
"Güvenlik" paneli (engelle / engeli kaldır / kategorili şikâyet) ve
`/friends` "Engellenenler" bölümü. **İstemcide iki tuzak sabitlenir:**
(1) "engelli mi" bilgisi profilden OKUNAMAZ (o uç `@Public()`tir ve engel
durumu orada yoktur — olsaydı "seni engelledi mi" sorusu herkese açık bir
uçtan cevaplanırdı); (2) şikâyet kategorisi istemcide **listelenmez**,
yalnızca etiketleri tutulur — kümenin tek kaynağı `domain/social/moderation.ts`.
**Kanıt:** `test/api/moderation.e2e-spec.ts` · `test/api/body-uuid-shape.e2e-spec.ts` ·
`apps/web/test/lib/api-client.spec.ts` — **PASS**

### 29. Yetiştirme zinciri uçtan uca çalışır (sunucu + istemci)
`POST /players/:id/breeding` kısrağı/aygırı kilitli satırlardan doğrular,
tayı + soy kaydını + statlarını yazar ve aygır başkasının ise damızlık
ücretini **aynı transaction'da** iki defter satırıyla
(`breeding_stud_fee_debit`/`_credit`) transfer eder. **İstemci tüketicisi
artık var:** `/stable` → `BreedingPanel` (kısrak + aygır + tay adı; sonuç
paneli tayı, `fee`yi, akrabalık uyarısını ve doğum sağlık riskini
**yanıttan** gösterir — istemci hiçbir tutar HESAPLAMAZ).
**İstemcide iki tuzak sabitlenir:** (1) `Idempotency-Key` **başarısızlıkta
yaşar** (`/wallet` deseni) — burada zarar "ikinci bir tay"dır, `/grandstand`ın
"her basışta yeni anahtar" kararından bilerek ayrılır; (2) aygır/kısrak/tay
adı **değişince bekleyen anahtar bırakılır**, yoksa sunucu ilk isteğin
saklanan yanıtını döner ve oyuncu yeni bir çiftleştirme yaptığını sanırken
**hiçbir şey olmaz**.
**Kanıt:** `test/api/breeding.e2e-spec.ts` · `test/domain/genetics/` ·
`apps/web/test/lib/api-client.spec.ts` ·
`apps/web/test/features/breeding/BreedingPanel.spec.tsx` — **PASS**

### 30. Jokey zinciri uçtan uca çalışır (sunucu + istemci)
Dört uç: vitrin (`GET /jockeys`), oyuncunun jokeyi
(`GET /players/:id/jockey`), kiralama (`POST /jockeys/:jockeyId/hire`,
**PARA YOLU**) ve **serbest bırakma** (`POST /jockeys/:jockeyId/release`).
Kiralanan jokey `race_entries.jockey_id`ye yazılır ve
`jockeySkillComposite` olarak motora girer (madde 24).
**İstemci tüketicisi artık var:** `/stable` → `JockeyPanel` (vitrin +
"Jokeyin" kartı + iki düğme).

**İstemcide üç tuzak sabitlenir:**
1. **Serbest bırakma PARA YOLU DEĞİLDİR** — iade yoktur, defter satırı
   yazılmaz ve ekran bunu **açıkça** söyler; test iade **vaat eden** bir
   metni düşürür. `kirala → bırak` bedava olsaydı `jockey_hire` gelir olmaktan
   çıkardı. Bırakmadan sonra bakiye **tazelenmez** (para kıpırdamadı);
   kiralamadan sonra **tazelenir** (para gerçekten düştü) — iki iddia
   birbirinin tersidir ve ikisi de testtedir.
2. **Vitrin `composite` HESAPLAMAZ** — sunucuda hesaplanmış puan yalnızca
   oyuncunun KENDİ jokeyi için gelir; altı beceriyi istemcide ağırlıklandırmak
   formülün ikinci bir kopyasını doğurur ve config değişince gösterilen sayı
   motordan **sessizce** ayrışırdı.
3. **`JOCKEY_NOT_OWNED` yön sızdırmaz** — "sahipsiz" ile "başkasının" TEK kod
   ve TEK mesajla döner; ayrılsaydı kimlik deneyen biri "bu jokey birinin mi"
   sorusunu yoklayabilirdi (`PLAYER_BLOCKED` ile aynı gerekçe).

Ayrıca bırakma satırı **SİLMEZ**: `owner_id` `NULL`a çekilir, çünkü geçmiş
yarışların `race_entries.jockey_id`si o satıra işaret eder.
**Kanıt:** `test/api/jockey.e2e-spec.ts` · `apps/web/test/lib/api-client.spec.ts` ·
`apps/web/test/features/jockey/JockeyPanel.spec.tsx` — **PASS**

---

## Kapanış

| Grup | Madde | Sonuç |
|---|---:|---|
| A. Sunucu otoritesi + determinizm | 1–4 | ✅ 4/4 |
| B. Yaşam döngüsü | 5–8 | ✅ 4/4 |
| C. Oyuncu/AI ayrımı | 9–12 | ✅ 4/4 |
| D. Para zinciri | 13–18 | ✅ 6/6 |
| E. İptal/kopma/iade | 19–22 | ✅ 4/4 |
| F. Motor girdileri | 23–25 | ✅ 3/3 |
| G. Güvenlik + uçtan uca | 26–30 | ✅ 5/5 |
| **TOPLAM** | **30** | **✅ 30/30 PASS** |

**Kabul edilmeyen madde yoktur.** Ancak üretime hazır **olmayan** özellikler
**vardır** — onlar kabul kriteri değil, **eksik iş**tir ve
`docs/FINAL_PROJECT_AUDIT.md` §5'te öncelik sırasıyla listelenmiştir
(ayrılma düğmesi, tribün iade penceresi, matchmaking
zamanlayıcısı, kulüp/sezon/turnuva …).

**Kural hatırlatması:** *"Asla 'çalışıyor' deme — kanıt CI'dır."* Bu belgedeki
her PASS bir **test dosyasına** dayanır; testlerin gerçekten koştuğunun kanıtı
GitHub Actions koşumudur.
