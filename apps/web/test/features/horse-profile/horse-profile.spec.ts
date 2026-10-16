import { describe, expect, it } from 'vitest';
import { HORSE_VISIBLE_STAT_KEYS } from '@at-sevdalisi/shared-types';
import {
  HORSE_STAT_LABELS,
  describeRecord,
  formatPlacing,
  statRows,
  winRatePercent,
} from '../../../src/features/horse-profile/horse-profile';

describe('at profili biçimlendirme (brief §3)', () => {
  it('her görünür stat için Türkçe etiket var ve sıra sunucunun anahtar listesidir', () => {
    expect(Object.keys(HORSE_STAT_LABELS).sort()).toEqual([...HORSE_VISIBLE_STAT_KEYS].sort());
    const rows = statRows({
      speed: 61.25,
      acceleration: 50,
      stamina: 48.04,
      sprint: 55,
      endurance: 40,
      startSpeed: 52,
      finishSpeed: 57,
      cornering: 45,
    });
    expect(rows.map((row) => row.key)).toEqual([...HORSE_VISIBLE_STAT_KEYS]);
    expect(rows[0]).toEqual({ key: 'speed', label: 'Hız', value: 61.3 });
    expect(rows[2]!.value).toBe(48);
  });

  it('kariyer özeti sıfır kalemleri yazmaz; koşusuz ve tay vermemiş at için açık metin', () => {
    expect(describeRecord({ starts: 0, wins: 0, places: 0, earnings: 0, foals: 0 })).toBe('Kayıtlı koşu yok');
    expect(describeRecord({ starts: 12, wins: 3, places: 5, earnings: 1240, foals: 2 })).toBe(
      '12 koşu · 3 birincilik · 5 ilk üç · 1.240 çip · 2 tay',
    );
    expect(describeRecord({ starts: 4, wins: 0, places: 0, earnings: 0, foals: 0 })).toBe('4 koşu');
    // Emekli damızlık: koşusu yok ama tayı var → özet yine yazılır.
    expect(describeRecord({ starts: 0, wins: 0, places: 0, earnings: 0, foals: 1 })).toBe('0 koşu · 1 tay');
  });

  it('derece ve kazanma oranı', () => {
    expect(formatPlacing({ finishPosition: 3, fieldSize: 8 })).toBe('3/8');
    expect(winRatePercent({ starts: 0, wins: 0 })).toBeNull();
    expect(winRatePercent({ starts: 3, wins: 1 })).toBe(33);
  });
});
