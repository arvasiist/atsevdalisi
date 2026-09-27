-- economy_transactions.reference_id: UUID -> TEXT
-- (brief §14 MULTIPLE CURRENCY / PHASE 2 Currency-Wallet-Ledger).
--
-- GEREKÇE (gerçek bir hatanın düzeltmesi): `reference_id` migration 0019'da
-- UUID olarak tanımlandı ve bilinçli olarak FK'sızdı ("polimorfik referans"),
-- ama yazılan değerlerin HEPSİ UUID değil. Somut kanıt:
-- `application/use-cases/buy-feed.use-case.ts` satın alma defter satırını
-- `referenceId: feedType` ile yazıyor; `feedType` ise bir slug'dır
-- ('arpa', 'mama', 'havuc', 'vitamin'). Postgres 'arpa'yı UUID'ye çeviremeyip
-- 22P02 (invalid_text_representation) fırlatır, bu da TÜM transaction'ı geri
-- alır — yani `POST /players/:id/feed-inventory/:type/buy` her çağrıda 500
-- dönüyordu ve ELMAS (premium para birimi) harcamanın TEK yolu tamamen
-- kapalıydı. Hiçbir test bunu yakalamıyordu (para yolu e2e'si yerelde
-- koşamıyor, birim testleri SQL'e inmiyor).
--
-- Neden kolonu gevşetmek doğru çözüm: `reference_id` ZATEN polimorfik bir
-- referanstır — yarış/pazar ilanı id'si UUID, yem kalemi slug'dır. Tek bir
-- tipin (UUID) dayatılması, ikinci bir referans türü eklendiği anda kırılır;
-- kırıldı da. TEXT, "hangi tür olduğu `reference_type`'ta yazar" sözleşmesinin
-- doğru karşılığıdır. Referansın gerçekten UUID olması gereken yollarda
-- doğrulama uygulama katmanında, `reference_type` ile birlikte yapılır.
--
-- Veri kaybı YOK: `reference_id::text` her UUID'yi kayıpsız metne çevirir.
-- Bağımlı index (`idx_economy_transactions_reference`) ALTER TYPE sırasında
-- Postgres tarafından otomatik yeniden kurulur; elle DROP/CREATE gerekmez.

ALTER TABLE economy_transactions
  ALTER COLUMN reference_id TYPE TEXT USING reference_id::text;

COMMENT ON COLUMN economy_transactions.reference_id IS 'Polimorfik referans kimliği; türünü reference_type belirler (yarış/pazar ilanı UUID, yem kalemi slug). UUID DEĞİLDİR — bkz. migration 0031.';
