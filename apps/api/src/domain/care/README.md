# domain/care

Bakım sistemi (brief §11-12): Tımar, Su, Temizlik, Veteriner, Nalbant,
Dinlendir + Beslenme.

- `care.ts` — `applyCareAction` (cooldown kontrolü,
  `CareActionOnCooldownError`), `applyFeed` (yem türüne göre farklı
  etkiler — "daha pahalı yem = daha iyi" garantisi yoktur, brief §12),
  `canPerformCareAction`, `getCareActionCost`/`getFeedCost`.
- `errors.ts` — `CareActionOnCooldownError`.

Tüm etkiler/maliyetler `config/care.config.json`'dan gelir.

Testler: `apps/api/test/domain/care/care.spec.ts`.
