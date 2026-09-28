-- YÖNETİM (ADMIN) ROLÜ + DENETİM GÜNLÜĞÜ — brief §34, §42 PHASE 15-B.
--
-- brief §34 iki şey ister: (a) yöneticinin kullanıcı/yarış/işlem/cüzdan/
-- hediye/şikâyet listelerini GÖREBİLMESİ, (b) "Finansal işlemler audit
-- log'a yazılmalı". Bu dilim ikisinin ORTAK TEMELİNİ kurar: rolü ve
-- denetim günlüğünü. Şikâyet kuyruğu (§33'te `status` alanı hazır
-- bırakılmıştı) bu temelin ÜZERİNE oturan İLK yönetim ekranıdır —
-- çünkü §34'ün saydığı yedi listeden tek HAZIR VERİSİ olan odur.
--
-- **ROL NEDEN `players.is_admin` KOLONU:** ayrı bir `roles` tablosu +
-- `player_roles` çoktan çok ilişkisi, bugün TEK bir rol (yönetici) için
-- ödenecek bir karmaşıklıktır ve "rol" kavramını, sorgulanması gereken
-- bir VERİ hâline getirir (her okuma JOIN ister). İkinci bir rol
-- (örn. moderatör) gerçekten gerekirse o zaman tabloya geçilir; bugün
-- `is_admin` tek bir doğruluk kaynağıdır ve `AdminRepository.isAdmin`
-- onu TEK sorguda okur.
--
-- **ROL TOKEN'A GÖMÜLMEZ.** `assertAdmin` her istekte bu kolonu
-- OKUR: yetkisi alınan bir yönetici, elindeki geçerli token'la erişmeye
-- devam EDEMEZ. Rol JWT'ye konsaydı, iptal ancak token süresi dolunca
-- (ya da token sürümü/iptal listesi gibi AYRI bir altyapı kurulunca)
-- etki ederdi — yönetim yetkisi için kabul edilemez bir gecikme.
ALTER TABLE players
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN players.is_admin IS 'Yönetici mi (brief §34). Token''a GÖMÜLMEZ — her istekte tazelenir, böylece yetki iptali ANINDA etki eder.';

