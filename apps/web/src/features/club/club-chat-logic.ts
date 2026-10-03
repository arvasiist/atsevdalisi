import type { ClubChatMessageView } from '@at-sevdalisi/shared-types';

/** Yeni mesajı ekler (aynı kimlik ikinci kez eklenmez), en fazla `limit` (en yeniler). */
export function appendClubMessage(
  current: readonly ClubChatMessageView[],
  message: ClubChatMessageView,
  limit: number,
): ClubChatMessageView[] {
  if (current.some((existing) => existing.id === message.id)) return [...current];
  return [...current, message].slice(-limit);
}
