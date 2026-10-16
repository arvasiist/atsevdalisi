import { describe, expect, it } from 'vitest';
import { companionAction, describeSharedRaces } from '../../../src/features/social/race-companions';

describe('birlikte yarıştıkların', () => {
  it('yalnızca ilişkisi olmayan rakibe istek düğmesi gösterilir', () => {
    expect(companionAction('none').canRequest).toBe(true);
    expect(companionAction('outgoing').canRequest).toBe(false);
    expect(companionAction('incoming').canRequest).toBe(false);
    expect(companionAction('friend').canRequest).toBe(false);
  });

  it('ortak yarış sayısı okunur biçimde yazılır', () => {
    expect(describeSharedRaces(1)).toBe('1 ortak yarış');
    expect(describeSharedRaces(4)).toBe('4 ortak yarış');
  });
});
