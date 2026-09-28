-- YARIŞ YAŞAM DÖNGÜSÜ: `locking` DURUMU (brief §42 PHASE 1, 28.09.2026).
--
-- ## Neden yeni bir durum gerekiyor
--
-- `races.status` bugüne kadar yalnızca `scheduled → finished` (kesinleşme,
-- §13.14) ve `scheduled → cancelled` (yönetim iptali, §13.19) geçişlerini
-- yaşıyordu. İkisi de `startTime`'DAN BAĞIMSIZ, bir UÇ NOKTANIN çağırdığı
-- ("crank") geçişlerdi ve `startTime` geldiğinde hiçbir şey OTOMATİK
-- olmuyordu.
--
-- Bunun somut bedeli, `settle-race.use-case.ts` doc yorumunda dürüstçe
-- yazılı olan ADALETSİZLİKTİ: atın koştuğu andaki hâli (`horse_snapshot`)
-- ancak KESİNLEŞME anında yazılıyordu, o an ise `startTime`'dan saniyeler
-- ya da dakikalar sonra olabiliyordu. Yani bir oyuncu `startTime` ile
-- kesinleşme arasında atını eğitebiliyor/iyileştirebiliyor ve snapshot bu
-- YENİ hâli yakalıyordu.
--
-- `locking`, o boşluğu kapatır: `startTime` geldiğinde yarış `scheduled`dan
-- `locking`e geçer ve O AN'da (a) kadro donar, (b) simülasyon seed'i
-- üretilir, (c) her gerçek katılımcının snapshot'ı `race_entries.
-- horse_snapshot`'a YAZILIR. Kesinleşme artık DONDURULMUŞ veriyi kullanır.
--
-- ## `in_progress` NEDEN SİLİNMİYOR
--
-- Hiçbir kod yolu `in_progress` YAZMAZ (motor senkron koşar; "koşuyor"
-- diye gözlemlenebilir bir ara durum yoktur — `STARTING`/`RUNNING`/
-- `FINISHING`/`SETTLING` hepsi tek bir fonksiyon çağrısının içindedir).
-- Ama migration 0006'dan beri CHECK'te durur ve geçmiş bir satırda
-- bulunabilir. CHECK'ten çıkarmak var olan bir satırı geçersiz kılma
-- riskini taşır; bu yüzden KORUNUR ve `domain/race/race-lifecycle.ts`'te
-- "miras" olarak işaretlenir.
--
-- ## Neden `races_status_valid` adı veriliyor
--
-- 0006'daki CHECK satır-içi (inline) yazılmıştı, yani adını Postgres
-- üretmişti (`races_status_check`). Yeni kısıt AÇIK bir ad alır: bundan
-- sonraki bir migration onu adıyla düşürebilsin diye. Düşürme `IF EXISTS`
-- ile yapılır — ad varsayımı yanlış olsa bile migration patlamaz.
ALTER TABLE races DROP CONSTRAINT IF EXISTS races_status_check;

ALTER TABLE races
  ADD CONSTRAINT races_status_valid
  CHECK (status IN ('scheduled', 'locking', 'in_progress', 'finished', 'cancelled'));

COMMENT ON COLUMN races.status IS
  'Yarış yaşam döngüsü (migration 0042). scheduled = lobi açık; locking = startTime geldi, kadro+seed+snapshot DONDURULDU; finished = koştu ve ödüller dağıtıldı; cancelled = iptal + iade. in_progress HİÇ YAZILMAZ (miras, 0006).';
