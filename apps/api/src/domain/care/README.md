# domain/care

Bakım sistemi (brief §11-12): Tımar, Su, Temizlik, Veteriner, Nalbant,
Dinlendir + Beslenme.

- `care.ts` — `applyCareAction` (cooldown kontrolü,
  `CareActionOnCooldownError`), `applyFeed` (yem türüne göre farklı
  etkiler — "daha pahalı yem = daha iyi" garantisi yoktur, brief §12),
  `canPerformCareAction`, `getCareActionCost`/`getFeedCost`.
  FAZ 1 wiring, beşinci dilim: `getCareActionEffect`/`getFeedTypeEffect`
  eklendi — `config.actions[actionType]`/`config.feedTypes[feedType]`
  `undefined` dönerse `InvalidCareInputError` fırlatır (bkz.
  docs/ARCHITECTURE.md §9.1 Hata 7 — bu, Antrenman'da CI'ın bulduğu aynı
  sınıf hataya karşı BU DİLİMDE proaktif olarak, herhangi bir CI
  başarısızlığı olmadan uygulandı).
- `errors.ts` — `CareActionOnCooldownError`, `InvalidCareInputError`
  (FAZ 1 wiring, beşinci dilim).
- `validation.ts` (FAZ 1 wiring, beşinci dilim) — `POST /horses/:id/care`
  ve `POST /horses/:id/feed` DTO'ları için tek doğruluk kaynağı olan
  sabitler (`CARE_ACTION_TYPES`, `FEED_TYPES`).

Tüm etkiler/maliyetler `config/care.config.json`'dan gelir.

Testler: `apps/api/test/domain/care/care.spec.ts`.
Wiring: `apps/api/src/application/use-cases/perform-care-action.use-case.ts`,
`apps/api/src/application/use-cases/feed-horse.use-case.ts`,
`apps/api/src/api/care/`.
