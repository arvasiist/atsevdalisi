# WALLET_SYSTEM.md — Cüzdan, İşlem Defteri ve Para Yatırma

> Kaynak: brief §20 "WALLET SYSTEM", §21 "Gerçek para entegrasyonunu
> şimdilik doğrudan hard-code etme", §22 "ECONOMY SECURITY", §40 (bu
> belgenin varlık sebebi), §41 "Sistemi önce: Virtual Coin / Mock Wallet
> olarak geliştir", §42 PHASE 4.
>
> **Kardeş belgeler:** `docs/ECONOMY.md` (gelir/gider kalemleri, para
> birimleri, market value) ve `docs/SECURITY.md` (§5 kilit disiplini).
> Bu belge onları TEKRARLAMAZ — yalnızca cüzdanın KENDİSİNİ anlatır:
> okuma yolu, işlem taksonomisi, defter değişmezliği ve para yatırma.
> Bir çelişki görürseniz `docs/ECONOMY.md` ve `docs/SECURITY.md` esastır.

---

## 1. Cüzdan nedir (ve ne DEĞİLDİR)

Cüzdan ayrı bir tablo **değildir**. Bakiye `players.money` /
`players.gems` kolonlarında durur; "cüzdan" bunun API üzerinden
görünen hâlidir.

```text
GET /api/v1/players/{id}/wallet
```

| Alan | Anlamı |
|---|---|
| `money`, `gems` | Oyuncunun GERÇEK bakiyesi — `GET /players/{id}` ile tipatıp aynıdır |
| `transactions[]` | Defter satırlarının yeniden eskiye sayfalanmış hâli |
| `hasMore` | Sunucunun cevabı: "daha eski hareket var mı" |

**Cüzdan ikinci bir doğruluk kaynağı DEĞİLDİR.** `GET /players/{id}` ile
aynı satırı okur; ayrışmaları yapısal olarak imkânsızdır. Bu iddia
`apps/api/test/api/wallet.e2e-spec.ts` tarafından kanıtlanır.

`hasMore` **sunucudan gelir** — istemcinin "dönen satır sayısı sayfa
boyutuna eşitse muhtemelen daha var" diye tahmin etmesi (klasik
off-by-one; tam bölünen sonuçlarda fazladan boş bir istek üretir)
gerekmez.

### Sayfalama

