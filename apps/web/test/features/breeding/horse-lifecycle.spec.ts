import { describe, expect, it } from 'vitest';
import type { PublicHorse } from '@at-sevdalisi/shared-types';
import { canOfferRetirement, formatHorseAge } from '../../../src/features/breeding/horse-lifecycle';

/** 15.10.2026 — S5: yaş metni + "Emekli et" düğmesinin görünürlüğü (kural sunucuda). */
describe('formatHorseAge', () => {
  it('ay → okunur yaş', () => {
    expect(formatHorseAge(0)).toBe('0 aylık');
    expect(formatHorseAge(7)).toBe('7 aylık');
    expect(formatHorseAge(48)).toBe('4 yaş');
    expect(formatHorseAge(51)).toBe('4 yaş 3 ay');
    expect(formatHorseAge(-3)).toBe('0 aylık');
  });
});

describe('canOfferRetirement', () => {
  const horse = (id: string, status: PublicHorse['status']) => ({ id, status }) as PublicHorse;

  it('emekli atta ve SON yarış atında düğme yok (sunucu da LAST_RACING_HORSE der)', () => {
    expect(canOfferRetirement(horse('a', 'retired'), [horse('a', 'retired'), horse('b', 'active')])).toBe(false);
    expect(canOfferRetirement(horse('a', 'active'), [horse('a', 'active')])).toBe(false);
    expect(canOfferRetirement(horse('a', 'active'), [horse('a', 'active'), horse('b', 'retired')])).toBe(false);
  });

  it('başka bir emekli olmayan at varsa düğme var (sakat at da sayılır)', () => {
    expect(canOfferRetirement(horse('a', 'active'), [horse('a', 'active'), horse('b', 'injured')])).toBe(true);
  });
});
