import { describe, expect, it } from 'vitest';
import {
  assertContractActive,
  calculateBaseSalary,
  calculateMonthlySalaryDue,
  calculateStaffBonusMultiplier,
  createStaffCandidate,
  hireStaff,
  isContractExpired,
  assertHireableRole,
  bestActiveStaffMultiplier,
  calculateContractCost,
  contractEndsAt,
  isContractRenewable,
  renewContract,
} from '../../../src/domain/staff/staff';
import {
  StaffAlreadyHiredError,
  StaffContractExpiredError,
  StaffRenewalNotDueError,
  StaffRoleNotHireableError,
} from '../../../src/domain/staff/errors';
import staffConfigJson from '../../../../../config/staff.config.json';
import type { StaffConfig } from '@at-sevdalisi/game-config';

const config = staffConfigJson as unknown as StaffConfig;

/** brief §33 Personel Sistemi. */
describe('createStaffCandidate / calculateBaseSalary', () => {
  it('maaşı role özgü taban + beceri katsayısına göre hesaplar', () => {
    const candidate = createStaffCandidate({ id: 's1', role: 'vet', name: 'Test Vet', skill: 80 }, config);
    expect(candidate.ownerId).toBeNull();
    expect(candidate.salary).toBe(calculateBaseSalary('vet', 80, config));
    expect(candidate.morale).toBe(100);
  });

  it('daha yetenekli personel daha yüksek maaş alır', () => {
    expect(calculateBaseSalary('trainer', 90, config)).toBeGreaterThan(calculateBaseSalary('trainer', 30, config));
  });
});

describe('hireStaff', () => {
  it('sahipsiz bir personeli kiralar', () => {
    const candidate = createStaffCandidate({ id: 's1', role: 'scout', name: 'Test Scout', skill: 60 }, config);
    const hired = hireStaff(candidate, 'player-1', new Date('2026-01-01T00:00:00Z'));
    expect(hired.ownerId).toBe('player-1');
  });

  it('zaten kiralanmış personeli tekrar kiralamaya çalışırsa hata fırlatır', () => {
    const candidate = createStaffCandidate({ id: 's1', role: 'scout', name: 'Test Scout', skill: 60 }, config);
    const hired = hireStaff(candidate, 'player-1');
    expect(() => hireStaff(hired, 'player-2')).toThrow(StaffAlreadyHiredError);
  });
});

describe('isContractExpired / assertContractActive', () => {
  it('süreli sözleşme süresi dolunca expired sayılır', () => {
    const contract = { startedAt: '2026-01-01T00:00:00Z', durationMonths: 3 };
    expect(isContractExpired(contract, new Date('2026-02-01T00:00:00Z'))).toBe(false);
    expect(isContractExpired(contract, new Date('2026-05-01T00:00:00Z'))).toBe(true);
  });

  it('süresiz sözleşme (durationMonths: null) asla dolmaz', () => {
    const contract = { startedAt: '2026-01-01T00:00:00Z', durationMonths: null };
    expect(isContractExpired(contract, new Date('2099-01-01T00:00:00Z'))).toBe(false);
  });

  it('süresi dolmuş sözleşme için assertContractActive hata fırlatır', () => {
    const candidate = createStaffCandidate({ id: 's1', role: 'vet', name: 'Test', skill: 50, contractDurationMonths: 1 }, config);
    const hired = { ...hireStaff(candidate, 'player-1', new Date('2026-01-01T00:00:00Z')) };
    expect(() => assertContractActive(hired, new Date('2026-06-01T00:00:00Z'))).toThrow(StaffContractExpiredError);
  });
});

describe('calculateStaffBonusMultiplier', () => {
  it('düşük moral bonusu zayıflatır', () => {
    const highMorale = calculateStaffBonusMultiplier({ role: 'vet', skill: 100, morale: 100 }, config);
    const lowMorale = calculateStaffBonusMultiplier({ role: 'vet', skill: 100, morale: 10 }, config);
    expect(highMorale).toBeGreaterThan(lowMorale);
  });

  it('bonus hiçbir zaman role özgü üst sınırı aşmaz', () => {
    const maxBonus = calculateStaffBonusMultiplier({ role: 'scout', skill: 100, morale: 100 }, config);
    expect(maxBonus).toBeLessThanOrEqual(1 + config.maxBonusMultiplierByRole['scout']! + 1e-9);
  });
});

describe('calculateMonthlySalaryDue', () => {
  it('personelin aylık maaşını döner', () => {
    expect(calculateMonthlySalaryDue({ salary: 750 })).toBe(750);
  });
});

describe('sözleşme + etki (01.10.2026)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date('2026-10-01T12:00:00Z');
  const contractFrom = (start: Date) => ({ startedAt: start.toISOString(), durationMonths: config.contractMonths });

  it('kiralanabilir roller config\'ten; diğerleri reddedilir', () => {
    for (const role of config.hireableRoles) {
      expect(() => assertHireableRole(role, config)).not.toThrow();
    }
    expect(() => assertHireableRole('scout', config)).toThrow(StaffRoleNotHireableError);
  });

  it('sözleşme bedeli = maaş × contractMonths; süresizin bitişi yok', () => {
    expect(calculateContractCost({ salary: 900 }, config)).toBe(900 * config.contractMonths);
    expect(contractEndsAt({ startedAt: now.toISOString(), durationMonths: null })).toBeNull();
  });

  it('yenileme penceresi: erken kapalı, bitime yakın açık, bitmiş açık', () => {
    const fresh = contractFrom(now);
    expect(isContractRenewable(fresh, config, now)).toBe(false);
    expect(() => renewContract(fresh, config, now)).toThrow(StaffRenewalNotDueError);

    const end = contractEndsAt(fresh) as Date;
    const nearEnd = new Date(end.getTime() - (config.renewWindowDays - 1) * DAY);
    expect(isContractRenewable(fresh, config, nearEnd)).toBe(true);
    const extended = renewContract(fresh, config, nearEnd);
    expect(extended.startedAt).toBe(fresh.startedAt);
    expect(extended.durationMonths).toBe(config.contractMonths * 2);
    // Uzatılmış sözleşme artık pencere dışında — ikinci ödeme imkânsız.
    expect(isContractRenewable(extended, config, nearEnd)).toBe(false);

    const later = new Date(end.getTime() + 10 * DAY);
    const restarted = renewContract(fresh, config, later);
    expect(restarted).toEqual({ startedAt: later.toISOString(), durationMonths: config.contractMonths });
  });

  it('aynı rolden en iyi ETKİN personel geçerlidir; bonuslar toplanmaz; süresi dolan sayılmaz', () => {
    const active = contractFrom(now);
    const expired = contractFrom(new Date(now.getTime() - 400 * DAY));
    const staff = [
      { role: 'trainer' as const, skill: 40, morale: 100, contract: active },
      { role: 'trainer' as const, skill: 90, morale: 100, contract: active },
      { role: 'trainer' as const, skill: 100, morale: 100, contract: expired },
      { role: 'vet' as const, skill: 100, morale: 100, contract: active },
    ];
    expect(bestActiveStaffMultiplier(staff, 'trainer', config, now)).toBe(
      calculateStaffBonusMultiplier({ role: 'trainer', skill: 90, morale: 100 }, config),
    );
    expect(bestActiveStaffMultiplier(staff, 'groom', config, now)).toBe(1);
  });
});
