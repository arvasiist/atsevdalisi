import { describe, expect, it } from 'vitest';
import { checkOwnRaceCancelable } from '../../../src/domain/race/lobby';

/**
 * 14.10.2026 — oyuncunun kendi yarışını iptali (saf kural). Tam matris:
 * sahiplik × durum × aktif katılım. Para kuralı: aktif katılım varken iptal
 * YOK (iade gerektirirdi), bu yüzden bu yolda para hiç hareket etmez.
 */
const OWNER = 'oyuncu-1';

describe('checkOwnRaceCancelable', () => {
  it('açan + açık + katılımsız → izin', () => {
    expect(checkOwnRaceCancelable({ createdBy: OWNER, status: 'scheduled', activeEntries: 0 }, OWNER)).toBeNull();
  });

  it('başkasının yarışı ve sahipsiz (takvim/turnuva) yarış → NOT_OWNER', () => {
    expect(checkOwnRaceCancelable({ createdBy: 'baska', status: 'scheduled', activeEntries: 0 }, OWNER)).toBe(
      'NOT_OWNER',
    );
    expect(checkOwnRaceCancelable({ createdBy: null, status: 'scheduled', activeEntries: 0 }, OWNER)).toBe(
      'NOT_OWNER',
    );
  });

  it.each(['locking', 'in_progress', 'finished', 'cancelled'])('%s yarış → NOT_SCHEDULED', (status) => {
    expect(checkOwnRaceCancelable({ createdBy: OWNER, status, activeEntries: 0 }, OWNER)).toBe('NOT_SCHEDULED');
  });

  it('aktif katılım varsa → HAS_PARTICIPANTS (iade gerektirirdi)', () => {
    for (const activeEntries of [1, 2, 8]) {
      expect(checkOwnRaceCancelable({ createdBy: OWNER, status: 'scheduled', activeEntries }, OWNER)).toBe(
        'HAS_PARTICIPANTS',
      );
    }
  });

  it('sahiplik durumdan ÖNCE denetlenir (başkasına yarışın durumu sızmaz)', () => {
    expect(checkOwnRaceCancelable({ createdBy: 'baska', status: 'finished', activeEntries: 3 }, OWNER)).toBe(
      'NOT_OWNER',
    );
  });
});
