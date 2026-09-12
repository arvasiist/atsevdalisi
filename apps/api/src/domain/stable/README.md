# domain/stable

Ahır sistemi (brief §32 temel kapasite + yükseltme, §38 "Ahır Özeti", §39 Ahır Ekranı).

- `stable.ts` — `getStableCapacity` (seviyeye göre at kapasitesi),
  `canAddHorseToStable`/`assertCanAddHorseToStable` (`StableCapacityExceededError`),
  `summarizeStable` (at sayısı, ortalama kondisyon, sağlık uyarıları),
  `getNextStableUpgradeCost` (FAZ 2 — bir sonraki seviyenin maliyeti,
  `MaxStableLevelReachedError`), `getMaxDefinedStableLevel`.
- `errors.ts` — `StableCapacityExceededError`, `MaxStableLevelReachedError`.

**Kapsam dışı (FAZ 4'e bırakıldı):** Paddock/veteriner merkezi/nalbant
alanı/üreme merkezi/depo/personel binası gibi tam Çiftlik (Farm) bina
sistemi (brief §32 sonu) — bkz. `docs/ROADMAP.md`. FAZ 2 kapsamı yalnızca
seviye/kapasite yükseltmedir.

Testler: `apps/api/test/domain/stable/stable.spec.ts`.
