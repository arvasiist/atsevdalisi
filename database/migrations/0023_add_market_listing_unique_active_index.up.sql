-- AUDIT_REPORT.md Bulgu D1 (CRITICAL) — bir at için aynı anda birden fazla
-- AKTİF ilan oluşturulabiliyordu, çünkü tekil kısıtı yalnızca application
-- katmanında (CreateMarketListingUseCase'in "önce oku, sonra yaz" kontrolü,
-- kilitsiz/transaction'sız) uygulanıyordu — iki eşzamanlı istek bu kontrolü
-- ikisi de geçebilir, aynı ata iki aktif ilan yazılabilirdi. Bu, D2'nin
-- düzeltmesiyle birleşince, ilk alıcı parasını ödeyip atı gerçekten aldıktan
-- SONRA, aynı ata ait İKİNCİ (hâlâ 'active' görünen) ilan üzerinden ikinci
-- bir "satın alma" atı ilk alıcıdan sessizce geri alabiliyordu.
--
-- Kısmi (partial) bir UNIQUE index — yalnızca status='active' olan satırlar
-- için geçerli — bunu VERİTABANI SEVİYESİNDE imkansız kılar: aynı horse_id
-- için ikinci bir 'active' satır INSERT/UPDATE edilmeye çalışıldığında
-- Postgres bir unique_violation (23505) hatası fırlatır. Uygulama katmanı
-- (PostgresMarketListingRepository.save) bunu yakalayıp mevcut
-- HorseAlreadyListedError'a çevirir — API sözleşmesi/HTTP durumu DEĞİŞMEZ,
-- yalnızca artık GERÇEKTEN zorunlu kılınıyor (önceden yalnızca "iyi niyetli"
-- bir kontroldü).
CREATE UNIQUE INDEX idx_market_listings_one_active_per_horse
  ON market_listings (horse_id)
  WHERE status = 'active';
