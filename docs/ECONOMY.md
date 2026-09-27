# ECONOMY.md — Ekonomi Sistemi

> Kaynak: `docs/PROJECT_BRIEF.md` §30-31, §67. Server-authoritative kuralları
> için `docs/SECURITY.md`. Bu sistem **FAZ 1**'den itibaren (temel para
> akışı) FAZ 2'ye kadar (pazar, personel) kademeli olarak genişler.

## 1. Temel kural

Ekonomi **her zaman backend'de authoritative** tutulur (brief §31).
İstemciden gelen hiçbir istek doğrudan bakiyeyi değiştiremez:

```text
❌ Yanlış:  Client → { "money": +100000 } → DB
✅ Doğru:   Client → { "action": "claimReward", "raceId": "..." }
            → API doğrular → Application use-case hesaplar
            → DB transaction içinde günceller → Client'a güncel bakiye döner
```

## 2. Gelir kalemleri (brief §31)

| Kalem | Tetikleyici | Hesaplama sorumlusu |
|---|---|---|
| Yarış ödülü | Yarış sonucu (finish_position ≤ ödül sırası) | `ClaimRaceRewardUseCase` |
| Satış | Pazarda at satışı | `SellHorseUseCase` |
| Görev | Görev tamamlama | `CompleteQuestUseCase` |
| Turnuva | Turnuva sıralaması (FAZ 7) | `TournamentRewardUseCase` |
| Başarı | Achievement açılması | `UnlockAchievementUseCase` |
| Sezon ödülü | Sezon sonu (FAZ 7) | `SeasonRewardUseCase` |
| Günlük ödül | Günlük giriş | `ClaimDailyRewardUseCase` |

## 3. Gider kalemleri (brief §31)

At satın alma, yarış giriş ücreti, yem, veteriner, nalbant, antrenman,
jokey (maaş), personel (maaş), ahır/çiftlik geliştirme, yetiştiricilik
ücreti. Her gider, ilgili use-case içinde **önce bakiye kontrolü, sonra
düşüm** sırasıyla, tek bir transaction içinde yapılır (bkz. §5).

> **Bu liste HEDEFTİR, bugünkü durum değildir.** Hangilerinin gerçekten
> bağlı olduğu ve hangilerinin hâlâ bedava olduğu §4.2'de yazılıdır.

## 4. Para birimleri

İki para birimi vardır ve **birbirine çevrilemez** — brief §14: "premium
currency gerekiyorsa AYRI tutulmalı". Kimlikler ve tip TEK bir yerde
tanımlıdır: `packages/shared-types/src/currency.ts` (`CURRENCIES` /
`Currency`). `apps/api` domain'i (`domain/economy/wallet.ts`) bunu yeniden
dışa aktarır; `apps/web` oyuncuya görünen adları oradan türetir
(`apps/web/src/lib/currency.ts`).

| Kimlik (depolama) | Oyuncuya görünen ad | Tür | Oyuncu kolonu | Defter |
|---|---|---|---|---|
| `money` | **Çip** | Ana (yumuşak) para | `players.money` | `economy_transactions.currency = 'money'` |
| `gems` | **Elmas** | Premium para | `players.gems` | `economy_transactions.currency = 'gems'` |

> **Depolama kimliği neden hâlâ `money`?** Brief §1 "yeni currency
> oluşturmak yerine mevcut sistem uygunsa onu genişlet" der. Kolonu
> yeniden adlandırmak her para yolunu, migration'ı ve mevcut defter
> kayıtlarını riske atardı; değişen şey oyuncunun GÖRDÜĞÜ addır ve o ad
> UI katmanında yaşar.

`economy_transactions.currency` üzerindeki `CHECK (currency IN (...))` ile
`CURRENCIES` arasındaki kayma `apps/api/test/database/economy-currency.spec.ts`
tarafından denetlenir — yeni bir birim eklenip migration yazılmazsa test kırmızı olur.

### 4.1 Source / sink tablosu (brief §14)

Brief §14 "bütün currency'lerin source/sink tablosunu oluştur" der. Aşağıdaki
tablo **bugün kodda gerçekten var olan** yolları gösterir; brief'in öngördüğü
ama henüz uygulanmamış kalemler ayrıca işaretlenmiştir.

| Birim | Source (gelir) | Sink (gider) |
|---|---|---|
| **Çip** (`money`) | Yeni oyuncu başlangıç bakiyesi (5.000) · günlük ödül (500) · yarış ödülü (havuzdan pay) · pazar satışı (satıcı payı) | Yarış giriş ücreti (kademeye göre 100–2000) · ahır yükseltmesi · tesis yükseltmesi · pazar alımı (alıcı) |
| **Elmas** (`gems`) | Yeni oyuncu başlangıç bakiyesi (50) — **başka kaynak YOK** | Yem satın alma (`arpa`/`mama`/`havuc`/`vitamin`) — **tek sink** |

