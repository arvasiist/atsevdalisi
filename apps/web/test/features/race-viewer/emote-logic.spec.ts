import { describe, expect, it } from 'vitest';
import { loadChatConfig } from '@at-sevdalisi/game-config';
import { addBurst, symbolFor } from '../../../src/features/race-viewer/emote-logic';

const { emotes } = loadChatConfig();
const raceId = 'r1';

describe('tribün emote ekranı (Faz 9)', () => {
  it('config listesi dolu, anahtarlar tekil, simge dosya değil metin', () => {
    expect(emotes.list.length).toBeGreaterThan(0);
    expect(new Set(emotes.list.map((e) => e.key)).size).toBe(emotes.list.length);
    for (const emote of emotes.list) expect(emote.symbol).not.toMatch(/\.(png|svg|glb|webp)$/i);
  });
  it('bilinmeyen anahtar çizilmez', () => {
    expect(symbolFor('uydurma', emotes.list)).toBeNull();
    expect(addBurst([], { raceId, key: 'uydurma' }, emotes.list, 0, emotes, 1)).toEqual([]);
  });
  it('süresi dolan atılır, en fazla maxVisible tutulur', () => {
    let bursts = addBurst([], { raceId, key: emotes.list[0]!.key }, emotes.list, 0, emotes, 1);
    expect(bursts[0]!.symbol).toBe(emotes.list[0]!.symbol);
    bursts = addBurst(bursts, { raceId, key: emotes.list[0]!.key }, emotes.list, emotes.displayMs + 1, emotes, 2);
    expect(bursts.map((b) => b.id)).toEqual([2]);
    for (let id = 3; id < 3 + emotes.maxVisible + 5; id += 1) {
      bursts = addBurst(bursts, { raceId, key: emotes.list[1]!.key }, emotes.list, emotes.displayMs + 2, emotes, id);
    }
    expect(bursts).toHaveLength(emotes.maxVisible);
    expect(bursts.at(-1)!.id).toBe(3 + emotes.maxVisible + 4);
  });
});
