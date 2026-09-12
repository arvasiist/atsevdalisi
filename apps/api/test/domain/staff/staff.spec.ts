import { describe, expect, it } from 'vitest';
import {
  assertContractActive,
  calculateBaseSalary,
  calculateMonthlySalaryDue,
  calculateStaffBonusMultiplier,
  createStaffCandidate,
  hireStaff,
  isContractExpired,
} from '../../../src/domain/staff/staff';
import { StaffAlreadyHiredError, StaffContractExpiredError } from '../../../src/domain/staff/errors';
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