**Henüz uygulanmamış (brief'te var, kodda yok):** gerçek yarış ödülü
(`ClaimRaceRewardUseCase` YOKTUR — bugün tek ödül yolu anında koşulan
yarıştır) · görev ödülü · başarı (achievement) ödülü · turnuva/sezon ödülü ·
jokey ve personel maaşları · yetiştiricilik ücreti · bakım/antrenman/ekipman
giderleri (bugün **bedavadır**, bkz. §4.2) · Elmas kazandıran yollar
(ödüllü reklam, satın alma).

### 4.1.1 Yarış ekonomisi — havuz + kesinti (27.09.2026)

Proje sahibinin kararıyla yarış artık **ücretli** ve ödül **sabit bir
tablodan değil, bir havuzdan** dağıtılır. Kaynak
`config/economy.config.json` → `raceRake` + `raceTiers`:

| Kademe | Alan | Giriş ücreti | Havuz | Ödül alan sıra | 1. sıra çarpanı |
|---|---|---|---|---|---|
| `local` Mahalli | 8 at | 100 | 800 | 5 | 3.00× |
| `regional` Bölgesel | 10 at | 250 | 2.500 | 6 | 3.60× |
| `national` Ulusal | 12 at | 500 | 6.000 | 7 | 4.08× |
| `elite` Elit | 14 at | 1.000 | 14.000 | 8 | 4.62× |
| `championship` Şampiyona | 16 at | 2.000 | 32.000 | 9 | 4.80× |

- **Havuz** = `entryFee × fieldSize`. Botlar da giriş ücretini ödemiş
  sayılır, yani havuz gerçek bir havuzdur (eski modelde botlar hiçbir şey
  ödemiyordu ve ödül sabit bir tablodan geliyordu — E7 musluğunun kaynağı).
- **Pay** = `payoutShares[finishPosition-1]`, `Σ payoutShares = 1 − raceRake`.
  Dağıtılan toplam ödül havuza **yapısal olarak** eşit olamaz, yani yarış
  HİÇBİR kademede Çip basamaz. Bu değişmez bir testle korunur
  (`apps/api/test/domain/race/prize.spec.ts`), çünkü `game-config` loader'ı
  saf bir cast'tir (çalışma zamanı doğrulaması yok) ve config elle
  düzenlenebilir.
- **Kesinti** = `raceRake` = **%10** (proje sahibinin kararı, 27.09.2026).
  Bu, sistemin tek "sink"idir: kesilen kısım hiçbir oyuncuya ödenmez.
- **Oyuncunun gördüğü çarpan** türetilir: `payoutShares[i] × fieldSize`
  (ör. mahalli 1. sıra 3.00×). Ayrı bir çarpan tablosu TUTULMAZ, böylece
  alan büyüklüğü arttığında çarpan kendiliğinden büyür ve kayacak ikinci
  bir tablo oluşmaz.
- **EV:** eşit güçte bir alanda `EV(net) = −raceRake × entryFee`, yani
  alan büyüklüğünden bağımsız olarak **negatif**. Yarış bir Çip kaynağı
  değil, Çip havuzudur (denetim bulgusu E30'un doğrudan testi).

> **✅ Kapatıldı — audit bulgusu E7 (CRITICAL) ve E30 (MEDIUM).** Eskiden
> pratik yarış bir **sınırsız Çip musluğuydu**: giriş 50, sabit ödül tablosu
> `[200,120,80,50,30,0]` (toplam 480), botlar hiç ödemiyordu → beklenen
> değer yarış başına ≈ **+30**. Artık ödül havuzun `1 − raceRake`'i kadardır
> ve EV yapısal olarak negatiftir. Musluğu kapatmak için `@RateLimit` veya
> bekleme süresi EKLENMEDİ — sorun oranla değil, para akışının YAPISIYLA
> çözüldü (bir yarış ne kadar tekrarlanırsa tekrarlansın Çip üretmez).
> Değişmezler: `apps/api/test/domain/race/prize.spec.ts` (33 test) ve
> uçtan uca `apps/api/test/api/race.e2e-spec.ts`.

### 4.2 Bugün bedava olan giderler

`config/economy.config.json` ve `config/care.config.json` bakım/antrenman
maliyetlerini **tanımlar** ama bunları okuyup uygulayan çağrı yoktur
(`getCareActionCost`'un hiç çağıranı yoktur; antrenmanın maliyet kavramı
yoktur; ekipman oluşturma ücretsizdir). Yani brief'in öngördüğü sink'lerin
bir kısmı **henüz bağlanmamıştır** — bu, "para birimini uyarlama" işinin
kapsamı dışında bırakılmıştır çünkü bedava olan bir yere ücret koymak
oyun dengesi kararıdır, proje sahibinin onayını gerektirir.

### 4.3 Monetization sınırı (brief §67)

**Gerçek para ile "garantili yarış galibiyeti" satılmaz** ve gerçek para
bahis/kumar mekaniği oyunun çekirdeği olamaz. `gems` ile satın alınabilecek
her item, `config/economy.config.json` → `gemShopWhitelist` içinde açıkça
listelenmelidir; bu liste dışı hiçbir item gems karşılığı satılamaz.

> **AUDIT_REPORT.md Bulgu DOC1 — durum düzeltmesi:**
> `gemShopWhitelist` şu an yalnızca `config/economy.config.json` içinde
> bir VERİ olarak var; `apps/api/src` içinde bunu okuyan/zorunlu kılan
> HİÇBİR kod yoktur, çünkü henüz hiçbir gem shop endpoint'i (satın alma
> akışı) uygulanmamıştır. Yukarıdaki kural bu yüzden şu an "kod
> seviyesinde zorunlu kılınan" bir davranış DEĞİL, gem shop inşa
> edildiğinde UYULMASI PLANLANAN bir tasarım kararıdır — gem shop
> use-case'i yazılırken bu whitelist kontrolü GERÇEKTEN eklenmelidir.

## 5. Transaction ve idempotency kuralları

Brief §54-55 ile birebir:

```text
BEGIN
  SELECT money FROM players WHERE id = :playerId FOR UPDATE;
  IF money < cost THEN ROLLBACK, raise INSUFFICIENT_FUNDS;
  UPDATE players SET money = money - cost WHERE id = :playerId;
  INSERT INTO ... (mülkiyet/kayıt değişikliği)
COMMIT
```

Ödül/ödeme endpoint'leri `Idempotency-Key` zorunlu tutar (bkz.
`docs/API.md` §1.3); aynı anahtarla ikinci istek ikinci kez ödül vermez.
**AUDIT_AND_HARDENING (bu oturum):** bu artık Redis+PostgreSQL çift
katmanlı, PostgreSQL'de KALICI bir kayıt/rezervasyon kilididir — bkz.
`docs/SECURITY.md` §4.

