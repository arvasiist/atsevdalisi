# domain/stable

Ahır sistemi (brief §32 temel kapasite, §38 "Ahır Özeti", §39 Ahır Ekranı).

- `stable.ts` — `getStableCapacity` (seviyeye göre at kapasitesi),
  `canAddHorseToStable`/`assertCanAddHorseToStable` (`StableCapacityExceededError`),
  `summarizeStable` (at sayısı, ortalama kondisyon, sağlık uyarıları).
- `errors.ts` — `StableCapacityExceededError`.

**Kapsam dışı (FAZ 4'e bırakıldı):** Paddock/veteriner merkezi/nalbant
alanı/üreme merkezi/depo/personel binası gibi tam Çiftlik (Farm) bina
sistemi (brief §32 sonu) — bkz. `docs/ROADMAP.md`.

Testler: `apps/api/test/domain/stable/stable.spec.ts`.
