-- AUDIT_REPORT.md R1 (bu oturum) — `config/race.config.json` için migration
-- 0021'in kapattığı TAM AYNI bütünlük riski, `config/weather.config.json`
-- için hâlâ AÇIKTI: `domain/race/environment.ts`'teki `getEnvironmentModifier`
-- AKTİF olarak kullanılıyor ve `combinedConditionModifier`'ı (dolayısıyla
-- yarış sonucunu) DOĞRUDAN etkiliyor, ama hiçbir `races` satırı bu
-- yarışın HANGİ hava durumu config sürümüyle üretildiğini kaydetmiyordu.
-- `weather.config.json`'daki denge sayıları (surfaceModifier/weatherModifier)
-- gelecekte değişirse (brief §52 dengeleme/tuning döngüsü), ESKİ yarışların
-- "aynı seed + aynı snapshot ⇒ aynı sonuç" garantisi hangi weather config
-- sürümüyle üretildiği artık BİLİNEMEZ hale gelirdi — replay/audit (brief
-- §58) sessizce YANLIŞ sonuç üretebilirdi çünkü mevcut config ile yeniden
-- hesaplama YAPILIR, ama o an GEÇERLİ olan weather config o yarışı
-- ürettiğinde geçerli OLAN ile AYNI olmayabilir.
--
-- `engine_version`/`ruleset_version`/`config_version` (migration 0021)
-- BİLEREK `race.config.json`'ın kendi sürümünü kapsar; `weather_config_version`
-- KASITLI OLARAK AYRI bir sütundur çünkü `weather.config.json`, `race.
-- config.json`'dan BAĞIMSIZ olarak güncellenebilir (ör. sadece hava durumu
-- dengesi değiştirilip yarış dengesi hiç dokunulmadan bırakılabilir) — tek
-- bir sütuna sıkıştırmak "hangi config değişti" sorusunun replay/audit
-- sırasında AYRI AYRI cevaplanmasını ENGELLERDİ (bkz. 0021'in üç ayrı sütun
-- kararıyla AYNI gerekçe).
--
-- Mevcut (bu migration'dan ÖNCE yazılmış) satırlar için gerçek bir versiyon
-- bilgisi YOKTUR — bunu icat etmek (ör. sessizce `'1.0.0'` atamak) YANLIŞ
-- bir kesinlik izlenimi verir. Bunun yerine AÇIKÇA `'unknown'` ile
-- işaretlenir (Mutlak Kural 4: "Hiçbir zaman bir riski sessizce kabul etme"
-- — burada risk, mevcut kayıtların hangi sürümle üretildiğinin
-- bilinmemesidir; kabul edilen tek şey BUNUN AÇIKÇA GÖRÜNÜR olmasıdır, veri
-- sessizce doğruymuş gibi davranılmaz). `DROP DEFAULT` ile YENİ satırların
-- HER ZAMAN uygulama kodundan gelen GERÇEK bir değerle yazılması zorunlu
-- kılınır (bkz. `PostgresRaceRepository.insertRaceRow`).
ALTER TABLE races
  ADD COLUMN weather_config_version TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE races
  ALTER COLUMN weather_config_version DROP DEFAULT;

COMMENT ON COLUMN races.weather_config_version IS 'config/weather.config.json içindeki "version" alanı — bu yarış hangi hava durumu denge sürümüyle simüle edildi (deterministic replay için, brief §58); race.config.json''ın engine/ruleset/config sürümlerinden (migration 0021) BAĞIMSIZDIR';