**AUDIT_AND_HARDENING Öncelik 2 (bu oturum) — Economy Ledger:** yukarıdaki
`BEGIN/.../COMMIT` deseni artık İKİ satırlık bir uygulama DEĞİL, ÜÇ:
bakiye güncellemesiyle AYNI transaction içinde kalıcı bir
`economy_transactions` satırı da yazılır (`player_id`, işaretli `amount`,
`balance_before`/`balance_after`, `reference_type`/`reference_id`) — bkz.
`docs/SECURITY.md` §12 tam detay için. Bu, brief'in "denetlenebilir
muhasebe defteri" gereksinimini karşılar: herhangi bir bakiye
değişikliğinin kaynağı artık doğrudan SQL ile sorgulanabilir, uygulama
kodunu okumaya gerek KALMAZ.

## 6. Pazar değeri modeli (brief §30)

```text
MarketValue = Quality × Potential × AgeFactor × RaceHistory × PedigreeValue × Health × Demand
```

Bu, oyuncu ilan fiyatı için bir **öneri/taban** olarak kullanılır; oyuncu
kendi fiyatını belirleyebilir (özellikle `fixed_price` ilanlarda), ancak
açık artırma (`auction`) modunda taban fiyat bu formülden hesaplanabilir.
Ayrıntılı ağırlıklar `docs/ALGORITHMS.md` §11'dedir.

## 7. Monetization sınırları (brief §67)

İzin verilen: kozmetik (avatar, ahır dekorasyonu, at/jokey kozmetikleri),
premium sezon, convenience item (örn. bekleme süresini kısaltma — ama
yarış sonucunu değil).

**Kesinlikle yasak:** Gerçek para karşılığı doğrudan yarış galibiyeti
garantisi; gerçek para ile bahis/kumar mekaniği.

> **Açık karar (bkz. ARCHITECTURE.md §10.6):** Ödeme sağlayıcısı (Stripe,
> iyzico vb.) henüz seçilmedi; proje sahibinin onayı bekleniyor.

## 8. Test kriterleri (brief §53 Economy testleri)

- Hiçbir işlem sonucunda negatif para oluşamaz (`CHECK (money >= 0)` +
  use-case seviyesinde ön kontrol — çift katmanlı güvence).
- Aynı işlem (aynı Idempotency-Key) iki kez uygulanamaz.
- Yarış ödülü sadece server tarafından, `ClaimRaceRewardUseCase` içinde
  verilebilir.
- Satın alma atomiktir: para düşümü ve mülkiyet devri aynı transaction
  içinde olur; biri başarısız olursa diğeri de geri alınır.
