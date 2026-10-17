import { describe, expect, it } from 'vitest';
import { moveHorseInLayout, resolveStableLayout } from '../../../src/domain/stable/layout';
import { HorseNotInStableError, InvalidStallNumberError, StallLockedError } from '../../../src/domain/stable/errors';

/** 16.10.2026 — ahır bölmeleri: yerleşim tek kuraldan, taşıma yer değiştirir. */
const horse = (id: string, stallNumber: number | null, minute: number) => ({
  id,
  stallNumber,
  createdAt: new Date(Date.UTC(2026, 9, 16, 12, minute)).toISOString(),
});

describe('ahır yerleşimi', () => {
  it('numarasız atlar kayıt sırasıyla en düşük boş bölmeye; geçerli numara korunur', () => {
    const layout = resolveStableLayout([horse('c', null, 3), horse('a', null, 1), horse('b', 2, 2)], 5);
    expect(layout).toEqual([
      { horseId: 'a', stallNumber: 1 },
      { horseId: 'b', stallNumber: 2 },
      { horseId: 'c', stallNumber: 3 },
    ]);
    expect(resolveStableLayout([horse('a', 4, 1), horse('b', null, 2)], 5)).toEqual([
      { horseId: 'b', stallNumber: 1 },
      { horseId: 'a', stallNumber: 4 },
    ]);
  });

  it('çakışan numarada önce kaydedilen kazanır; kapasite dışı numara yeniden yerleşir', () => {
    const layout = resolveStableLayout([horse('a', 3, 1), horse('b', 3, 2), horse('c', 99, 3)], 5);
    expect(layout).toEqual([
      { horseId: 'b', stallNumber: 1 },
      { horseId: 'c', stallNumber: 2 },
      { horseId: 'a', stallNumber: 3 },
    ]);
  });

  it('kapasiteden fazla at (eski oyuncu) silinmez, kapasitenin ötesine yerleşir', () => {
    const layout = resolveStableLayout([horse('a', null, 1), horse('b', null, 2), horse('c', null, 3)], 2);
    expect(layout.map((entry) => entry.stallNumber)).toEqual([1, 2, 3]);
  });

  it('taşıma: boş bölmeye geçer, dolu bölmede yer değiştirir', () => {
    const layout = resolveStableLayout([horse('a', null, 1), horse('b', null, 2)], 5);
    expect(moveHorseInLayout(layout, 'a', 4, 5)).toEqual([
      { horseId: 'b', stallNumber: 2 },
      { horseId: 'a', stallNumber: 4 },
    ]);
    expect(moveHorseInLayout(layout, 'a', 2, 5)).toEqual([
      { horseId: 'b', stallNumber: 1 },
      { horseId: 'a', stallNumber: 2 },
    ]);
  });

  it('kilitli bölme 409, geçersiz numara 400, ahırda olmayan at 404', () => {
    const layout = resolveStableLayout([horse('a', null, 1)], 5);
    expect(() => moveHorseInLayout(layout, 'a', 6, 5)).toThrow(StallLockedError);
    for (const bad of [0, -1, 2.5, '3', null, undefined]) {
      expect(() => moveHorseInLayout(layout, 'a', bad, 5)).toThrow(InvalidStallNumberError);
    }
    expect(() => moveHorseInLayout(layout, 'x', 2, 5)).toThrow(HorseNotInStableError);
  });
});
