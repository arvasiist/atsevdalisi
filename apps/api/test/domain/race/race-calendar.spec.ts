import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { describe, expect, it } from 'vitest';
import { validateRaceCreation } from '../../../src/domain/race/lobby';
import {
  calendarProgramToCreationInput,
  computeCalendarSlotTimes,
  validateCalendarPrograms,
} from '../../../src/domain/race/race-calendar';

const config = loadRaceLobbyConfig();
const MINUTE = 60_000;

describe('yarış takvimi — yuva hesabı (01.10.2026)', () => {
  const now = new Date(Date.UTC(2026, 9, 1, 12, 7, 30));

  it('yuvalar UTC çağından hizalı: k × aralık + ofset', () => {
    const slots = computeCalendarSlotTimes(
      now,
      { intervalMinutes: 30, offsetMinutes: 5 },
      { horizonHours: 2, minLeadMinutes: 0 },
    );
    expect(slots.map((slot) => slot.toISOString())).toEqual([
      '2026-10-01T12:35:00.000Z',
      '2026-10-01T13:05:00.000Z',
      '2026-10-01T13:35:00.000Z',
      '2026-10-01T14:05:00.000Z',
    ]);
  });

  it('başlangıcına minLead kadar zaman kalmayan yuva açılmaz; ufuk dahildir', () => {
    const at = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));
    const slots = computeCalendarSlotTimes(
      at,
      { intervalMinutes: 10, offsetMinutes: 0 },
      { horizonHours: 1, minLeadMinutes: 10 },
    );
    expect(slots[0]?.getTime()).toBe(at.getTime() + 10 * MINUTE); // tam sınır dahil
    expect(slots.at(-1)?.getTime()).toBe(at.getTime() + 60 * MINUTE); // ufuk dahil
    expect(slots).toHaveLength(6);
  });

  it('aynı `now` ile iki çağrı AYNI anları üretir (yeniden başlatma ikinci yarış açmaz)', () => {
    const rule = { intervalMinutes: 20, offsetMinutes: 5 };
    const window = { horizonHours: 3, minLeadMinutes: 10 };
    expect(computeCalendarSlotTimes(now, rule, window)).toEqual(
      computeCalendarSlotTimes(now, rule, window),
    );
  });

  it('gerçek config: program listesi yapısal olarak geçerli', () => {
    expect(validateCalendarPrograms(config.calendar)).toEqual([]);
    expect(config.calendar.programs.length).toBeGreaterThan(0);
  });

  it('gerçek config: HER programın HER yuvası oyuncunun yarış açma kuralından geçer', () => {
    for (const program of config.calendar.programs) {
      // Programın kendi ufku (yoksa genel); haftalık bir program 3 saatlik
      // pencerede yuva bulamayabilir — en az bir tam aralığı kapsayan pencere.
      const horizonHours = Math.max(program.horizonHours ?? config.calendar.horizonHours, program.intervalMinutes / 60);
      const slots = computeCalendarSlotTimes(now, program, { ...config.calendar, horizonHours });
      expect(slots.length, program.id).toBeGreaterThan(0);
      for (const slot of slots) {
        const { problems } = validateRaceCreation(
          calendarProgramToCreationInput(program, slot),
          config,
          now,
        );
        expect(problems, `${program.id} ${slot.toISOString()}`).toEqual([]);
      }
    }
  });

  it('bozuk program yakalanır: tekrar eden kimlik, aralık dışı ofset, boş pencere', () => {
    const base = config.calendar.programs[0]!;
    const problems = validateCalendarPrograms({
      ...config.calendar,
      horizonHours: 0,
      programs: [base, { ...base }, { ...base, id: 'x-y', offsetMinutes: base.intervalMinutes }],
    });
    expect(problems.some((problem) => problem.includes('tekrar'))).toBe(true);
    expect(problems.some((problem) => problem.includes('offsetMinutes'))).toBe(true);
    expect(problems.some((problem) => problem.includes('pencere'))).toBe(true);
    expect(
      validateCalendarPrograms({ ...config.calendar, programs: [{ ...base, horizonHours: 0 }] }).some((problem) =>
        problem.includes('horizonHours'),
      ),
    ).toBe(true);
  });
});
