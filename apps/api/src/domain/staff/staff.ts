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
import {
  StaffAlreadyHiredError,
  StaffContractExpiredError,
  StaffRenewalNotDueError,
  StaffRoleNotHireableError,
} from './errors';

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
export function calculateStaffBonusMultiplier(
  staff: Pick<Staff, 'role' | 'skill' | 'morale'> & { specialization?: string | null },
  config: StaffConfig,
  /** 17.10.2026 — antrenörde antrenman tipi (verilmezse uzmanlık uygulanmaz: genel görünüm). */
  focus?: string | null,
): number {
  const maxBonus = config.maxBonusMultiplierByRole[staff.role] ?? 0;
  const rawBonus = (staff.skill / 100) * maxBonus;
  const effectiveBonus =
    staff.morale < config.moraleSalaryPenaltyThreshold ? rawBonus * config.lowMoraleBonusPenaltyMultiplier : rawBonus;
  const specialty = staff.role === 'trainer' ? trainerSpecialtyFactor(staff.specialization ?? null, focus, config) : 1;
  return 1 + effectiveBonus * specialty;
}

/**
 * 17.10.2026 (brief §13 "uzmanlıklar") — antrenörün bonus PAYINA uygulanan
 * uzmanlık çarpanı. Uzmanlığı olmayan (genel; 17.10.2026 öncesi bütün
 * antrenörler) ya da tipi bilinmeyen çağrı ×1 — eski davranış BİREBİR.
 */
export function trainerSpecialtyFactor(
  specialization: string | null,
  focus: string | null | undefined,
  config: StaffConfig,
): number {
  if (specialization === null || focus === null || focus === undefined) return 1;
  return specialization === focus ? config.trainer.matchBonusFactor : config.trainer.offSpecialtyBonusFactor;
}

/**
 * 17.10.2026 (brief §13 "geliştirme") — antrenörün bir seanstan sonraki hâli:
 * deneyim +1; her `experiencePerSkillPoint` seansta beceri +1, en fazla
 * `maxDevelopedSkill` (tavanı zaten aşmış beceri düşmez). Saf; SQL'deki atomik
 * güncelleme (`recordTrainerSession`) BU kuralın aynısıdır (`staff.spec.ts`).
 */
export function developTrainer(
  staff: Pick<Staff, 'skill' | 'experience'>,
  config: StaffConfig,
): Pick<Staff, 'skill' | 'experience'> {
  const experience = staff.experience + 1;
  const levelUp = experience % config.trainer.experiencePerSkillPoint === 0 && staff.skill < config.trainer.maxDevelopedSkill;
  return { experience, skill: levelUp ? Math.min(staff.skill + 1, config.trainer.maxDevelopedSkill) : staff.skill };
}

/** Antrenörün bir sonraki beceri artışına kalan seans; tavanda ya da diğer rollerde `null`. */
export function sessionsToNextSkill(
  staff: Pick<Staff, 'role' | 'skill' | 'experience'>,
  config: StaffConfig,
): number | null {
  if (staff.role !== 'trainer' || staff.skill >= config.trainer.maxDevelopedSkill) return null;
  const step = config.trainer.experiencePerSkillPoint;
  return step - (staff.experience % step);
}

/** Açılış denetimi: uzmanlıklar gerçek antrenman tipleri (dinlenme hariç), çarpanlar tutarlı. */
export function validateTrainerConfig(config: StaffConfig, trainingTypes: readonly string[]): string[] {
  const problems: string[] = [];
  const trainer = config.trainer;
  const seen = new Set<string>();
  for (const key of trainer.specializations) {
    if (key === 'rest' || !trainingTypes.includes(key)) problems.push(`uzmanlık "${key}" bir antrenman tipi değil.`);
    if (seen.has(key)) problems.push(`uzmanlık "${key}" tekrar ediyor.`);
    seen.add(key);
  }
  if (trainer.specializations.length === 0) problems.push('uzmanlık listesi boş.');
  if (!(trainer.matchBonusFactor >= 1)) problems.push('matchBonusFactor ≥ 1 olmalı.');
  if (!(trainer.offSpecialtyBonusFactor > 0 && trainer.offSpecialtyBonusFactor <= 1)) {
    problems.push('offSpecialtyBonusFactor (0, 1] aralığında olmalı.');
  }
  if (!Number.isInteger(trainer.experiencePerSkillPoint) || trainer.experiencePerSkillPoint < 1) {
    problems.push('experiencePerSkillPoint pozitif tam sayı olmalı.');
  }
  if (!Number.isInteger(trainer.maxDevelopedSkill) || trainer.maxDevelopedSkill < 0 || trainer.maxDevelopedSkill > 100) {
    problems.push('maxDevelopedSkill 0–100 arası tam sayı olmalı.');
  }
  return problems;
}

