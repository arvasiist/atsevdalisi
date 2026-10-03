-- 02.10.2026 — HESAP SİLME (Faz 1-B.3).
--
-- Oyuncu satırı FİZİKSEL OLARAK SİLİNEMEZ: `economy_transactions`
-- değiştirilemezdir (0038 tetikleyicisi DELETE'i reddeder; CASCADE de bir
-- DELETE'tir), `pvp_matches` ve `admin_audit_log` silmeyi kısıtlar. Bu
-- yüzden silme = KİŞİSEL VERİNİN silinmesi + oyuncunun ANONİMLEŞTİRİLMESİ:
-- kullanıcı adı/görünen ad/avatar silinir, e-posta/şifre/Google kimliği,
-- mesajlar, sohbet, bildirimler ve oturumlar kaldırılır; defter ve yarış
-- geçmişi tutarlı kalır. `deleted_at` dolu satır giriş yapamaz, listelenmez.

ALTER TABLE players ADD COLUMN deleted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN players.deleted_at IS 'Hesap silme anı (02.10.2026). Doluysa satır anonimdir; oturum açamaz, sıralamada/profilde görünmez. Defter bütünlüğü için satır silinmez.';
