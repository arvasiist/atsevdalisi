-- 15.10.2026 — ZAMANLA TOPARLANMA (S3, `docs/OYUN_DONGUSU_DENETIMI.md` B2/B3).
-- Toparlanma zamanlayıcısı her turda geçen süre kadar enerji ekler, yorgunluk
-- düşer; geçen süre bu damgadan ölçülür. Mevcut atlar ŞİMDİ damgasıyla
-- başlar (geçmişe dönük bedava toparlanma yazılmaz). Kısmi indeks yalnızca
-- toparlanacak (dolu olmayan) atları tarar.
ALTER TABLE horses ADD COLUMN vitals_recovered_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX horses_recovery_due_idx ON horses (vitals_recovered_at)
  WHERE status <> 'retired' AND (energy < 100 OR fatigue > 0);
