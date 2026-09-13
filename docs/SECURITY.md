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
zorunlu kılar. Anahtarlar Redis'te `idempotency:{playerId}:{key}` formatında,
işlem sonucu ile birlikte 24 saat saklanır. Aynı anahtarla gelen ikinci
istek, işlemi tekrar çalıştırmadan ilk sonucu döner. Detaylar `docs/API.md`
§1.3.

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
deadlock oluşturmasını önler. Bilinçli kabul edilmiş risk: bu iki-satır
kilidi yalnızca `players` tablosunu kapsar — ilgili `market_listings`/
`horses` satırları AYRI, daha sonraki bir transaction'da güncellenir
(bkz. `BuyMarketListingUseCase` doc yorumu) — bu, brief §55'in "tek
transaction" idealinden bilinçli bir sapmadır, `run-practice-race.
use-case.ts`'in wallet+yarış kaydı deseniyle AYNI kategori.

## 6. Online güvenlik (brief §41-42)

```text
Client A ─┐
Client B ─┼→ Race Server → Race Simulation → Race Result → Tüm Client'lar
Client C ─┘
```

Server; katılımcı doğrulaması, at/jokey snapshot'ı, yarış konfigürasyonu,
seed, simülasyon, sonuç ve ödülü **tek elden** üretir. Hiçbir client kendi
local görünümünü diğerlerine authoritative olarak dayatamaz.

## 7. Rate limiting ve bot koruması (brief'e ek — proje sahibinin onayına sunuldu)

Brief'te açıkça yer almasa da, brief'in server-authoritative felsefesiyle
tutarlı olarak önerilir:

- Kayıt/giriş endpoint'lerinde IP bazlı rate limiting + CAPTCHA.
- Kritik ekonomi endpoint'lerinde (satın alma, ödül talebi) kullanıcı
  bazlı rate limiting (örn. dakikada N istek).
- Anormal davranış tespiti (örn. saniyeler içinde onlarca antrenman
  isteği) loglanır ve incelemeye alınır.

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

## 10. KVKK / gizlilik (proje sahibinin onayına sunulmuş açık madde)

Türkiye pazarına yönelik bu projede, kullanıcı verisi (e-posta, ödeme
bilgisi, oyun içi davranış) tutulacağından KVKK uyumluluğu ve bir gizlilik
politikası dokümanı gerekecektir (bkz. `ARCHITECTURE.md` §10.7).
