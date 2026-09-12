# domain/staff

Personel Sistemi (brief §33) — `jockey` rolü HARİÇTİR (bkz.
`packages/shared-types/src/staff.ts` başındaki tasarım notu; jokeyler
`domain/jockey/` altında kendi zengin veri modeliyle yönetilir).

- `staff.ts` — `createStaffCandidate` (piyasadaki aday, role özgü taban
  maaş + beceri), `calculateBaseSalary`, `hireStaff`/
  `assertStaffAvailableForHire`, `isContractExpired`/`assertContractActive`,
  `calculateStaffBonusMultiplier` (düşük moralde zayıflayan, rol başına
  üst sınırlı bir bonus çarpanı — brief §32 "Bonuslar kontrollü olmalıdır"),
  `calculateMonthlySalaryDue`.
- `errors.ts` — `StaffAlreadyHiredError`, `StaffContractExpiredError`.

Config: `staff.config.json`.

**Kapsam dışı:** `calculateStaffBonusMultiplier`'ın hangi formüle
uygulanacağı (örn. antrenörün `training.config.json`'daki `baseGain`'i mi
etkileyeceği, veterinerin `care.config.json`'daki `injuryRiskDelta`'yı mı
güçlendireceği) rol bazlı bir wiring kararıdır ve bu teslimatın kapsamı
dışında bırakılmıştır — mevcut, zaten test edilmiş Training/Care
modüllerini değiştirmeden, genel bonus hesaplamasını hazır tutar.

Testler: `apps/api/test/domain/staff/staff.spec.ts`.