/** Bu ayki maaş borcu (brief §31 gider kalemi "Personel"). */
export function calculateMonthlySalaryDue(staff: Pick<Staff, 'salary'>): number {
  return staff.salary;
}

// ---------------------------------------------------------------------------
// 01.10.2026 — kiralama/sözleşme/etki BAĞLANDI. Sözleşme PEŞİN ödenir
// (`contractMonths` ay); süresi dolan personel bonus VERMEZ. Aylık borç ve
// zamanlayıcı yoktur — "ödenmemiş maaş" diye bir durum oluşamaz.
// ---------------------------------------------------------------------------

/** Pazarda yalnızca etkisi oyuna bağlı roller kiralanır. */
export function assertHireableRole(role: string, config: StaffConfig): asserts role is StaffRole {
  if (!config.hireableRoles.includes(role)) {
    throw new StaffRoleNotHireableError(role);
  }
}

/** Sözleşme bitişi; süresiz sözleşmede `null`. */
export function contractEndsAt(contract: StaffContract): Date | null {
  if (contract.durationMonths === null) {
    return null;
  }
  const end = new Date(contract.startedAt);
  end.setMonth(end.getMonth() + contract.durationMonths);
  return end;
}

/** Bir sözleşme döneminin peşin bedeli. */
export function calculateContractCost(staff: Pick<Staff, 'salary'>, config: StaffConfig): number {
  return calculateMonthlySalaryDue(staff) * config.contractMonths;
}

/** Yenileme açık mı: süresi dolmuş ya da bitime `renewWindowDays` veya daha az kalmış. */
export function isContractRenewable(contract: StaffContract, config: StaffConfig, now: Date = new Date()): boolean {
  const end = contractEndsAt(contract);
  if (end === null) {
    return false;
  }
  const windowMs = config.renewWindowDays * 24 * 60 * 60 * 1000;
  return end.getTime() - now.getTime() <= windowMs;
}

/**
 * Sözleşmeyi bir dönem uzatır. Süresi DOLMUŞSA yeni dönem `now`dan başlar
 * (ölü günler için ödeme alınmaz); dolmamışsa mevcut bitişe eklenir.
 * Pencere dışında `StaffRenewalNotDueError` — ikinci bir basış (çift
 * tıklama) bu yüzden ikinci kez ödeme alamaz.
 */
export function renewContract(contract: StaffContract, config: StaffConfig, now: Date = new Date()): StaffContract {
  if (!isContractRenewable(contract, config, now)) {
    throw new StaffRenewalNotDueError(config.renewWindowDays);
  }
  if (isContractExpired(contract, now)) {
    return { startedAt: now.toISOString(), durationMonths: config.contractMonths };
  }
  return { startedAt: contract.startedAt, durationMonths: (contract.durationMonths ?? 0) + config.contractMonths };
}

/**
 * Bir role ait EN İYİ etkin personelin çarpanı; yoksa 1 (nötr). Aynı rolden
 * iki personel bonusları TOPLAMAZ — en iyisi geçerlidir (brief §32
 * "Bonuslar kontrollü olmalıdır").
 */
export function bestActiveStaffMultiplier(
  staffList: ReadonlyArray<Pick<Staff, 'role' | 'skill' | 'morale' | 'contract'> & { specialization?: string | null }>,
  role: StaffRole,
  config: StaffConfig,
  now: Date = new Date(),
  focus?: string | null,
): number {
  return bestActiveStaff(staffList, role, config, now, focus)?.multiplier ?? 1;
}

/**
 * 17.10.2026 — en iyi ETKİN personel ve çarpanı (antrenörde antrenman tipine
 * göre: uzmanlık hangi antrenörün "en iyi" olduğunu değiştirebilir). Yoksa
 * `null`. Eşitlikte listedeki ilk personel (deterministik).
 */
export function bestActiveStaff<T extends Pick<Staff, 'role' | 'skill' | 'morale' | 'contract'> & { specialization?: string | null }>(
  staffList: ReadonlyArray<T>,
  role: StaffRole,
  config: StaffConfig,
  now: Date = new Date(),
  focus?: string | null,
): { staff: T; multiplier: number } | null {
  let best: { staff: T; multiplier: number } | null = null;
  for (const staff of staffList) {
    if (staff.role === role && !isContractExpired(staff.contract, now)) {
      const multiplier = calculateStaffBonusMultiplier(staff, config, focus);
      if (best === null || multiplier > best.multiplier) best = { staff, multiplier };
    }
  }
  return best;
}
