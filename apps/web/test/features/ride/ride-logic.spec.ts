import { describe, expect, it } from 'vitest';
import type { InteractiveRaceView, RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';
import {
  controlForKey,
  latestStamina,
  pendingCommand,
  raceClockMs,
  serverClockOffsetMs,
} from '../../../src/features/ride/ride-logic';

const seg = (raceEntryId: string, timestampMs: number, stamina: number): RaceSegmentSnapshot =>
  ({ raceEntryId, timestampMs, stamina }) as RaceSegmentSnapshot;

describe('kontrollü yarış ekran mantığı (01.10.2026)', () => {
  it('klavye eşlemesi', () => {
    expect(controlForKey(' ')).toBe('whip');
    expect(controlForKey('ArrowLeft')).toBe('left');
    expect(controlForKey('ArrowRight')).toBe('right');
    expect(controlForKey('ArrowDown')).toBe('ease');
    expect(controlForKey('a')).toBeNull();
  });

  it('saat: sunucu farkı ve yarış saati (geri sayımda negatif)', () => {
    const offset = serverClockOffsetMs(
      '2026-10-01T12:00:10.000Z',
      Date.parse('2026-10-01T12:00:08.000Z'),
    );
    expect(
      raceClockMs(Date.parse('2026-10-01T12:00:20.000Z'), offset, '2026-10-01T12:00:12.000Z', 2),
    ).toBe(20_000);
    expect(offset).toBe(2000);
    expect(
      raceClockMs(Date.parse('2026-10-01T12:00:08.000Z'), offset, '2026-10-01T12:00:12.000Z'),
    ).toBe(-2000);
  });

  it('sıradaki segment komutu; yarış bitince yok', () => {
    const view = {
      myCommands: { '2': { whips: 3, laneShift: 1 as const, ease: false } },
      nextCommandSegment: 2,
    };
    expect(pendingCommand(view)).toEqual({ whips: 3, laneShift: 1, ease: false });
    expect(pendingCommand({ ...view, nextCommandSegment: 3 })).toEqual({
      whips: 0,
      laneShift: 0,
      ease: false,
    });
    expect(pendingCommand({ ...view, nextCommandSegment: null })).toBeNull();
  });

  it('dayanıklılık: içinde bulunulan segmentin değeri', () => {
    const view = {
      playerLabel: 'me',
      segments: [seg('me', 10_000, 90), seg('bot-1', 9_000, 95), seg('me', 20_000, 70)],
    } as Pick<InteractiveRaceView, 'segments' | 'playerLabel'>;
    expect(latestStamina(view, 5_000)).toBe(90);
    expect(latestStamina(view, 15_000)).toBe(70);
    expect(latestStamina({ ...view, segments: [] }, 0)).toBeNull();
  });
});
