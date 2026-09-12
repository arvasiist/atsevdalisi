# domain/breeding

Yetiştiricilik ve Kalıtım Sistemi (brief §28-29, §34, §86 — bkz.
`docs/GENETICS.md` tam tasarım dokümanı, formüller `docs/ALGORITHMS.md`
§10). Bu klasör GENETICS.md §1'deki "Genetic Engine" konumudur.

- `genetics.ts` — saf kalıtım matematiği: `generateInheritanceSplit`,
  `calculateMutation`, `calculateChildStat`, `calculateChildPotential`.
  At/pedigree kavramı bilmez, sadece sayı üretir.
- `pedigree.ts` — `collectKnownAncestorIds`/`checkInbreeding` (2 nesil
  derinliğinde ortak ata tespiti — brief'te açıkça yazılmamış ama
  GENETICS.md §6'da gerekli görülen bir kontrol), `calculateParentAgeFactor`
  (yaşam evresi bazlı, `domain/horse/age-curve.ts` ile entegre),
  `calculateParentHealthFactor`, `calculateBirthHealthRisk`,
  `createFoalPedigree`.
- `breeding.ts` — orkestrasyon: `assertBreedingEligibility` (yaş/cooldown/
  sağlık/cinsiyet kontrolü, `NotEligibleForBreedingError`),
  `calculateStudFee`, `breedHorses` (tam akış: Mare+Stallion → kalıtım →
  mutasyon → sağlık kontrolü → tay statları/potansiyeli/soy kaydı).
- `errors.ts` — `NotEligibleForBreedingError`.

Config: `genetics.config.json` (inheritanceRange, mutationBounds,
maxPotentialGainOverParents, inbreedingRiskMultiplier,
parentAgeRiskMultipliers, healthRiskWeight, baseBirthHealthRisk,
minBreedingAgeMonths, maxBreedingAgeMonths, breedingCooldownDays,
studFeeMultiplier).

Gizlilik prensibi (brief §29, GENETICS.md §2): oyuncuya tam DNA verisi
gösterilmez; `breedHorses` sonucu (gerçek tay statları) doğrudan
istemciye açılmamalı, kademeli keşif (scout/veteriner raporları, FAZ 3+)
üzerinden gösterilmelidir — bu, application/DTO katmanının sorumluluğudur.

Testler: `apps/api/test/domain/breeding/genetics.spec.ts`,
`apps/api/test/domain/breeding/pedigree.spec.ts`,
`apps/api/test/domain/breeding/breeding.spec.ts`.