-- Yönetim işlemlerinin DENETİM GÜNLÜĞÜ (brief §34 "Finansal işlemler
-- audit log'a yazılmalı").
--
-- **`economy_transactions` İLE KARIŞTIRILMAMALIDIR.** O tablo bir
-- MUHASEBE defteridir: her satır bir BAKİYE HAREKETİdir ve
-- `balance_before`/`balance_after` taşır. Bu tablo ise bir YETKİ
-- kaydıdır: "kim, hangi yönetim işlemini, ne zaman yaptı". Bir yönetici
-- bir şikâyeti kapatırsa para hareket ETMEZ ama burada bir satır OLUR;
-- tersine, bir oyuncu hediye gönderirse deftere satır olur ama burası
-- BOŞ kalır. İkisini birleştirmek, defteri "yönetici eylemleriyle
-- kirlenmiş bir bakiye tablosu"na çevirirdi ve defterin tek işi olan
-- "bakiyeyi satır satır açıklama" özelliğini bozardı.
--
-- **PARA YOLU DEĞİLDİR.** Bu tabloya yazmak bir transaction'ın
-- parçasıdır (şikâyet güncellemesiyle AYNI tx) ama `economy_transactions`
-- gibi `FOR UPDATE` kilidi gerektirmez: denetim kayıtları YALNIZCA
-- EKLENİR, hiç okunup değiştirilmez, dolayısıyla yarışan iki yazma
-- birbirini bozamaz.
CREATE TABLE admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- `ON DELETE RESTRICT` — bilinçli. Denetim kaydının, denetlenen
  -- kişinin silinmesiyle YOK OLMASI, denetimin tanımına aykırıdır
  -- (CASCADE olsaydı bir yönetici hesabı silindiğinde tüm eylem geçmişi
  -- birlikte silinirdi). SET NULL da yeterli değildir: "kim yaptı"
  -- sorusu denetimin ANA sorusudur, cevapsız kalamaz. Bu yüzden yönetici
  -- hesabı, kaydı olan bir satır varken silinemez — silme gerekirse
  -- önce bu satırların AKIBETİ açıkça kararlaştırılmalıdır.
  admin_id    UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,

  -- SERBEST METİN, CHECK YOK — bilinçli (bkz. `AdminAuditLogView` doc
  -- yorumu): her yeni yönetim işlemi kendi eylem adını getirir ve her
  -- seferinde migration yazmak denetime hizmet etmez. Kapalı küme
  -- yalnızca DAVRANIŞI kısıtlaması gereken yerlerde (şikâyet durumu)
  -- vardır.
  action      TEXT NOT NULL,

  -- Hedef satırın TÜRÜ ve KİMLİĞİ. `target_id`'ye FK YOKTUR: hedef
  -- (örn. bir şikâyet kaydı) silinebilir ve o zaman denetim kaydının da
  -- silinmesi gerekmez — "o anda ne oldu" bilgisi kendi başına
  -- anlamlıdır. Tür ayrı bir kolondur çünkü kimlikler tablolar arasında
  -- BENZERSİZDİR ama bu tablo tek bir hedef tablosuna bağlı değildir.
  target_type TEXT NOT NULL,
  target_id   UUID,

  -- Eyleme özgü ayrıntı (örn. `{"from":"open","to":"resolved"}`).
  -- JSONB, çünkü her eylem farklı bir gövde taşır ve her biri için
  -- ayrı kolon açmak tabloyu seyrekleştirirdi. `NOT NULL DEFAULT '{}'`
  -- — ayrıntısız bir eylem de geçerlidir, `NULL` ile "ayrıntı yok"
  -- arasındaki farkı sorgulamak zorunda kalmayalım.
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE admin_audit_log IS 'Yönetim eylemlerinin denetim günlüğü (brief §34). `economy_transactions` ile KARIŞTIRILMAMALIDIR: o bir muhasebe defteridir (bakiye hareketi), bu bir YETKİ kaydıdır.';

-- "Bu yönetici ne yaptı" — hesap bazlı denetim sorgusu.
CREATE INDEX idx_admin_audit_log_admin ON admin_audit_log (admin_id, created_at DESC);
-- "Bu kayda ne oldu" — hedef bazlı denetim sorgusu.
CREATE INDEX idx_admin_audit_log_target ON admin_audit_log (target_type, target_id, created_at DESC);

-- ŞİKÂYET KUYRUĞUNUN ELE ALINMA İZLERİ (brief §34 "Reports").
--
-- Migration 0040'ta `status` bilinçli olarak yalnızca `'open'` yazılıyordu
-- ve geçişlerin "yönetim paneli diliminde geleceği" not düşülmüştü. Bu
-- dilim o notu KAPATIR.
--
-- **NEDEN İKİ AYRI KOLON:** `status` NE olduğunu, `reviewed_by`/`reviewed_at`
-- KİM ve NE ZAMAN yaptığını söyler. `status`'tan "kim" türetilemez —
-- `reviewing` durumundaki bir kaydı kimin aldığı ayrı bir bilgidir.
--
-- `ON DELETE SET NULL`: bir yönetici hesabı silinirse şikâyet kaydı
-- DURMALIDIR (silinmesi moderasyon geçmişini yok ederdi); yalnızca
-- "kim ele aldı" bilgisi boşalır. Denetim günlüğündeki `RESTRICT`'ten
-- FARKLI olması bilinçlidir: orada kaydın KENDİSİ yöneticiye bağlıdır,
-- burada ise kayıt şikâyete bağlıdır ve yönetici yalnızca bir
-- DEĞİŞKENDİR.
ALTER TABLE player_reports
  ADD COLUMN reviewed_by UUID REFERENCES players(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN player_reports.reviewed_by IS 'Şikâyeti en son ele alan yönetici (brief §34). `status`''tan TÜRETİLEMEZ — ayrı bir bilgidir.';
COMMENT ON COLUMN player_reports.reviewed_at IS 'Durumun en son değiştiği an. Şikâyet kaydı hiç ele alınmadıysa NULL.';

-- BAYATLAYAN KOLON NOTU DÜZELTİLİR.
--
-- Migration 0040 `status` için "Şu an yalnızca 'open' yazılır; geçişler
-- yönetim paneli diliminde gelecek." diyordu. Bu dilim o geçişleri
-- GETİRDİ, yani not ARTIK YANLIŞ. 0040 dosyası DEĞİŞTİRİLMEZ (uygulanmış
-- bir migration'ın içeriğini değiştirmek, onu bir kez koşmuş ortamlarda
-- sessizce farklı bir şemaya işaret eder); düzeltme, notu ÜZERİNE yazan
-- bu yeni migration'la yapılır.
COMMENT ON COLUMN player_reports.status IS 'Moderasyon kuyruğu durumu (brief §34): open → reviewing → {resolved, dismissed}; open''dan doğrudan kapanışa da geçilebilir. resolved/dismissed ÇIKIŞSIZDIR. Geçiş çizgesinin tek kaynağı domain/admin/moderation-queue.ts REPORT_STATUS_TRANSITIONS, doğrulandığı yer UpdateReportStatusUseCase (kilit altında).';
