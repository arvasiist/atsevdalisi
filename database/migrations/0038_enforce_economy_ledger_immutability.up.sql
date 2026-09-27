-- brief §20 "WALLET SYSTEM": "Her para hareketi **immutable transaction**
-- olarak kaydedilmeli." ve §22 "ECONOMY SECURITY".
--
-- ## Neden migration GEREKTİ (kod yeterli değildi)
--
-- Defter (migration 0019) ZATEN sadece INSERT ediliyordu — ama bu bir
-- GELENEKTİ, KURAL DEĞİLDİ. `economy_transactions` üzerinde hiçbir
-- kısıt, yanlışlıkla (veya kötü niyetle) çalıştırılan bir
-- `UPDATE ... SET amount = 999999` ifadesini engellemiyordu; tek
-- koruma "hiçbir use-case UPDATE yazmaz" varsayımıydı. Muhasebe
-- defterinin değişmezliği bir varsayıma değil, veritabanının kendisine
-- dayanmalıdır (docs/SECURITY.md §2 "üçüncü katman: DB CHECK" ilkesinin
-- AYNI ruhu — kuralı en son savunma hattına yaz).
--
-- ## Neden HEM UPDATE HEM DELETE
--
-- UPDATE defterin GEÇMİŞİNİ tahrif eder (tutarlar değişir, `balance_after
-- = balance_before + amount` kısıtı tutmayı bırakır → muhasebe çöker).
-- DELETE ise hareketi YOK EDER (izlenebilirlik biter). İkisi de yasak.
--
-- ## DELETE'teki TEK İSTİSNA — `pg_trigger_depth() > 1`
--
-- `economy_transactions.player_id` üzerinde `REFERENCES players(id) ON
-- DELETE CASCADE` VAR (migration 0019). Bir oyuncu satırı silinirse
-- Postgres bu satırları KENDİSİ siler ve satır-seviyesi trigger'ı YİNE
-- ateşlenir — yani koşulsuz bir DELETE yasağı, oyuncu silmeyi de kırardı
-- (ve bu, test temizliği gibi meşru yollarda patlardı).
--
-- Ayrım şu: FK cascade'i, RI (referential integrity) trigger'ının
-- İÇİNDEN çalışır, yani trigger derinliği 1'DEN BÜYÜKTÜR. Doğrudan
-- `DELETE FROM economy_transactions ...` ise derinlik 1'de çalışır.
-- Bu yüzden yalnızca derinlik 1'deki silme reddedilir. (Bilinçli
-- ödünleşim: SQL seviyesinde yazma yetkisi olan biri bu kontrolü bir
-- fonksiyon içinden dolanabilir — ama o noktada zaten defteri
-- istediği gibi yazabilir; bu trigger'ın engellediği şey KAZA ve
-- uygulama kodundan gelen hatalı yazımdır.)
CREATE OR REPLACE FUNCTION economy_transactions_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    -- Oyuncu silinmesinin CASCADE'i — defter satırı da onunla gider.
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'economy_transactions değiştirilemez (immutable ledger): % reddedildi. Defter yalnızca EKLEME (INSERT) kabul eder — düzeltme gerekiyorsa ters kayıt (reversal) yazılmalıdır.',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_economy_transactions_immutable
  BEFORE UPDATE OR DELETE ON economy_transactions
  FOR EACH ROW EXECUTE FUNCTION economy_transactions_reject_mutation();

COMMENT ON FUNCTION economy_transactions_reject_mutation() IS
  'economy_transactions''ı salt-ekleme (append-only) tutar — brief §20/§22 (migration 0038)';
