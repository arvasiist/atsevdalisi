# SECURITY.md — Güvenlik ve Anti-Cheat

> Kaynak: `docs/PROJECT_BRIEF.md` §6, §41-42, §54-55, §64-65, §89 İlke 3.

## 1. Server-authoritative — tek ve mutlak kural

```text
Client:  "Yarışı göster."           ✅
Client:  "Benim atım kazandı."      ❌ (asla kabul edilmez)
Client:  "Bu atın speed'i 99."      ❌ (backend kendi DB değerini kullanır)
```

Client hiçbir zaman şunları authoritative olarak belirleyemez: yarış
sonucu, para miktarı, at statları, ödül, envanter (brief §64). Bu kural
hem online hem offline (tek oyunculu) modda **aynı derecede** geçerlidir;
"tek oyunculu olduğu için önemi yok" varsayımı yapılmaz — çünkü ileride
leaderboard/turnuva (§43-44) aynı veriyi kullanacaktır.

## 2. Girdi doğrulama katmanları

```text
1. DTO/şema doğrulama (API katmanı)     — tip, format, aralık kontrolü
2. Application katmanı iş kuralı kontrolü — "at yorgun mu?", "para yeterli mi?"
3. Database CHECK constraint'leri        — son savunma hattı (bkz. DATABASE.md)
```

Her üç katman da bağımsız çalışır; API katmanındaki bir doğrulama
atlanırsa bile veritabanı seviyesindeki `CHECK` kısıtları geçersiz veriyi
reddeder.

## 3. Race Snapshot (brief §56)

Yarış başladığında atın **o anki** tüm değerleri `race_entries.horse_snapshot`
alanına donmuş (immutable) olarak kopyalanır. Yarış simülasyonu **sadece**
bu snapshot'ı kullanır; atın canlı veritabanı kaydı yarış sırasında
değişse bile (örn. oyuncu aynı anda başka bir işlemle atı besliyorsa) sonucu
etkilemez.

## 4. Idempotency (brief §54)

Ödül/ödeme/mülkiyet değiştiren tüm endpoint'ler `Idempotency-Key` header'ı
zorunlu kılar. Aynı anahtarla gelen ikinci istek, işlemi tekrar
çalıştırmadan ilk sonucu döner. Detaylar `docs/API.md` §1.3.

**AUDIT_AND_HARDENING Öncelik 3 (bu oturum) — güncellendi:** yukarıdaki
"Redis'te 24 saat saklanır" açıklaması ARTIK EKSİKTİR/GÜNCEL DEĞİLDİR.
Denetim, SADECE Redis + TTL'in gerçek bir dağıtık kilit SAĞLAMADIĞINI
(dokuzuncu dilimin kendi "bilinçli sınırlama" notu) tespit etti — iki
GERÇEKTEN eşzamanlı istek, ikisi de Redis'te anahtarı GÖRMEDEN, işleyiciyi
İKİ KEZ çalıştırabilirdi. Şimdi `IdempotencyInterceptor` (`apps/api/src/
api/idempotency/idempotency.interceptor.ts`) İKİ KATMANLI çalışır:

