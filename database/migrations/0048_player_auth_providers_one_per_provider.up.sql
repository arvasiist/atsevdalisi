-- 01.10.2026 — GOOGLE HESABI BAĞLAMA (misafir → Google).
--
-- Bir oyuncu her sağlayıcıdan EN FAZLA BİR kimlik bağlayabilir. Önceden bu
-- kural gerekmiyordu: bağlantıyı yalnızca `POST /auth/login` (yeni oyuncu
-- oluştururken) yazıyordu. `POST /auth/link` ile mevcut oyuncuya bağlantı
-- eklenebildiği için, eşzamanlı iki bağlama isteğinin aynı oyuncuya iki
-- farklı Google hesabı yazmasını kısıt engeller (uygulamadaki ön kontrol
-- TOCTOU'ya açıktır; kısıt değildir).
ALTER TABLE player_auth_providers
  ADD CONSTRAINT player_auth_providers_player_provider_uq UNIQUE (player_id, provider);
