/**
 * Personel Sistemi (Staff) — brief §33. `jockey` rolü hariçtir (bkz.
 * `packages/shared-types/src/staff.ts` başındaki tasarım notu ve
 * `domain/jockey/`).
 *
 * Fonksiyonlar saftır; DB/zaman erişimi yoktur.
 */

import { clamp } from '@at-sevdalisi/shared-types';
import type { StaffConfig } from '@at-sevdalisi/game-config';
import type { Staff, StaffContract, StaffRole } from '@at-sevdalisi/shared-types';
import { StaffAlreadyHiredError, StaffContractExpiredError } from './errors';

export interface CreateStaffCandidateInput {
  id: string;
  role: StaffRole;
  name: string;
  skill: number; // 0-100
  specialization?: string | null;
  /** null = süresiz sözleşme teklifi. */
  contractDurationMonths?: number | null;
  now?: Date;
}

/**
 * Piyasadaki (henüz kiralanmamış) bir personel adayını oluşturur. Maaş,
 * role özgü bir taban ücret + beceri puanına göre hesaplanır (brief §33
 * "salary" alanı — sabit değil, `skill`'e bağlı olmalıdır; no-magic-number
 * kuralı gereği katsayılar `config/staff.config.json`'dadır).
 */
export function createStaffCandidate(input: CreateStaffCandidateInput, config: StaffConfig): Staff {
  const now = (input.now ?? new Date()).toISOString();
  const salary = calculateBaseSalary(input.role, input.skill, config);

  return {
    id: input.id,
    role: input.role,
    name: input.name,
    skill: clamp(input.skill, 0, 100),
    experience: 0,
    salary,
    specialization: input.specialization ?? null,
    morale: 100,
    contract: { startedAt: now, durationMonths: input.contractDurationMonths ?? null },
    ownerId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** salary = baseSalaryByRole[role] + skill × salaryPerSkillPoint. */
export function calculateBaseSalary(role: StaffRole, skill: number, config: StaffConfig): number {
  // `config.baseSalaryByRole` genel bir `Record<string, number>`dir (game-config
  // paketi shared-types'a bağımlı değildir, bkz. ARCHITECTURE.md paket ayrımı);
  // `staff.config.json`'da 7 rolün tümü tanımlıdır, bu yüzden `!` güvenlidir
  // (aynı desen `domain/stable/stable.ts`'te de kullanılmıştır).
  const baseSalary = config.baseSalaryByRole[role]!;
  return Math.round(baseSalary + skill * config.salaryPerSkillPoint);
}

/** Personel zaten bir oyuncuya aitse kiralanamaz. */
export function assertStaffAvailableForHire(staff: Pick<Staff, 'id' | 'ownerId'>): void {
  if (staff.ownerId !== null) {
    throw new StaffAlreadyHiredError(staff.id);
  }
}

/** Bir personeli kiralar — sözleşme bu andan itibaren başlar. */
export function hireStaff(staff: Staff, ownerId: string, now: Date = new Date()): Staff {
  assertStaffAvailableForHire(staff);
  return {
    ...staff,
    ownerId,
    contract: { ...staff.contract, startedAt: now.toISOString() },
    updatedAt: now.toISOString(),
  };
}

/** Sözleşme süresi dolmuş mu (durationMonths: null ise asla dolmaz). */
export function isContractExpired(contract: StaffContract, now: Date = new Date()): boolean {
  if (contract.durationMonths === null) {
    return false;
  }
  const start = new Date(contract.startedAt);
  const end = new Date(start);
  end.setMonth(end.getMonth() + contract.durationMonths);
  return now.getTime() >= end.getTime();
}

/** `isContractExpired` true ise `StaffContractExpiredError` fırlatan yardımcı. */
export function assertContractActive(staff: Pick<Staff, 'id' | 'contract'>, now: Date = new Date()): void {
  if (isContractExpired(staff.contract, now)) {
    throw new StaffContractExpiredError(staff.id);
  }
}

/**
 * Personelin verdiği bonus çarpanını hesaplar (brief §32 "Bonuslar
 * kontrollü olmalıdır"). Gerçek uygulanışı (hangi formüle çarpılacağı —
 * örn. training baseGain, care injuryRiskDelta) her rol için ayrı bir
 * wiring kararıdır ve bu domain'in kapsamı dışındadır; burada sadece
 * TEK bir genel [1, 1+maxBonus] çarpanı üretilir. Düşük moralde
 * (`moraleSalaryPenaltyThreshold` altı) bonus zayıflar.
 */
export function calculateStaffBonusMultiplier(staff: Pick<Staff, 'role' | 'skill' | 'morale'>, config: StaffConfig): number {
  const maxBonus = config.maxBonusMultiplierByRole[staff.role] ?? 0;
  const rawBonus = (staff.skill / 100) * maxBonus;
  const effectiveBonus =
    staff.morale < config.moraleSalaryPenaltyThreshold ? rawBonus * config.lowMoraleBonusPenaltyMultiplier : rawBonus;
  return 1 + effectiveBonus;
}

/** Bu ayki maaş borcu (brief §31 gider kalemi "Personel"). */
export function calculateMonthlySalaryDue(staff: Pick<Staff, 'salary'>): number {
  return staff.salary;
}