1. Redis (`idempotency:{scopeId}:{key}`) — HIZLI ön-kontrol/önbellek.
2. PostgreSQL `idempotency_keys` tablosu (migration 0020) — KALICI
   (TTL'siz) authoritative kayıt VE `INSERT ... ON CONFLICT DO NOTHING`
   ile GERÇEK bir veritabanı seviyesi rezervasyon kilidi. Rezervasyonu
   KAYBEDEN istek işleyiciyi HİÇ ÇALIŞTIRMAZ, `IdempotencyKeyInProgress`
   (409) alır.

Bu, §11 "Redis vs PostgreSQL source of truth" ilkesinin BİREBİR
uygulamasıdır: Redis sadece hız için vardır, PostgreSQL her zaman
otoritatif kaynaktır.

## 5. Transaction ve row-locking (brief §55)

Para/mülkiyet değiştiren her use-case:

```sql
BEGIN;
SELECT money FROM players WHERE id = $1 FOR UPDATE;
-- kontrol + güncelleme
COMMIT; -- veya hata durumunda ROLLBACK
```

Bu desen `apps/api/src/infrastructure/database` altında ortak bir
`withTransaction()` yardımcı fonksiyonu ile standardize edilir; her
use-case bunu tekrar tekrar elle yazmaz.

**İki taraflı transfer (FAZ 1 wiring, on birinci dilim — At Pazarı):**
para İKİ oyuncu arasında el değiştirdiğinde (`PlayerRepository.
updateTwoWithLock`, bkz. o metodun doc yorumu) satırlar HER ZAMAN
id'lerin sözlüksel sırasına göre kilitlenir — argüman sırasından
BAĞIMSIZ. Bu, iki farklı işlemin (ör. A'nın B'den, B'nin AYNI ANDA
A'dan bir şey satın almaya çalışması) birbirini karşılıklı bekleyip
deadlock oluşturmasını önler.

**AUDIT_AND_HARDENING Öncelik 1 (bu oturum) — KAPATILDI, aşağıdaki eski
metin ARTIK GEÇERLİ DEĞİL:** bu paragraf eskiden şöyle diyordu: "Bilinçli
kabul edilmiş risk: bu iki-satır kilidi yalnızca `players` tablosunu
kapsar — ilgili `market_listings`/`horses` satırları AYRI, daha sonraki
bir transaction'da güncellenir [...] brief §55'in 'tek transaction'
idealinden bilinçli bir sapmadır." Denetim bu riski EN KRİTİK madde
olarak işaretledi (iki eşzamanlı alıcı AYNI ilanı satın almaya
çalıştığında çifte satış/çifte harcama mümkündü) ve KAPATTI: At Pazarı
satın alma artık `market_listings`, `horses` ve İKİ `players` satırının
TAMAMINI TEK BİR transaction içinde, hepsini `SELECT ... FOR UPDATE` ile
kilitleyerek işler (bkz. yeni `MarketPurchaseRepository`/
`PostgresMarketPurchaseRepository`, `apps/api/src/infrastructure/market/
postgres-market-purchase.repository.ts`) — `BuyMarketListingUseCase`
artık sadece bu repository'yi çağıran ince bir orkestratördür. `run-
practice-race.use-case.ts`'in wallet+yarış kaydı deseni (YENİ satırlar
EKLEMEK, var olan paylaşılan bir satırı güncellemek DEĞİL) bu riskin
KAPSAMI DIŞINDAYDI zaten — bkz. o use-case'in kendi doc yorumu — ve
DOKUNULMADI. Doğrulama: `apps/api/test/api/market.e2e-spec.ts`'teki
eşzamanlılık testi (iki alıcı, `Promise.all`, tam olarak bir 200 + bir
409, tam olarak bir mülkiyet değişimi, satıcıya tam olarak bir kez ödeme).

## 6. Online güvenlik (brief §41-42)

```text
Client A ─┐
Client B ─┼→ Race Server → Race Simulation → Race Result → Tüm Client'lar
Client C ─┘
```

Server; katılımcı doğrulaması, at/jokey snapshot'ı, yarış konfigürasyonu,
seed, simülasyon, sonuç ve ödülü **tek elden** üretir. Hiçbir client kendi
local görünümünü diğerlerine authoritative olarak dayatamaz.

## 7. Rate limiting ve bot koruması (brief'e ek)

Brief'te açıkça yer almaz, ama brief'in server-authoritative felsefesiyle
tutarlı olarak eklenmiştir:

- **Kayıt/giriş endpoint'lerinde IP bazlı rate limiting: ✅ UYGULANDI**
  (AUDIT_REPORT.md Bulgu S5, bu oturum). `POST /players` (kayıt) ve
  `POST /auth/login` (giriş) — ikisi de `@Public()` olduğundan (token
  gerektirmeden çağrılabildiğinden) bot/kaba-kuvvet denemelerine karşı en
  savunmasız uç noktalar — artık `RateLimitGuard`
  (`apps/api/src/api/rate-limit/rate-limit.guard.ts`) ile IP başına 300
  saniyede 10 istekle sınırlı. Redis `INCR`/`EXPIRE` tabanlı klasik "sabit
  pencere" sayacı; limit aşıldığında `429 Too Many Requests` +
  `Retry-After` header'ı döner (`ErrorCode.RateLimitExceeded`). Yeni,
  izole `rate-limit.e2e-spec.ts` bu davranışı gerçek bir e2e testiyle
  doğrular. CAPTCHA henüz eklenmedi (ayrı bir üçüncü taraf entegrasyonu
  gerektirir, proje sahibinin bir sağlayıcı seçmesi gerekir — bu turun
  kapsamı dışında bırakıldı).
- **Kritik ekonomi endpoint'lerinde (satın alma, ödül talebi) kullanıcı
  bazlı rate limiting: ✅ UYGULANDI** (AUDIT_REPORT.md Bulgu S5, ikinci
  dilim). `POST /market/listings/:id/buy` (satın alma) dakikada 20,
  `POST /players/:id/daily-reward` (ödül talebi) dakikada 5 istekle
  sınırlı — ikisi de `keyBy: 'player'` (`AuthGuard`'ın doldurduğu
  `request.player.id`), IP DEĞİL, çünkü kimlik doğrulanmış bir rotada
  doğru birim budur (aksi halde aynı NAT/ofis ağındaki farklı gerçek
  oyuncular birbirini bloke ederdi). İlk turda bu ikisi "meşru idempotent
  yeniden-deneme fırtınası vs. gerçek kötüye kullanım" ayrımının ayrı bir
  tasarım gerektirdiği gerekçesiyle ertelenmişti — bu endişe gereksiz
  çıktı: CI zaten TÜM rotalarda (yalnızca kayıt/giriş değil)
  `DISABLE_RATE_LIMIT: 'true'` ile devre dışı bırakılıyordu (bkz. yukarısı),
  bu yüzden `stable.e2e-spec.ts`'in n=100 FARKLI-Idempotency-Key testi
  DAHİL hiçbir mevcut eşzamanlılık testi etkilenmedi — özel bir ayrım
  algoritmasına hiç gerek kalmadan, birinci dilimde kurulan altyapı
  (opt-in `@RateLimit(...)` + CI-genelinde bayrak + izole e2e testi)
  doğrudan yeniden kullanıldı.
- Anormal davranış tespiti (örn. saniyeler içinde onlarca antrenman
  isteği) loglanır ve incelemeye alınır — henüz uygulanmadı.

## 8. Loglama / audit trail (brief §65)

Her kritik işlem şu alanlarla loglanır: `PlayerId`, `Action`, `EntityId`,
`OldValue`, `NewValue`, `Timestamp`, `RequestId`. Özellikle: para, gem,
at mülkiyeti, yarış ödülü, yetiştiricilik, pazar satın alımı. Bu loglar
`apps/api/src/infrastructure/logging` altında yapılandırılacak merkezi bir
audit log servisine yazılır (FAZ 1'de temel implementasyon, ileride
merkezi log toplama servisiyle entegrasyon — bkz. `ARCHITECTURE.md` §10.9).

## 9. Gizli veri sızıntısı koruması

Brief §8.2 ve §29'daki "gizli özellikler" (gerçek potansiyel, temperament,
injury susceptibility, tam genetik veri vb.) API yanıtlarında **asla ham
değer olarak** dönmez. Bu alanlar:

- Ya hiç dönülmez (sadece backend hesaplamalarında kullanılır),
- Ya da scout sisteminin ürettiği bir **aralık** olarak dönülür (brief §34).

Bu kural `apps/api/src/api/dto` katmanında, domain nesnesinden DTO'ya
dönüşüm sırasında (mapper fonksiyonlarında) uygulanır; controller'lar
domain nesnesini doğrudan JSON'a serialize etmez.

**AUDIT_AND_HARDENING Öncelik 5 (bu oturum) — KAPATILDI:** yukarıdaki
kural bu oturumdan ÖNCE, aslında, HİÇ UYGULANMIYORDU — `apps/api/src/api/dto`
dizini HİÇ YOKTU ve `HorseController` (`GET /horses`, `GET /horses/:id`)
ham `Horse` nesnesini (`potential` DAHİL) doğrudan JSON'a serialize
ediyordu. Şimdi gerçek bir mapper var: `apps/api/src/api/dto/horse.mapper.ts`
`toPublicHorse()`, ham `potential`i TAMAMEN KALDIRIR ve yerine 10 puanlık
dilimlere yuvarlanmış (BİLEREK simetrik OLMAYAN — bkz. o dosyanın doc
yorumu, simetrik bir aralık aritmetikle ham değeri geri verirdi) bir
`potentialEstimate: {min, max}` aralığı koyar. `HorseStats`'ın gizli
alanları (`temperament`/`focus`/vb.) ve genetik/breeding verisi şu an
HİÇBİR API endpoint'i tarafından dönülmüyor (breeding henüz API'ye
bağlanmadı) — bu yüzden bu oturumda YALNIZCA gerçekten sızan `Horse.
potential` düzeltildi; `HorseStats`/genetik alanları breeding/jockey FAZ'ları
API'ye bağlanırken AYNI `apps/api/src/api/dto` deseniyle korunmalıdır.
Doğrulama: `apps/api/test/api/horse.mapper.spec.ts` (birim) +
`horse.e2e-spec.ts`'e eklenen regresyon testleri (gerçek HTTP yanıtında
`"potential"` string'i hiç GEÇMEZ).

## 10. KVKK / gizlilik (proje sahibinin onayına sunulmuş açık madde)

Türkiye pazarına yönelik bu projede, kullanıcı verisi (e-posta, ödeme
bilgisi, oyun içi davranış) tutulacağından KVKK uyumluluğu ve bir gizlilik
politikası dokümanı gerekecektir (bkz. `ARCHITECTURE.md` §10.7).

## 11. Redis vs PostgreSQL — otoritatif kaynak (AUDIT_AND_HARDENING Öncelik 7, bu oturum)

Denetimin talep ettiği kural: Redis SADECE cache/session/geçici-state/
rate-limit/kilit için kullanılabilir; para, mülkiyet, yarış sonucu ve
ledger (bkz. §12) HER ZAMAN PostgreSQL otoritatiftir. Herhangi bir
Redis/PostgreSQL tutarsızlığında PostgreSQL KAZANIR.

Bu oturumda yapılan bir kod taraması (`REDIS_CLIENT`'ı kullanan TÜM
dosyalar) bu kuralın ZATEN, tasarım gereği, ihlal EDİLMEDİĞİNİ doğruladı:
Redis client bu kod tabanında TEK BİR yerde okunur/yazılır —
`IdempotencyInterceptor` (bkz. §4) — ve orada da SADECE bir hız
önbelleği olarak; asıl kalıcı/authoritative kayıt PostgreSQL'deki
`idempotency_keys` tablosudur (migration 0020). Para/mülkiyet/yarış
sonucu/ledger'ın tamamı her zaman doğrudan PostgreSQL'e yazılır
(`PlayerRepository`, `PostgresMarketPurchaseRepository`, `RaceRepository`,
`economy_transactions`) — hiçbiri Redis'ten OKUNMAZ veya Redis'e
yazılmaz. `RedisModule`'ün kendi doc yorumu da ("Kritik finansal state
Redis'e authoritative olarak bırakılmaz") bu ilkeyi ZATEN belirtiyordu.
Bu madde, denetimin bu ilkeyi AÇIKÇA doğruladığının ve gelecekte Redis'in
başka bir amaçla (ör. leaderboard cache, session, brief §78 rate
limiting) kullanılmaya başlanması durumunda bu KURALIN referans noktası
olarak kalıcı bir yazılı doğrulamadır.

## 12. Economy Ledger — kalıcı muhasebe defteri (AUDIT_AND_HARDENING Öncelik 2, bu oturum)

Para hareketi üreten HER use-case (günlük ödül, ahır yükseltme, pratik
yarış giriş ücreti/ödülü, at pazarı alım-satım), bakiye değişikliğiyle
AYNI veritabanı transaction'ı içinde `economy_transactions` tablosuna
(migration 0019) bir satır yazar: `player_id`, `type`, işaretli (signed)
`amount`, `currency`, `reference_type`/`reference_id`, `balance_before`/
`balance_after`, `idempotency_key`. Bu, brief'in "denetlenebilir bir
muhasebe defteri" gereksinimini karşılar — herhangi bir bakiye
değişikliğinin NEREDEN geldiği, artık sadece uygulama kodunu okuyarak
DEĞİL, doğrudan bu tablodan sorgulanarak doğrulanabilir. Sıfır tutarlı
hareketler (ör. `price: 0` bir ilan, ödülsüz bir yarış sıralaması) İÇİN
ledger satırı YAZILMAZ (para hareketi zaten YOK) — bkz. `domain/economy/
wallet.ts` `assertValidAmount`'ın "sıfır/negatif miktar reddedilir"
kuralı ve bunun çağıran kodda (ör. `purchaseListing`) nasıl bilinçli
olarak atlandığı.

`PlayerRepository.updateWithLock`'ın `mutate` callback'i artık isteğe
bağlı bir `ledgerEntries` alanı döndürebilir — Postgres implementasyonu
bunları oyuncu satırı güncellemesiyle AYNI transaction'da, hemen
ardından yazar (bkz. `PostgresPlayerRepository.writeLedgerEntries`). At
Pazarı satın alma, `PlayerRepository`'yi KULLANMAZ (Öncelik 1'de
açıklanan çapraz-aggregate `MarketPurchaseRepository`'ye taşındı) — o da
KENDİ transaction'ı içinde AYNI tabloya iki satır (alıcı borç, satıcı
alacak) yazar.
