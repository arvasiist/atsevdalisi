# ECONOMY_AUDIT.md — Ekonomi Sistemi Denetimi

> **Kaynak:** proje sahibinin 32 bölümlük "ATSEVDALISI — CHIP ECONOMY /
> ECONOMY SYSTEM MASTER BRIEF"i. Bu dosya o briefin istediği 15 başlıklı
> denetim raporudur; brief "İLK AŞAMADA HİÇBİR DOSYAYI DEĞİŞTİRME. Önce
> audit raporunu tamamla" dediği için bulgular **önce** yazıldı, düzeltmeler
> ayrı dilimlerde yapılır.
>
> **Doğrulama işaretleri:**
> - **✔** — bu oturumda dosya doğrudan okunarak doğrulandı.
> - **○** — denetim taraması bulgusu; `dosya:satır` verilmiştir, düzeltmeden
>   ÖNCE yeniden doğrulanmalıdır.
>
> **Kapsam dışı:** 3D/ses varlıkları, yarış motoru içi fizik. Brief §2 "RACE
> ENGINE'E DOKUNMA" gereği `domain/race/race-engine.ts` denetim kapsamı
> dışıdır (yalnızca determinizmin bozulmadığı doğrulandı).

---

## 0. Özet

| Önem | Adet | Konu |
|---|---|---|
| **CRITICAL** | 3 | Elmas harcama yolu tamamen kırık · pratik yarış sınırsız para musluğu · ekipman bedava + `quality` istemciden |
| **HIGH** | 7 | Bakiye↔defter mutabakatı yok · kayıt başlangıç bakiyesi deftere yazılmıyor · idempotency anahtarı zorunlu/tekil değil · bakım/antrenman maliyetleri bağlı değil · kilit sırası ters (deadlock) · günlük ödül arayüzden erişilemez · gerçek yarış ödülü use-case'i yok |
| **MEDIUM** | 8 | `type` serbest metin · defter INSERT'i 3 yerde kopya · `assertValidAmount` güvenli tam sayı değil · 4 para ucunda `@RateLimit` yok · 3 domain hatası 500'e düşüyor · çiftlik çarpanları uygulanmıyor · XP hiç verilmiyor (seviye 1'de sabit) · yem satın alma arayüzü yok |
| **LOW** | 3 | `gemShopWhitelist` ölü veri · `canAfford` üretimde kullanılmıyor · `apps/api/test/application/` klasörü yok |

**Bir CRITICAL bu oturumda düzeltildi:** E1 (bkz. aşağıda) — migration 0031
ile `economy_transactions.reference_id` UUID → TEXT.

**İkinci CRITICAL kapatıldı (27.09.2026):** E7 (pratik yarış sınırsız Çip
musluğu) — ödül artık giriş ücretlerinden oluşan bir **havuzdan** dağıtılır
(`Σ payoutShares = 1 − raceRake`, `raceRake = %10`) ve yarışa girmek
**hazır olma kapısına** bağlıdır. Musluk `@RateLimit` ile değil, para
akışının YAPISIYLA kapatıldı; E30 (EV testi) de aynı dilimde yazıldı.
Ayrıntı: §5 E7/E30 notları ve `docs/ECONOMY.md` §4.1.1.

---

## 1. Mevcut economy sistemi

**Durum:** Var ve çalışıyor, ama **parçalı**. Para iki yerde yaşar: `players`
satırındaki `money`/`gems` kolonları (authoritative bakiye) ve
`economy_transactions` defteri (audit izi). Bakiye değiştiren yolların hepsi
`SELECT ... FOR UPDATE` kullanır ✔ (`infrastructure/feed/…:79,127,167`,
`infrastructure/race/…:110`, `infrastructure/market/…:81,118,162,174`).

**Uygulanmış para yolları (10):** günlük ödül · pratik yarış (giriş+ödül) ·
ahır yükseltmesi · tesis yükseltmesi · pazar ilanı oluşturma/iptal ·
pazar alımı (alıcı+satıcı, çift kayıt) · yem satın alma · kayıt başlangıç
bakiyesi.

**Uygulanmamış (brief'te var):** gerçek yarış ödülü · görev · başarı ·
turnuva/sezon · liderlik tablosu ödülü · etkinlik ekonomisi · jokey/personel
maaşı · yetiştiricilik ücreti · bakım/antrenman/ekipman gideri · elmas
kazandıran yollar (ödüllü reklam, satın alma).

---

## 2. Currency modeli

**Bulgu E2 — [MEDIUM] — `'money' | 'gems'` birleşimi 15+ yerde elle yazılıydı**
*(bu oturumda DÜZELTİLDİ)*

- **Dosya:** `packages/shared-types/src/currency.ts` (YENİ),
  `apps/api/src/domain/economy/wallet.ts`, `apps/web/src/lib/currency.ts` (YENİ)
- **Mevcut durum:** Tek doğruluk kaynağı oluşturuldu: `CURRENCIES` +
  `Currency` + `CurrencyAmount`. `apps/api` domain'i ve `apps/web` buradan
  türetir. Oyuncuya görünen adlar **Çip** (`money`) ve **Elmas** (`gems`).
- **Problem (önceki hâli):** aynı birleşim `shared-types`'ta 4 dosyada 7 kez,
  `apps/api`'de 7+ dosyada, `apps/web`'de 4 kez tekrarlanıyordu.
- **Risk:** brief §14'ün öngördüğü üçüncü birim (TICKET / EVENT_POINT)
  eklenirken birinin güncellenmemesi sessiz tutarsızlık üretir; brief §29
  "duplicate economy implementation oluşturma" der.
- **Önerilen çözüm (uygulandı):** tip tek kaynağa taşındı; şema ile kod
  arasındaki kayma `apps/api/test/database/economy-currency.spec.ts` ile
  denetlenir.
- **Depolama kimliği `money` bilinçli olarak DEĞİŞTİRİLMEDİ** — brief §1
  "yeni currency oluşturmak yerine mevcut sistem uygunsa onu genişlet".

---

## 3. Wallet / balance modeli

**Bulgu E3 — [MEDIUM] — `assertValidAmount` güvenli tam sayı sınırını denetlemiyor** ✔

- **Dosya:** `apps/api/src/domain/economy/wallet.ts` (`assertValidAmount`)
- **Mevcut durum:** `Number.isFinite` + `Number.isInteger` + `> 0` kontrol
  edilir; `Number.isSafeInteger` **yok**.
- **Problem:** `2^53` üzeri bir tutar `Number.isInteger`'dan geçer ama
  aritmetikte hassasiyet kaybeder (`balance + amount` sessizce yanlış olur).
- **Risk:** Düşük-orta: böyle bir tutarın istemciden gelmesi için bir ucun
  tutarı doğrudan alması gerekir; bugün tutarlar sunucuda hesaplanıyor.
  Yine de DB tarafı `BIGINT`'tir — JS tarafındaki tavan DB'nin altındadır.
- **Önerilen çözüm:** `Number.isSafeInteger` ile değiştir; `BIGINT` üst
  sınırına karşı ayrı bir `MAX_AMOUNT` sabiti (config'ten) ekle.

**Bulgu E4 — [LOW] — `canAfford` üretimde kullanılmıyor** ○

- **Dosya:** `apps/api/src/domain/economy/wallet.ts`
- **Problem:** Yalnızca test edilir; gerçek yollar `debit` içindeki kontrolü
  kullanır.
- **Risk:** Yok (ölü kod). **Önerilen çözüm:** ya kaldır ya da `debit`'in
  içinden çağır.

**Bulgu E5 — [HIGH] — Bakiye ile defter arasında mutabakat kodu yok** ○

- **Dosya:** yok — hiçbir yerde.
- **Mevcut durum:** `economy_transactions` yazılıyor ama **hiçbir sorgu**
  `players.money` ile `SUM(amount)` karşılaştırmıyor.
- **Problem:** Defter yazımı ile bakiye güncellemesi aynı transaction'da
  olduğu için bugün tutarlı; ama bunu **doğrulayan** bir şey yok. Bir gün
  defter satırı yazılmadan bakiye değiştiren bir yol eklenirse (kolayca
  olur — bkz. E6) fark sessizce birikir.
- **Risk:** Denetim izinin (brief'in asıl istediği şey) güvenilirliği
  kanıtlanamaz hâle gelir.
- **Önerilen çözüm:** bir `npm run economy:reconcile` script'i + CI'da
  çalışan bir test: her oyuncu için
  `players.money == SUM(amount WHERE currency='money')` (başlangıç bakiyesi
  de deftere yazıldıktan SONRA — bkz. E6).

---

## 4. Reward sistemi

**Bulgu E6 — [HIGH] — Kayıt başlangıç bakiyesi deftere yazılmıyor** ○

- **Dosya:** `apps/api/src/infrastructure/player/postgres-player.repository.ts:30-50`
- **Mevcut durum:** Yeni oyuncu `config/economy.config.json` →
  `newPlayerStartingBalance` (5.000 Çip / 50 Elmas) ile oluşturuluyor, ama
  `economy_transactions`'a satır yazılmıyor.
- **Problem:** Defter "hiç yoktan var olan" 5.000 Çip'i açıklamıyor.
- **Risk:** E5'teki mutabakat testi bu yüzden bugün de kırmızı olurdu;
  ayrıca bir oyuncunun bakiyesi defterle hiçbir zaman eşleşmez.
- **Önerilen çözüm:** kayıt transaction'ında `type: 'registration_bonus'`
  defter satırı yaz.

**Bulgu E7 — [CRITICAL] — Pratik yarış sınırsız Çip musluğu** ✔

- **Dosya:** `apps/api/src/domain/race/prize.ts:22-48` (ücret/ödül),
  `apps/api/src/application/use-cases/run-practice-race.use-case.ts` (uygulama),
  `config/economy.config.json` (`baseEntryFee: 50`,
  `prizeByFinishPosition: [200,120,80,50,30,0]`)
- **Mevcut durum:** Giriş ücreti 50; ödül tablosu toplamı 480; **botlar
  ödeme yapmaz** (`prize.ts:33-37` bunu açıkça yazar). Beklenen değer
  6 sıralama için `(150+70+30+0−20−50)/6 = +30` Çip/yarış.
  `POST /horses/:id/practice-race` üzerinde `@RateLimit` **yok**, bekleme
  süresi **yok**, enerji maliyeti **yok**.
- **Problem:** Sunucu, her çağrıda oyuncuya ortalama 30 Çip **basar**.
  Her istek yeni bir `Idempotency-Key` taşıdığı için idempotency koruması
  da devreye girmez.
- **Risk:** Saniyede birkaç istekle dakikada ~18.000 Çip üretilebilir →
  pazar, ahır yükseltmesi ve tüm Çip sink'leri anlamsızlaşır; ekonomi
  tamamen çöker. Bu, brief'in "duplicate reward riski" maddesinin en somut
  örneğidir.
- **Önerilen çözüm (öncelik sırası):** (1) uca `@RateLimit` + yarış başına
  bekleme süresi; (2) ödül havuzunu **giriş ücretlerinden** finanse et
  (botlar da ödesin) — `prize.ts:33-37`'deki notun öngördüğü tasarım;
  (3) enerji/yorgunluk maliyeti bağla. **Bu bir oyun dengesi kararıdır,
  proje sahibinin onayı gerekir.**

> **✅ KAPATILDI (27.09.2026) — öneri (2) + (3) uygulandı, (1) GEREKMEDİ.**
> Proje sahibinin kararı: *"1 evet ödesin yarışlar ücretli olsun verilen
> ücret kadarıyla giriş yapan kişiler çarpan olsun ve bir yarışta 8 / 10 /
> 12 / 14 / 16 at koşabilsin hazır olan kişiler yarışabilsinler"* +
> *"Kesinti olsun (~%10)"*.
>
> - Ödül artık **havuzdan** dağıtılır: `havuz = entryFee × fieldSize`
>   (botlar da ödemiş sayılır). Sabit `practiceRace.prizeByFinishPosition`
>   tablosu ve `raceEntryFeeMultiplier` **SİLİNDİ**.
> - `Σ payoutShares = 1 − raceRake` (`raceRake = 0.1`) olduğundan
>   `Σ ödül < havuz` **yapısal** bir değişmezdir — hangi kademe/alan
>   büyüklüğü seçilirse seçilsin yarış Çip BASAMAZ. Musluk oranla değil
>   YAPIYLA kapatıldı: **`@RateLimit` veya bekleme süresi EKLENMEDİ**
>   (öneri 1 gereksiz kaldı, çünkü tekrarlanan bir yarış artık para
>   üretmiyor).
> - Öneri (3) uygulandı: `domain/race/readiness.ts` — sağlık ≥ 50,
>   yorgunluk ≤ 70, enerji ≥ 30 (antrenmanın 15/90'ından BİLİNÇLİ olarak
>   daha sıkı). Ret `409` döner, HİÇBİR para hareketi olmaz.
> - Değişmezler testle korunur (config elle düzenlenebilir bir JSON ve
>   `game-config` loader'ı saf bir cast olduğu için başka koruma yok):
>   `apps/api/test/domain/race/prize.spec.ts`,
>   `apps/api/test/domain/race/readiness.spec.ts`, uçtan uca
>   `apps/api/test/api/race.e2e-spec.ts`.

**Bulgu E8 — [HIGH] — Gerçek yarış ödülü use-case'i yok** ○

- **Dosya:** `apps/api/src/application/use-cases/` — `claim-race-reward.use-case.ts` **yoktur** ✔ (klasör listelendi).
- **Problem:** `docs/ECONOMY.md` §2 "Yarış ödülü → `ClaimRaceRewardUseCase`"
  der; böyle bir dosya yok. Bugün tek ödül yolu pratik yarıştır.
- **Risk:** Belge ile kod arasında fark; çok oyunculu yarışta ödül ödenmez.
- **Önerilen çözüm:** brief PHASE 4 kapsamında yaz.

---

## 5. Race reward

Bkz. E7 (pratik yarış) ve E8 (gerçek yarış). Ek olarak:

**Bulgu E9 — [MEDIUM] — `raceEntryFeeMultiplier` yalnızca pratik yarışta okunuyor** ✔

- **Dosya:** `apps/api/src/domain/race/prize.ts:22-24`
- **Problem:** Çarpan gerçek yarışlarda uygulanmıyor (gerçek yarış giriş
  ücreti diye bir yol zaten yok).
- **Risk:** Düşük (bugün ikinci yol olmadığı için). **Önerilen çözüm:**
  gerçek yarış giriş ücreti yazılırken aynı fonksiyon kullanılsın.

> **✅ KAPATILDI (27.09.2026) — bulgu MOOT oldu: `raceEntryFeeMultiplier`
> tamamen SİLİNDİ.** Giriş ücreti artık kademeden doğrudan gelir
> (`raceTiers[].entryFee`), ayrı bir çarpan katmanı yoktur. Oyuncunun
> gördüğü çarpan ise `payoutShares[i] × fieldSize` olarak TÜRETİLİR —
> saklanan ikinci bir tablo olmadığı için "gerçek yarışta uygulanmadı"
> diye bir tutarsızlık sınıfı artık var olamaz.

---

## 6. Market / store

**Bulgu E10 — [HIGH] — Kilit sırası ters: pazar alımı ↔ besleme deadlock'u** ○

- **Dosya:** `apps/api/src/infrastructure/market/postgres-market-purchase.repository.ts:55-59,81,118,162,174`
  (sıra: `market_listings` → `horses` → `players`) **vs.**
  `apps/api/src/infrastructure/feed/postgres-feed-inventory.repository.ts:79,127,167`
  (sıra: `players` → `horses`)
- **Mevcut durum:** İki yol AYNI iki tabloyu **TERS sırada** kilitliyor.
  Pazar dosyası kendi sırasını "deadlock'tan kaçınmak için" diye
  gerekçelendiriyor ama besleme yolu bu sıraya uymuyor.
- **Problem:** Bir oyuncu hem `H` atını satışa koyup hem `H`'i beslediğinde
  iki transaction birbirini bekleyip kilitlenebilir (Postgres `40P01`).
- **Risk:** Kullanıcıya 500 döner; `40P01` `http-exception.filter.ts`'te
  eşlenmemiştir. Nadir ama tekrarlanabilir; yük altında artar.
- **Önerilen çözüm:** tek bir kilit sırası sözleşmesi belirle (öneri:
  **her zaman `players` → `horses`**) ve iki repository'yi ona uydur; her
  iki yolu birlikte çalıştıran bir e2e testi ekle.

**Bulgu E11 — [LOW] — `gemShopWhitelist` ölü veri** ✔

- **Dosya:** `config/economy.config.json` (veri),
  `docs/ECONOMY.md` §4.3 (kural)
- **Problem:** `apps/api/src` içinde bu listeyi okuyan kod **yok**;
  gem shop endpoint'i hiç yazılmamış.
- **Risk:** Kural "kodda zorunlu" sanılabilir. **Önerilen çözüm:** gem shop
  use-case'i yazılırken kontrolü GERÇEKTEN ekle; o güne kadar `docs/ECONOMY.md`
  §4.3'teki "durum düzeltmesi" notu kalsın.

---

## 7. Career reward

**Bulgu E12 — [MEDIUM] — Kariyer ödülü kavramı kodda yok** ○

- **Dosya:** `apps/web/src/features/career/` (yalnızca `career-tier.ts`
  var — seviye/kademe hesabı), `apps/api`'de karşılığı yok.
- **Problem:** Brief §2 "career ödülü" bir Çip kaynağı olarak sayar;
  uygulanmamış.
- **Risk:** Yok (eksik özellik). **Önerilen çözüm:** brief PHASE 8.

**Bulgu E13 — [MEDIUM] — XP hiç verilmiyor, seviye kalıcı olarak 1** ○

- **Dosya:** `players.xp` / `players.level` (migration 0001:10-11),
  `domain/progression/progression.ts`
- **Mevcut durum:** Progression domain'i ve testleri var (8 test ✔) ama
  hiçbir use-case XP eklemiyor.
- **Problem:** `level` `DEFAULT 1` olarak kalır; seviyeye bağlı hiçbir
  ekonomi/kilit mekaniği çalışmaz.
- **Risk:** Orta — brief'in "career reward" ve "progression" maddeleri
  bu yüzden hiçbir zaman tetiklenmez.
- **Önerilen çözüm:** yarış sonucu ve bakım eylemlerinden XP veren bir yol
  bağla; defter tarafında XP bir **para birimi değildir** (brief §14: XP
  ilerleme eksenidir, ayrı tutulur).

---

## 8. Leaderboard reward

**Bulgu E14 — [MEDIUM] — Liderlik tablosu ödülü yok** ○

- **Dosya:** `apps/api/src/application/use-cases/get-leaderboard.use-case.ts`
  (yalnızca OKUR), `domain/ranking/leaderboard.ts`
- **Problem:** Tablo hesaplanıyor, ödül ödenmiyor; haftalık/sezonluk dağıtım
  yapan bir iş (cron/worker) yok.
- **Risk:** Yok (eksik özellik). **Önerilen çözüm:** brief PHASE 9 + cron
  altyapısı (bugün `matchmaking` de senkron olduğu için ortak bir iş
  kuyruğu kararı gerekir).

---

## 9. Event sistemi

**Bulgu E15 — [MEDIUM] — Etkinlik ekonomisi tamamen yok** ○

- **Dosya:** yok.
- **Problem:** Brief §13 "event currency (CHIP / EVENT_POINT / TICKET) ana
  çiple karıştırılmamalı" der; ne etkinlik ne etkinlik para birimi var.
- **Risk:** Yok (eksik özellik). **Önerilen çözüm:** brief PHASE 10 —
  ve o zaman `CURRENCIES`'e eklenecek her birim için
  `economy-currency.spec.ts` + `CURRENCY_LABELS` **derleme hatası** vereceği
  için hiçbir yer unutulmaz (bkz. E2).

---

## 10. Eksik economy parçaları

**Bulgu E16 — [HIGH] — Bakım/antrenman/ekipman maliyetleri bağlı değil** ○

- **Dosya:** `config/care.config.json` (maliyet verisi),
  `apps/api/src/domain/care/care.ts` (`getCareActionCost` — **çağıranı yok**),
  `apps/api/src/application/use-cases/train-horse.use-case.ts` (maliyet kavramı yok),
  `apps/api/src/application/use-cases/create-horse-equipment.use-case.ts`
- **Problem:** Brief §3'ün saydığı sink'lerin çoğu bugün **bedava**.
- **Risk:** Çip'in harcanacak yeri azaldıkça E7'deki musluğun etkisi büyür.
- **Önerilen çözüm:** maliyetleri bağla. **Oyun dengesi kararı olduğu için
  proje sahibinin onayı gerekir** — bu dilimde bilinçli olarak yapılmadı.

**Bulgu E17 — [MEDIUM] — Çiftlik/personel çarpanları hiç uygulanmıyor** ○

- **Dosya:** `domain/farm/farm.ts` (çarpanlar hesaplanıyor),
  `domain/staff/staff.ts`
- **Problem:** Tesis seviyesi ve personel, yarış/antrenman sonucunu
  etkilemiyor.
- **Risk:** Oyuncu yükseltme için Çip harcar ama karşılığını **almaz** —
  bu, oyuncu güveni açısından E7'den sonra en ciddi denge sorunudur.
- **Önerilen çözüm:** `buildHorseEntrantSnapshot` zincirine bağla
  (`domain/race/entrant-snapshot.ts` — determinizm korunarak).

**Bulgu E18 — [MEDIUM] — Yem satın alma arayüzden erişilemez** ✔

- **Dosya:** `apps/web/src/lib/api-client.ts` (`buyFeed`, `getFeedInventory`
  tanımlı), `apps/web/src/app/care/page.tsx` (yalnızca **besler**, satın
  almaz)
- **Problem:** Elmas harcamanın **tek yolu** olan satın alma hiçbir
  sayfadan çağrılmıyor.
- **Risk:** Elmas pratikte harcanamaz. **Önerilen çözüm:** `/care`
  ekranına stok + fiyat (`FeedItemView.price`) + satın alma düğmesi ekle
  (brief PHASE 11).

---

## 11. Security açıkları

**Bulgu E19 — [CRITICAL] — Elmas harcama yolu tamamen kırıktı** ✔ *(DÜZELTİLDİ)*

- **Dosya:** `apps/api/src/application/use-cases/buy-feed.use-case.ts:97`
  (`referenceId: feedType`) vs.
  `database/migrations/0019_add_economy_ledger.up.sql:36` (`reference_id UUID`)
- **Mevcut durum:** `feedType` bir slug'dır (`'arpa'`), UUID değildir.
  Postgres `22P02` fırlatır → **tüm transaction geri alınır** →
  `POST /players/:id/feed-inventory/:type/buy` her çağrıda 500.
- **Problem:** Premium para biriminin tek harcama yolu çalışmıyordu.
- **Risk:** (düzeltilmeden önce) Elmas tamamen işlevsiz; ayrıca hata
  mesajı sızdırmadığı için "neden olmuyor" görünmez.
- **Önerilen çözüm (uygulandı):** migration **0031** — `reference_id`
  `UUID` → `TEXT`. Kolon zaten polimorfik bir referanstır (yarış/pazar
  UUID, yem kalemi slug). Koruma: `economy-currency.spec.ts` nihai tipin
  `TEXT` olduğunu denetler.

**Bulgu E20 — [CRITICAL] — Ekipman bedava ve `quality` istemciden geliyor** ✔

- **Dosya:** `apps/api/src/application/use-cases/create-horse-equipment.use-case.ts:29-44`
- **Mevcut durum:** `quality: input.quality` doğrudan istek gövdesinden
  alınır; hiçbir ücret alınmaz. `quality` `buildHorseEntrantSnapshot`
  üzerinden yarış performansına girer (ekipman performansı domain'i ✔
  `test/domain/equipment/performance.spec.ts`).
- **Problem:** **Sunucu otoritesi ihlali** — oyuncu `quality: 100` gönderip
  bedava, maksimum kalitede ekipman üretir.
- **Risk:** Yarış sonucu doğrudan manipüle edilebilir (brief §1'in en temel
  kuralı). Ayrıca Çip sink'i hiç oluşmaz.
- **Önerilen çözüm:** (1) `quality`'yi sunucuda hesapla (örn. atın
  istatistikleri + fiyat kademesi) veya en azından ücretle ilişkilendir;
  (2) oluşturmayı ücretli yap (E16); (3) `equipment.controller.ts`'e
  `Idempotency-Key` + `@RateLimit` ekle.

**Bulgu E21 — [MEDIUM] — 4 para ucunda `@RateLimit` yok** ○

- **Dosya:** `apps/api/src/api/**/*.controller.ts` — dekoratörün kendi doc
  yorumu "tüm para uçlarında var" der; 4 uçta yok.
- **Risk:** E7'deki musluk bu yüzden sınırsız. **Önerilen çözüm:** eksik
  uçları belirle, ekle, "hepsinde var" iddiasını bir testle bağla.

**Bulgu E22 — [MEDIUM] — 3 domain hatası HTTP'ye eşlenmiyor** ○

- **Dosya:** `apps/api/src/api/middleware/http-exception.filter.ts`
- **Problem:** `InsufficientFundsError`, `InvalidAmountError` ve
  `DailyRewardAlreadyClaimedError` eşlenmemiş → 500 döner (doğrusu 409/400).
- **Risk:** İstemci "yetersiz bakiye" ile "sunucu çöktü"yü ayırt edemez;
  `prize.ts`'teki eski `InvalidAmountError` 500'ü tam olarak bu yüzden
  canlıya çıkmıştı (bkz. `prize.ts:57-75`).
- **Önerilen çözüm:** üçünü `ErrorCode`'lara eşle + her biri için bir
  birim testi.

**Bulgu E23 — [HIGH] — `economy_transactions.idempotency_key` zorunlu ve tekil değil** ✔

- **Dosya:** `database/migrations/0019_add_economy_ledger.up.sql:47`
  (`idempotency_key TEXT`, nullable, `UNIQUE` YOK)
- **Mevcut durum:** Kolon boş bırakılabilir ve aynı anahtar birden çok kez
  yazılabilir. ○ 6 para yolundan 5'i `null` yazar.
- **Problem:** Defter, "bu hareket zaten yapıldı mı" sorusunu **veritabanı
  seviyesinde** cevaplayamaz; idempotency yalnızca Redis/rezervasyon
  katmanında yaşar.
- **Risk:** Redis kaybı/temizliğinde (veya anahtar üretimi istemciye
  bırakıldığında) aynı ödül ikinci kez ödenebilir. Brief'in "duplicate
  reward riskleri" maddesi.
- **Önerilen çözüm:** `idempotency_key`'i ilgili yollarda `NOT NULL` yap ve
  `(player_id, idempotency_key)` üzerinde `UNIQUE` kısıtı ekle (kısmi:
  `WHERE idempotency_key IS NOT NULL`) — brief PHASE 5.

---

## 12. Duplicate reward riskleri

- **E7** (pratik yarış musluğu) — en yüksek.
- **E23** (idempotency anahtarı DB'de zorunlu değil).
- **E24 — [MEDIUM] — Defter INSERT'i 3 yerde kopyalanmış** ○ —
  `infrastructure/player/player-row.ts` (`writeLedgerEntries`) ve iki
  repository daha. Aynı SQL üç yerde; birinde `balance_before/after`
  hesabı değişirse diğerleri sessizce farklı davranır.
  **Çözüm:** tek `writeLedgerEntries` fonksiyonu (player-row.ts'te zaten
  var — diğer ikisi onu çağırmalı).
- **E25 — [MEDIUM] — `economy_transactions.type` serbest metin, CHECK yok** ✔ —
  migration 0019:23. Bugün 8 farklı değer yazılıyor; yazım hatası
  (`'daily_reward'` yerine `'daily_rewards'`) sessizce kabul edilir ve
  raporlama sorguları bozulur. **Çözüm:** değerleri `domain/economy/
  ledger-types.ts`'te bir `as const` dizide topla (E2'deki desenle aynı) +
  şemada `CHECK` (brief PHASE 5).

---

## 13. Client'ın manipüle edebileceği noktalar

**Bulgu E26 — [CRITICAL] — Ekipman `quality`** — bkz. E20 (en ciddi).

**Bulgu E27 — [LOW] — İstemci tarafı bakiye ön kontrolü** ✔ —
`apps/web/src/lib/currency.ts` (`hasEnoughFunds`) yalnızca düğme
etkinliğini belirler; gerçek kontrol sunucudadır. **Sorun yok** — kayıt
amaçlı burada.

**Bulgu E28 — [LOW] — `apps/web`'de başka otorite ihlali bulunamadı** ○ —
`apps/web/src` genelinde para/ödül/envanter yazan bir yol yok; tüm sayılar
`apiClient` yanıtlarından gelir. **Bu madde temiz.**

---

## 14. Database transaction eksikleri

- **E10** (kilit sırası ters → deadlock).
- **E23** (idempotency anahtarı şemada zorunlu değil).
- **E6** (başlangıç bakiyesi deftere yazılmıyor → defter ile bakiye hiç
  eşleşmez).
- **E5** (mutabakat kodu yok).
- **Olumlu ✔:** para yollarının hepsi `SELECT ... FOR UPDATE` kullanıyor ve
  defter satırı **aynı transaction'da** yazılıyor (`player-row.ts`
  `writeLedgerEntries`, `mutate` callback'i içinde) — CLAUDE.md'nin
  "PARA/MUTASYON YOLU" kuralı bugün ihlal edilmiyor.

---

## 15. Test eksikleri

**Bulgu E29 — [MEDIUM] — `apps/api/test/application/` klasörü yok** ✔

- **Mevcut durum:** Use-case'ler (para yollarının **tamamı** burada) hiç
  birim testi edilmiyor. Domain 524 test ✔, web 307 test ✔.
- **Problem:** E19 (reference_id) tam olarak bu boşlukta saklandı: domain
  testleri SQL'e inmez, e2e'ler yerelde koşamaz (Postgres yok).
- **Önerilen çözüm:** repository port'larını taklit (mock) eden use-case
  testleri — özellikle her para yolu için "yetersiz bakiye" ve
  "defter satırı yazıldı mı" senaryoları (brief PHASE 12).

**Bulgu E30 — [MEDIUM] — Ödül yollarının e2e'si yok** ○ — E7'nin (musluk)
yakalanmamış olmasının sebebi: pratik yarışın **beklenen değerini** ölçen
bir test yok. **Çözüm:** config'teki ödül tablosu ile giriş ücretini
karşılaştırıp "EV ≤ 0" olduğunu iddia eden bir domain testi.

> **✅ KAPATILDI (27.09.2026) — önerilen test YAZILDI, üstelik daha
> güçlüsü.** `apps/api/test/domain/race/prize.spec.ts` artık:
> 1. **EV ≤ 0** iddia eder (`EV(net) = −raceRake × entryFee`, tüm
>    kademeler için) — önerinin birebir karşılığı;
> 2. bundan DAHA GÜÇLÜ olan **yapısal** değişmezi test eder:
>    `Σ ödül < havuz` (yani hiçbir ödül tablosu para basamaz) ve
>    `Σ payoutShares = 1 − raceRake`;
> 3. `validateRaceTiers` ile config'in kendisini "lint"ler — pay toplamı,
>    azalanlık, `fieldSize` sınırı, tekrarlanan kimlik. Bu son madde
>    somut olarak işe yaradı: ilk koşuda `championship` kademesinin son iki
>    payı `[..., 0.02, 0.01, 0.01]` olduğu için test KIRMIZI çıktı (iki
>    eşit ödül → azalanlık ihlali) ve config düzeltildi. Yani E30'un
>    "yakalanmamış olmasının sebebi" ortadan kalktı: test yazıldığı anda
>    gerçek bir config hatası yakaladı.
>
> E7/E30 için e2e tarafı da eklendi: `apps/api/test/api/race.e2e-spec.ts`
> beş kademenin hepsini uçtan uca koşar ve hazır olma reddinde **bakiyenin
> değişmediğini + defter satırı yazılmadığını** doğrular.

---

## 16. Önerilen uygulama sırası (brief §30 ile eşleşir)

| # | İş | Brief fazı | Bloke mi? |
|---|---|---|---|
| 1 | E19 düzeltmesi (reference_id) | PHASE 2 | **YAPILDI** ✔ |
| 2 | E2 para birimi tek kaynak + Çip/Elmas | PHASE 2 | **YAPILDI** ✔ |
| 3 | E7 musluk: ödül havuzu + hazır olma kapısı (**`@RateLimit` gerekmedi**) | PHASE 3/4 | **YAPILDI** ✔ (27.09.2026) |
| 4 | E20 ekipman `quality` sunucuya alınsın | PHASE 4 | Hayır — **en acil ikinci iş** |
| 5 | E23 idempotency anahtarı şemada zorunlu | PHASE 5 | Hayır |
| 6 | E6 + E5 başlangıç bakiyesi defteri + mutabakat testi | PHASE 2/5 | Hayır |
| 7 | E22 hata eşlemesi · E21 `@RateLimit` · E24 defter tekrarı · E25 `type` CHECK | PHASE 5/11 | Hayır |
| 8 | E29 use-case testleri (her para yolu) | PHASE 12 | Hayır |
| 9 | E16 bakım/antrenman/ekipman giderleri | PHASE 11 | **Sahibin onayı** (denge) |
| 10 | E18 yem satın alma arayüzü | PHASE 11 | Hayır |
| 11 | E17 çiftlik/personel çarpanları | PHASE 14 | Hayır |
| 12 | E8 gerçek yarış ödülü · E13 XP · E14 liderlik ödülü · E15 etkinlik | PHASE 4/8/9/10 | Kısmen (cron/worker kararı) |
| 13 | Elmas kazandıran yollar (ödüllü reklam SSV, ödeme sağlayıcısı) | PHASE 11 | **Evet — sağlayıcı seçimi** |

**Not:** 13. satırdaki iki yol, brief'in kendi kuralı gereği
"doğrulamasız elmas-ver ucu" olamaz; mevcut **fail-closed** desenle, ancak
proje sahibi bir reklam ağı ve ödeme sağlayıcısı seçtikten sonra yazılabilir.
