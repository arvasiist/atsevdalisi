import { describe, expect, it } from 'vitest';
import type { HippodromeView, RaceLobbyListItem } from '@at-sevdalisi/shared-types';
import {
  countryFlag,
  describeCadence,
  groupHippodromesByCountry,
  openRacesAt,
  prestigeStars,
} from '../../../src/features/hippodromes/hippodrome-catalog';

const track = (key: string, countryCode: string, country: string) => ({ key, countryCode, country }) as HippodromeView;

describe('hipodrom ekranı yardımcıları', () => {
  it('bayrak bölge harflerinden; bozuk kod boş', () => {
    expect(countryFlag('TR')).toBe('🇹🇷');
    expect(countryFlag('FR')).toBe('🇫🇷');
    expect(countryFlag('tr')).toBe('');
  });

  it('prestij 1-5 yıldız, sınır dışı kırpılır', () => {
    expect(prestigeStars(3)).toBe('★★★☆☆');
    expect(prestigeStars(9)).toBe('★★★★★');
  });

  it('ülkeye göre gruplar, katalog sırası korunur', () => {
    const groups = groupHippodromesByCountry([
      track('a', 'TR', 'Türkiye'),
      track('b', 'US', 'ABD'),
      track('c', 'TR', 'Türkiye'),
    ]);
    expect(groups.map((g) => [g.countryCode, g.hippodromes.map((h) => h.key)])).toEqual([
      ['TR', ['a', 'c']],
      ['US', ['b']],
    ]);
  });

  it('takvim sıklığı metni', () => {
    expect(describeCadence(30)).toBe('her 30 dakikada bir');
    expect(describeCadence(360)).toBe('her 6 saatte bir');
    expect(describeCadence(10080)).toBe('haftada bir');
  });

  it('açık yarışlar: yalnızca bu pist ve başlamamış olanlar, başlangıca göre', () => {
    const now = new Date('2026-10-16T10:00:00Z');
    const race = (id: string, hippodrome: string, startTime: string) =>
      ({ id, hippodrome, startTime }) as RaceLobbyListItem;
    const rows = openRacesAt(
      [
        race('1', 'paris', '2026-10-16T12:00:00Z'),
        race('2', 'dubai', '2026-10-16T11:00:00Z'),
        race('3', 'paris', '2026-10-16T09:00:00Z'),
        race('4', 'paris', '2026-10-16T10:30:00Z'),
      ],
      'paris',
      now,
    );
    expect(rows.map((r) => r.id)).toEqual(['4', '1']);
  });
});
