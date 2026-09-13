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
Wiring: `apps/api/src/application/use-cases/upgrade-stable.use-case.ts`
(FAZ 1 wiring, altıncı dilim — `getNextStableUpgradeCost`'u
`domain/economy/wallet.ts`'in `debit`'iyle birleştirir, bkz.
`apps/api/src/api/stable/`).

## FAZ 1 wiring, onuncu dilim — Idempotency-Key sertleştirmesi (bu oturum)

Domain katmanında bir değişiklik YOK — bu tamamen bir API katmanı
konusu: `StableController.upgradeStable`'a
`@UseInterceptors(IdempotencyInterceptor)` eklendi (bkz.
`api/idempotency/idempotency.interceptor.ts`), dokuzuncu dilimde
Pratik Yarış için bağlanan Idempotency-Key/Redis altyapısının İKİNCİ
kullanıcısı. Bu, Ahır Yükseltme'nin (projenin PARA değiştiren İLK
use-case'i) dokuzuncu dilime kadar bilinçli olarak açık bırakılan tek
güvenlik eksiğini kapatır.
