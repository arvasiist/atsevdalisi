import { describe, expect, it } from 'vitest';
import type { JockeyConditionView } from '@at-sevdalisi/shared-types';
import { describeJockeyFatigue, describeJockeyForm } from '../../../src/features/jockey/jockey-condition';

const base: JockeyConditionView = {
  form: 'unknown',
  formRides: 1,
  formPercent: 0,
  ridesInWindow: 0,
  fatigueWindowHours: 6,
  freeRidesInWindow: 6,
  fatiguePercent: 0,
  multiplier: 1,
};

describe('jokey durumu metni (08.10.2026)', () => {
  it('form: etiket + biniş + sunucunun yüzdesi (işaretli)', () => {
    expect(describeJockeyForm(base)).toBe('Henüz form yok (1 biniş)');
    expect(describeJockeyForm({ ...base, form: 'hot', formRides: 10, formPercent: 4.8 })).toBe(
      'Çok formda · son 10 biniş · +4,8%',
    );
    expect(describeJockeyForm({ ...base, form: 'poor', formRides: 5, formPercent: -1.2 })).toBe(
      'Formsuz · son 5 biniş · −1,2%',
    );
  });

  it('yorgunluk: dinç ya da yüzdeli', () => {
    expect(describeJockeyFatigue(base)).toBe('Son 6 saatte 0 biniş (6 binişe kadar yorulmaz) · Dinç');
    expect(describeJockeyFatigue({ ...base, ridesInWindow: 8, fatiguePercent: 3 })).toBe(
      'Son 6 saatte 8 biniş (6 binişe kadar yorulmaz) · Yorgun: −3%',
    );
  });
});
