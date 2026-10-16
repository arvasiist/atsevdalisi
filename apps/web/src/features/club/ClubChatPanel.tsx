'use client';

/**
 * KULÜP SOHBETİ (02.10.2026, Faz 9). Yalnızca üyeye çizilir; sunucu her
 * istekte üyeliği yeniden denetler (403 → panel hatayı gösterir). Mesajlar
 * `chat.clubChat.pollSeconds` aralığıyla yoklanır — sekme görünmezken
 * yoklama yapılmaz. Gönderilen mesaj yerelde uydurulmaz: sunucunun
 * döndürdüğü satır listeye eklenir.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClubChatMessageView } from '@at-sevdalisi/shared-types';
import { loadChatConfig } from '@at-sevdalisi/game-config';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { appendClubMessage } from './club-chat-logic';

const chatConfig = loadChatConfig();
const MS_PER_SECOND = 1000;

export function ClubChatPanel({ clubId, myPlayerId }: { clubId: string; myPlayerId: string }): React.ReactElement {
  const [messages, setMessages] = useState<ClubChatMessageView[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLOListElement | null>(null);

  const load = useCallback(async () => {
    try {
      setMessages(await apiClient.getClubMessages(clubId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sohbet yüklenemedi.');
    }
  }, [clubId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, chatConfig.clubChat.pollSeconds * MS_PER_SECOND);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const body = draft.trim();
    if (body === '' || sending) return;
    setSending(true);
    try {
      const saved = await apiClient.sendClubMessage(clubId, body);
      setMessages((current) => appendClubMessage(current, saved, chatConfig.clubChat.historyLimit));
      setDraft('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mesaj gönderilemedi.');
    } finally {
      setSending(false);
    }
  };

  return (
    <GlassPanel style={{ padding: 'var(--space-lg)' }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Kulüp sohbeti
      </h2>
      <ol ref={listRef} className="club-chat-list" aria-live="polite">
        {messages.length === 0 ? <li className="session-meta">Henüz mesaj yok.</li> : null}
        {messages.map((message) => (
          <li key={message.id} className={message.playerId === myPlayerId ? 'club-chat-mine' : undefined}>
            <span className="club-chat-author">{message.displayName}</span>{' '}
            <span className="session-meta">
              {new Date(message.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <p>{message.body}</p>
          </li>
        ))}
      </ol>
      <form className="club-chat-form" onSubmit={(event) => void submit(event)}>
        <input
          aria-label="Kulüp mesajı"
          value={draft}
          maxLength={chatConfig.maxMessageLength}
          placeholder="Kulübe yaz…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="moderation-primary" disabled={sending || draft.trim() === ''}>
          Gönder
        </button>
      </form>
      {error ? <p className="moderation-error">{error}</p> : null}
    </GlassPanel>
  );
}