`?limit` HAM metin olarak gelir ve doğrudan `LIMIT $n`'e gider. Bu yüzden
hiçbir girdi 400/500 üretmez; geçersiz/tavanı aşan değerler **sessizce**
`walletHistoryDefaultLimit` / `walletHistoryMaxLimit`'e düşer
(`config/economy.config.json`). Kırpılan şey bir GÖRÜNTÜLEME tercihidir —
para değil. (Bu ayrım §5'te tekrar karşımıza çıkar.)

---

## 2. İşlem taksonomisi — iki katman

Brief §20 "DEPOSIT, ENTRY_FEE, PRIZE, GIFT, SPECTATOR_FEE, REFUND **gibi**
transaction type'larını desteklesin" der. "Gibi" kelimesi kritiktir:
sayılan altı tür ÖRNEKTİR, kapalı bir küme değil. Oyunun zaten para
üreten yolları (pazar, damızlık ücreti, yem, tesis, günlük ödül) bu
altısından hiçbirine dürüstçe sığmaz — hepsini zorla `DEPOSIT` saymak,
cüzdan ekranında "yem aldın" satırını "para yatırdın" diye göstermek
olurdu.

Bu yüzden iki katman vardır (`packages/shared-types/src/economy.ts`):

| Katman | Tip | Ne işe yarar |
|---|---|---|
| **Defter türü** | `LedgerTransactionType` | `economy_transactions.type`'a YAZILAN gerçek değer (ör. `feed_purchase`) |
| **Kanonik aile** | `CanonicalTransactionType` | Brief'in dilindeki kategori (ör. `UPKEEP`) |

`CANONICAL_BY_LEDGER_TYPE` her ince türü bir aileye eşler. Tipi
`Record<LedgerTransactionType, ...>` olduğundan **yeni bir tür eklenip
eşlemesi yazılmazsa derleme kırılır** — sessiz kayma imkânsızdır.

### Kanonik aileler

`DEPOSIT` · `ENTRY_FEE` · `PRIZE` · `GIFT` · `SPECTATOR_FEE` · `REFUND` ·
`MARKET` · `BREEDING` · `UPKEEP` · `REWARD`

İlk altısı brief'in AÇIKÇA saydıklarıdır ve `BRIEF_TRANSACTION_TYPES`
olarak ayrıca sabitlenir — biri "gereksiz" görülüp silinirse
`wallet-history.spec.ts` kırılır.

### Defter türleri (17)

| Defter türü | Aile |
|---|---|
| `daily_reward` | `REWARD` |
| `stable_upgrade`, `facility_build`, `facility_upgrade`, `feed_purchase` | `UPKEEP` |
| `breeding_stud_fee_debit`, `breeding_stud_fee_credit` | `BREEDING` |
| `gift_send_debit`, `gift_send_credit` | `GIFT` |
| `grandstand_ticket` | `SPECTATOR_FEE` |
| `market_purchase_debit`, `market_purchase_credit` | `MARKET` |
| `practice_race_entry_fee`, `lobby_race_entry_fee` | `ENTRY_FEE` |
| `practice_race_prize`, `lobby_race_prize` | `PRIZE` |
| **`mock_deposit`** | **`DEPOSIT`** |
| **`race_entry_refund`** | **`REFUND`** |

> **`REFUND` ailesi artık doludur** (§42 PHASE 4c): tek üreticisi
> `leave-race.use-case.ts`'tir ve §4b'nin tersidir — ayrıntı §8'de.

> **`PRIZE` ailesinin İKİNCİ üyesi geldi** (§42 PHASE 13.14):
> `lobby_race_prize`. `practice_race_prize`'ten ayrı tutulur çünkü
> "bu para nereden geldi" sorusu tek defter sorgusuyla cevaplanmalıdır;
> aynı tür altında toplanırsa `races.prize_pool` ile ödenen toplam
> uzlaştırılamaz.

**`race_entry_refund` neden `races.entry_fee`'yi okumaz:** iade tutarı
`economy_transactions`'tan, yani o oyuncunun o yarışa GERÇEKTE ödediği
`lobby_race_entry_fee` satırının ters işaretli hâlinden gelir. Ücret
politikası (config) iade ile katılım arasında değişirse, `races.entry_fee`
taze bir değerdir ve oyuncuya ödemediği bir tutarı iade edebilirdi.
Defter ise tanımı gereği değişmezdir.

---

## 3. Defter (ledger) ve değişmezlik

`economy_transactions` (migration 0019) her para hareketinin
**değiştirilemez** kaydıdır:

- `amount` **İMZALIDIR** (negatif = düşüm, pozitif = ekleme) ve **asla
  sıfır olamaz** (`CHECK (amount <> 0)`).
- `CHECK (balance_after = balance_before + amount)` — defter kendi içinde
  tutarlı olmak ZORUNDADIR; tutarsız bir satır yazılamaz.
- `id` bir UUID'dir (brief §22 "Transaction ID oluşturulmalı") ve
  `GET /wallet` bu kimliği döner.

### Migration 0038 — trigger

Defter satırları `BEFORE UPDATE OR DELETE` trigger'ı ile korunur ve
`restrict_violation` (SQLSTATE `23001`) ile reddedilir.

> **Neden bir trigger, neden "kod öyle yazmıyor" yeterli değil?**
> Defter bugün yalnızca EKLEME yapıyor çünkü hiçbir use-case `UPDATE`
> yazmıyor — bu bir **gelenek**, kural değil. Gelenek sessizce bozulur
> (bir düzeltme scripti, bir "hızlı tamir" sorgusu); kural bozulmaz.

**Bilinçli istisna:** `economy_transactions.player_id` üzerindeki
`ON DELETE CASCADE` yüzünden koşulsuz bir DELETE yasağı oyuncu silmeyi
de kırardı. İstisna DAR tutulmuştur: yalnızca `TG_OP = 'DELETE'` **ve**
`pg_trigger_depth() > 1` (yani bir CASCADE'in parçası) iken izin verilir.
`UPDATE` hiçbir koşulda muaf değildir — tutar tahrifatı
(`SET amount = 999999`) muhasebeyi çökertir.

Bu kural iki testle kanıtlanır: `economy-ledger-immutability.spec.ts`
(SQL'in ŞEKLİ, Postgres'siz) ve `wallet.e2e-spec.ts` (gerçek `UPDATE`/
`DELETE` denemesi, `23001` beklentisiyle).

### Yazma disiplini (CLAUDE.md kural 7)

Her para hareketi şu sırayla yazılır ve **tek bir transaction** içindedir:

```text
SELECT ... FOR UPDATE (players)
  → domain hesabı (kilitli satırın GÜNCEL değeriyle)
  → UPDATE players
  → INSERT economy_transactions
COMMIT
```

Biri başarısız olursa ikisi de geri alınır: defter, gerçek bakiye
değişikliğinden ASLA bağımsız bir duruma düşemez. Hesaplamanın kilit
İÇİNDE yapılması zorunludur — kilit dışında okunan bir bakiye stale
olabilir ve çift harcamaya kapı bırakır.

---

## 4. Para yatırma (mock wallet)

```text
POST /api/v1/players/{id}/wallet/deposit
Idempotency-Key: <zorunlu>
{ "amount": 1000 }
```

| Yanıt alanı | Anlamı |
|---|---|
| `transactionId` | **Defter satırının** UUID'si (yazılan satırın ta kendisi) |
| `providerReference` | **Ödeme sağlayıcısının** referansı (`mock_<uuid>`) |
| `providerId` | Sağlayıcı kimliği — şu an her zaman `'mock'` |
| `amount`, `currency` | Yatırılan tutar ve para birimi |
| `newBalance` | Sunucunun hesapladığı yeni bakiye |

İki kimliğin AYRI olması bilinçlidir: `transactionId` "bizim kaydımız",
`providerReference` "karşı tarafın kaydı". Gerçek bir sağlayıcıda
mutabakat (reconciliation) yalnızca ikincisiyle yapılabilir; ikisini tek
alanda birleştirmek sağlayıcı değiştiğinde geriye dönük izlenebilirliği
yok ederdi.

### Üç savunma katmanı (brief §41)

1. **Üretimde YAPISAL olarak kapalı.** `MockPaymentProvider.isEnabled()`
   iki koşulun birleşimidir:
   `config.economy.mockDeposit.enabled && NODE_ENV !== 'production'`.
   Tek başına config bayrağı yetmez — config dosyası depoda sürümlenir ve
   ortama göre değişmez, yani üretimde de `true` durur. Ortam koşulu,
   "birisi bayrağı yanlışlıkla açık bıraktı" durumunda sınırsız sanal para
   basma ucunu yapısal olarak engeller. Kapalıyken yanıt
   `MOCK_DEPOSIT_DISABLED` (**403**) ve HİÇBİR yazma yapılmaz.
2. **Defterdeki tür `mock_deposit`'tir, `deposit` DEĞİL.** Gerçek bir
   sağlayıcı bağlandığında geçmişteki kayıtların hangisi oyuncak olduğu
   geriye dönük OKUNABİLİR kalır.
3. **Tek işlem tavanı sunucudadır.** `mockDeposit.maxAmount` aşılırsa
   istek `INVALID_DEPOSIT_AMOUNT` (400) alır — **sessizce KIRPILMAZ**.
   (Karşılaştır: sayfalama `?limit`'i sessizce kırpar. Orada kırpılan şey
   bir görüntüleme tercihiydi; burada oyuncunun parası olurdu.)

### Sağlayıcı soyutlaması (brief §21)

`PaymentProvider` bir PORT'tur (`application/ports/payment-provider.ts`);
`MockPaymentProvider` onun tek implementasyonudur. Gerçek para yolunu
açmak için üç AÇIK adım gerekir:

1. Gerçek bir `PaymentProvider` implementasyonu yazmak,
2. `EconomyModule`'de `PAYMENT_PROVIDER` token'ını ona bağlamak,
3. `MockPaymentProvider`'ın ortam koşulunu gözden geçirmek.

Üçü de bilinçli olarak "config'i çevir" kadar kolay DEĞİLDİR.

> **Portun sözleşmesi:** sağlayıcı **asla bakiyeyi değiştirmez.** Tek işi
> "ödeme gerçekleşti" demek ve bir referans üretmektir. Bakiyeyi yazan tek
> yer `PlayerRepository.updateWithLock`'tur. Sağlayıcı `players` tablosuna
> dokunmaya başlarsa para yolu ikiye bölünmüş olur — kabul edilemez.

### Kilit sırası

`createDeposit` oyuncu satırı **kilitlenmeden ÖNCE** çağrılır. Gerçek bir
sağlayıcıda bu bir ağ çağrısıdır; `FOR UPDATE` kilidi tutulurken
yapılması kilidi dış bir gecikmeye bağımlı hâle getirirdi.

### Idempotency (brief §54)

`Idempotency-Key` **zorunludur**; eksikse `IDEMPOTENCY_KEY_REQUIRED` (400).
Aynı anahtarla gelen ikinci istek use-case'e HİÇ ULAŞMAZ, önbellekteki ilk
yanıtı alır (Redis + `idempotency_keys` tablosu, `IdempotencyInterceptor`).
Kapsam `@IdempotencyScope('player')` ile **doğrulanmış kimliğe** bağlıdır,
istemcinin gönderdiği bir alana değil.

Bu yüzden defter satırının `idempotency_key` alanı `null`'dur: satırın
kendi `id`'si zaten tekil bir anahtardır ve interceptor'ın anahtarı onunla
aynı şey DEĞİLDİR — biri "bu HTTP isteği tekrarlandı mı", diğeri "bu
defter satırı hangi ödeme".

### Tutar doğrulaması nerede yapılır

**Domain'de** (`domain/economy/mock-deposit.ts`), DTO'da değil. CLAUDE.md
kural 5: esbuild altında `@Body()`'nin metatipi `undefined` kalır ve
global `ValidationPipe` gövde doğrulamasını SESSİZCE atlar. Yani
`class-validator` dekoratörleriyle süslenmiş bir DTO çalışma anında hiçbir
şey doğrulamaz — güvenlik hissi verir, güvenlik vermez. Bu yüzden
`validateMockDeposit` `unknown` alır ve ASLA fırlatmaz; fırlatma kararı
çağıranındır.

---

## 5. Hata kodları

| Kod | HTTP | Ne zaman |
|---|---|---|
| `INVALID_DEPOSIT_AMOUNT` | 400 | Tutar tam sayı değil, ya da `minAmount`/`maxAmount` dışında |
| `MOCK_DEPOSIT_DISABLED` | 403 | Uç nokta bu ortamda kapalı (config **veya** `NODE_ENV=production`) |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | `Idempotency-Key` header'ı yok |
| `IDEMPOTENCY_KEY_IN_PROGRESS` | 409 | Aynı anahtarla bir istek hâlâ işleniyor |
| `PLAYER_NOT_FOUND` | 404 | Cüzdan sahibi yok |
| `FORBIDDEN` | 403 | Başkasının cüzdanı (`assertSelf`) |
| `INSUFFICIENT_FUNDS` | 409 | (Yatırmada değil; diğer para yollarında) |

Yarıştan ayrılma (§8) yolu ayrıca şunları üretir:

| Kod | HTTP | Ne zaman |
|---|---|---|
| `RACE_ENTRY_NOT_LEAVABLE` | 409 | Yarış `scheduled` değil, başlangıç zamanı gelmiş/geçmiş ya da katılım zaten iptal edilmiş |
| `RACE_ENTRY_CANCELLED` | 409 | Aynı yarışa yeniden katılma denemesi — katılım daha önce iptal edilmişti |
| `RACE_ENTRY_NOT_FOUND` | 404 | Oyuncunun bu yarışta katılımı yok |

---

## 6. Testler

| Dosya | Neyi kanıtlar |
|---|---|
| `test/domain/economy/wallet-history.spec.ts` | Taksonomi + sayfalama sınırı |
| `test/domain/economy/mock-deposit.spec.ts` | Tutar doğrulaması, config tutarlılığı |
| `test/database/economy-ledger-immutability.spec.ts` | Migration 0038'in ŞEKLİ (Postgres'siz) |
| `test/api/wallet.e2e-spec.ts` | Okuma yolu + gerçek `UPDATE`/`DELETE` reddi |
| `test/api/wallet-deposit.e2e-spec.ts` | Yatırma: bakiye, kimlik, idempotency, yetki |
| `test/domain/race/race-leave.spec.ts` | `checkRaceLeavable` — kabul/ret kararları, zaman sınırı, fırlatmama sözleşmesi |
| `test/api/race-leave.e2e-spec.ts` | Ayrılma: iade tutarı, `prize_pool` düşümü, iptal edilen katılımın lobiden düşmesi, çift iade yok |

---

## 7. AÇIK EKSİKLER (dürüst liste)

Bunlar "yapıldı" sayılmaz; bilinçli olarak sonraki dilimlere bırakılmıştır.

| Eksik | Neden şimdi değil | Nereye |
|---|---|---|
| **Günlük toplam yatırma tavanı** | Tavan, kilitli satırın İÇİNDE "bugün ne kadar yatırıldı" toplamını okumayı gerektirir; `updateWithLock`'un callback'i senkron ve veritabanına erişemez, kilidin DIŞINDA okumak yarış koşuluna açık olurdu | PHASE 16 (anti-cheat) |
| **Para ÇEKME (withdrawal)** | Gerçek para çıkışı demektir; mock cüzdanda karşılığı yok | Gerçek sağlayıcı ile birlikte |
| **Gerçek sağlayıcı (Stripe/iyzico)** | Brief §21 açıkça "şimdilik hard-code etme" der | Sahibinin kararı |
| **`gems` (Elmas) yatırma** | Premium para birimidir; mock cüzdanın onu basması, gerçek para karşılığı olan tek şeyi bedava dağıtmak olurdu. Bu yüzden para birimi config'e AÇILMADI | Gerçek sağlayıcı ile birlikte |
| **İade/chargeback** | Sağlayıcı entegrasyonunun parçasıdır | Gerçek sağlayıcı ile birlikte |

**Kapatılmış varsayım:** bu uç nokta üretimde KAPALIDIR. Bir gün
`NODE_ENV=production` altında açılırsa, brief §41'deki "varsayılan olarak
production'a açma" uyarısı çiğnenmiş olur — ve `MockPaymentProvider`'ın
ortam koşulu bunu yapısal olarak engellediği için, açmak ancak kodu
değiştirmekle mümkündür.

---

## 8. Yarıştan ayrılma ve giriş ücreti iadesi (brief §20 `REFUND`)

§42 PHASE 4c — §4'ün TERS yönü. `REFUND` ailesinin bugünkü tek üreticisi.

```text
POST /api/v1/races/{id}/leave
Idempotency-Key: <zorunlu>
(gövde YOK)
```

Yanıt **200 OK** ve gövdesi GÜNCELLENMİŞ `RaceLobbyView`'dur — `join` ve
`ready` ile aynı sınıflandırma. 204 seçilseydi istemci havuzun
KÜÇÜLDÜĞÜNÜ görmek için ikinci bir istek atmak zorunda kalırdı.

### Tek transaction'da ne olur

```text
SELECT ... FOR UPDATE (races)
  → SELECT ... FOR UPDATE (race_entries — oyuncunun KENDİ satırı)
  → checkRaceLeavable (domain kararı)
  → defterden ödenen tutarı oku
  → [tutar > 0 ise] SELECT ... FOR UPDATE (players)
                     → credit(...) → UPDATE players
                     → UPDATE races SET prize_pool = prize_pool - <tutar>
  → UPDATE race_entries SET status = 'cancelled'
  → INSERT economy_transactions (race_entry_refund)
COMMIT
```

**Kilit sırası `races → race_entries → players`'tır.** `joinLobbyRace`
ile İLK kilidi, `setEntryReady` ile ilk ikisini paylaşır; bu yüzden iki
uç arasında kilit sırası çakışması (deadlock) doğmaz.

**Ücretsiz yarışta `players` satırına HİÇ dokunulmaz ve defter satırı
YAZILMAZ.** Sıfır tutarlı bir defter satırı `CHECK (amount <> 0)`'ı
ihlal ederdi; zaten anlatacak bir para hareketi de yoktur.

### İade tutarı nereden gelir

**Defterden** — `races.entry_fee`'den DEĞİL. Ayrıntı §2'de. Tutar
`Math.max(0, -amount)` ile normalize edilir: defter satırı zaten negatif
yazılmıştır (düşüm), iade onun ters işaretlisidir.

### Katılım SİLİNMEZ, `cancelled` olur

`race_entries_race_player_uq` tekilliği `(race_id, player_id)` üzerindedir
ve `status`'tan BAĞIMSIZDIR. Satır silinseydi oyuncu aynı yarışa yeniden
katılabilirdi; bu da şu döngüyü açardı: katıl → READY bayrağını al →
ayrıl (ücret iade) → yeniden katıl. Sonuç, ayrıl-katıl ile READY
durumunu sıfırlayıp havuzu oynayabilen bir oyuncudur.

Bu yüzden ayrılan oyuncu için boşalan koltuk **BAŞKALARINA** açıktır ama
**KENDİSİNE** değildir ve bu ayrım `ALREADY_JOINED_RACE` yerine ayrı bir
kodla (`RACE_ENTRY_CANCELLED`) bildirilir — eski kod "yarıştasın" derdi,
oysa oyuncu yarışta değildir.

### İptal edilen katılım DOLULUK SAYILMAZ

Lobi görünümündeki katılımcı sayısı üç yerde
`COUNT(...) FILTER (WHERE status IS DISTINCT FROM 'cancelled')` ile
hesaplanır. `<>` değil `IS DISTINCT FROM` şarttır: `status` NULL olabilir
(eski satırlar) ve NULL ile yapılan `<>` karşılaştırması NULL döner —
yani satır sessizce SAYILMAZDI.

Bu, "havuz = ödenen giriş ücretlerinin toplamı" değişmezini korumak için
şarttır (PHASE 5'in ödül dağıtımı bu değişmez üzerine kurulur): iptal
edilen bir katılımın iadesi `prize_pool`'dan düşülürken o katılımın
"3/8 dolu" gibi görünmeye devam etmesi, iki sayının birbirini tutmadığı
bir lobi ekranı üretirdi.

### `prize_pool` `CHECK (prize_pool >= 0)` — tuzak DEĞİL, TEL

Düşüm `GREATEST(prize_pool - <tutar>, 0)` diye yazılmadı. Bu kısıt
(migration 0006) bir TRIPWIRE'dır: iade tutarı defterden okunduğu ve
katılım da o defteri yazdığı için `prize_pool`'un altına düşmesi
mantıken imkânsızdır. Düşerse bu, "havuz ile defter ayrıştı" demektir ve
sessizce sıfıra kırpmak o ayrışmayı gizlerdi. Kısıt patlarsa doğru tepki
`GREATEST` değil, hatayı GÖRMEKTİR.

### Idempotency

`Idempotency-Key` **zorunludur** ve kapsam `@IdempotencyScope('player')`
ile doğrulanmış kimliğe bağlıdır (`:id` yarışın id'sidir, anahtarın
kapsamı OLMAMALIDIR). İkinci kez aynı istek gelirse use-case'e HİÇ
ULAŞMAZ — yani İKİNCİ KEZ İADE EDİLMEZ. Bu, `join`'in "iki kez ücret
alma" korumasının tam aynasıdır; `race-leave.e2e-spec.ts` bunu ayrıca
defter satırı sayısıyla kanıtlar.

### Ne zaman ayrılınamaz

`checkRaceLeavable` (`domain/race/lobby.ts`) iki kural uygular ve ikisi
de `checkRaceJoinable`/`checkEntryReadyable` ile AYNI sınırdadır:

- yarış `scheduled` değilse → `NOT_SCHEDULED`
- `startTime <= now` → `ALREADY_STARTED` (sınır DAHİL kapalıdır)
- katılım zaten `cancelled` → `ALREADY_CANCELLED`

`status IS NULL` **reddedilmez** — `checkEntryReadyable` ile aynı
gerekçe: NULL "henüz karar verilmedi" demektir, iptal değildir.
