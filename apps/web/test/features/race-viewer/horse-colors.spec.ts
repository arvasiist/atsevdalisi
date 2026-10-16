import { describe, expect, it } from 'vitest';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import {
  HORSE_COLORS,
  MIN_DISTINCT_COLOR_DISTANCE,
  assignHorseColors,
  colorDistance,
  pickHorseColor,
} from '../../../src/features/race-viewer/horse-colors';

const ids = (count: number) => Array.from({ length: count }, (_, index) => `entry-${index}`);
const silks = Object.values(loadAvatarConfig().silkColors);

describe('assignHorseColors (09.10.2026 — jokey forması)', () => {
  it('forma yoksa atama eski palet döngüsüyle BİREBİR aynı (16 atlık saha dahil)', () => {
    for (const count of [1, 8, 12, 16]) {
      const list = ids(count);
      const colors = assignHorseColors(list);
      list.forEach((id, index) => expect(colors[id]).toBe(pickHorseColor(index)));
    }
  });

  it('formalı katılımcı kendi rengini alır; formaya benzeyen palet rengi başkasına verilmez', () => {
    const list = ids(8);
    const orange = loadAvatarConfig().silkColors.orange!;
    const colors = assignHorseColors(list, { 'entry-3': orange });
    expect(colors['entry-3']).toBe(orange);
    for (const id of list.filter((id) => id !== 'entry-3')) {
      expect(colorDistance(colors[id]!, orange)).toBeGreaterThanOrEqual(MIN_DISTINCT_COLOR_DISTANCE);
    }
    expect(new Set(Object.values(colors)).size).toBe(list.length);
  });

  it('aynı formayı seçen iki oyuncudan biri palete düşer; sonuç liste sırasından bağımsız', () => {
    const red = loadAvatarConfig().silkColors.red!;
    const silkById = { 'entry-5': red, 'entry-2': red };
    const forward = assignHorseColors(ids(6), silkById);
    const reversed = assignHorseColors([...ids(6)].reverse(), silkById);
    expect(forward['entry-2']).toBe(red);
    expect(forward['entry-5']).not.toBe(red);
    expect(reversed['entry-2']).toBe(red);
    expect(colorDistance(forward['entry-5']!, red)).toBeGreaterThanOrEqual(MIN_DISTINCT_COLOR_DISTANCE);
  });

  it('null/geçersiz forma değeri yok sayılır', () => {
    const colors = assignHorseColors(ids(3), { 'entry-0': null, 'entry-1': 'kırmızı' });
    expect(colors).toEqual(assignHorseColors(ids(3)));
  });

  it('forma kataloğundaki ve paletteki renkler kendi aralarında ayırt edilebilir (eşik altına renk ekleme)', () => {
    for (const group of [silks, HORSE_COLORS]) {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          expect(colorDistance(group[i]!, group[j]!)).toBeGreaterThanOrEqual(MIN_DISTINCT_COLOR_DISTANCE);
        }
      }
    }
  });

  it('her forma rengi sahada aynı anda gösterilebilir (hepsi birlikte yerleşir)', () => {
    const list = ids(silks.length);
    const silkById = Object.fromEntries(list.map((id, index) => [id, silks[index]!]));
    const colors = assignHorseColors(list, silkById);
    list.forEach((id, index) => expect(colors[id]).toBe(silks[index]));
  });
});
