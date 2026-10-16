import { describe, expect, it } from 'vitest';
import type { ClubChatMessageView } from '@at-sevdalisi/shared-types';
import { appendClubMessage } from '../../../src/features/club/club-chat-logic';

const message = (id: string): ClubChatMessageView => ({
  id,
  playerId: 'p',
  username: 'u',
  displayName: 'U',
  body: id,
  createdAt: '2026-10-02T00:00:00Z',
});

describe('kulüp sohbeti listesi', () => {
  it('aynı mesaj ikinci kez eklenmez; sınır en yenileri tutar', () => {
    let list = appendClubMessage([], message('a'), 2);
    list = appendClubMessage(list, message('a'), 2);
    expect(list.map((m) => m.id)).toEqual(['a']);
    list = appendClubMessage(appendClubMessage(list, message('b'), 2), message('c'), 2);
    expect(list.map((m) => m.id)).toEqual(['b', 'c']);
  });
});
