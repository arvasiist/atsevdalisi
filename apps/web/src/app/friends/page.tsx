'use client';

/**
 * `/friends` — ARKADAŞLIK + MESAJLAŞMA (proje sahibinin açık talebi,
 * 27.09.2026: "arkadaşlık + mesajlaşma").
 *
 * **TEK "özet" İSTEĞİ:** ekran açıldığında `GET /players/:id/social`
 * çağrılır ve arkadaşlar + gelen/giden istekler + okunmamış sayısı AYNI
 * yanıtta gelir (bkz. `SocialOverviewView` doc yorumu). Üç ayrı uç nokta
 * üç ayrı yükleme durumu ve kısmi hata üretirdi.
 *
 * **Yazışma TEMBEL yüklenir:** bir arkadaşa tıklanana kadar
 * `GET /players/:id/messages/:otherPlayerId` ÇAĞRILMAZ. Bu, yalnızca
 * gereksiz isteği önlemek için değil — o uç noktanın **yan etkisi**
 * olduğu içindir: sunucu, gelen okunmamış mesajları OKUNDU işaretler
 * (bkz. `GetConversationUseCase`). Sayfa açılışında tüm arkadaşlar için
 * çağırmak, hiç bakılmayan yazışmaları "okunmuş" yapardı.
 *
 * **Yeni arkadaş nasıl eklenir:** bu sayfada "oyuncu ara" kutusu YOKTUR.
 * Keşif yolu `/leaderboard`'dur — sıralama tablosu başka oyuncuların
 * kimliğini gösteren TEK mevcut yüzeydir ve oradaki "Arkadaş Ekle"
 * düğmesi bu sayfaya istek düşürür. Ayrı bir arama uç noktası bilinçli
 * olarak İCAT EDİLMEDİ (görünen ad numaralandırmasına açık yeni bir yüzey
 * olurdu).
 *
 * Bu bileşen HİÇBİR iş kuralı UYGULAMAZ: "arkadaş mıyız", "kaç istek
 * bekliyor", "mesaj çok uzun mu" — hepsi sunucuda (CLAUDE.md "SUNUCU
 * OTORİTESİ"). İstemci yalnızca düğmeleri sunucunun döndürdüğü duruma
 * göre gösterir/gizler.
 */

import { useCallback, useEffect, useState } from 'react';
import type { DirectMessageView, FriendRequestView, FriendView, SocialOverviewView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

/** Gelen kutusunda gösterilecek en fazla satır — sunucu zaten `inboxLimit` uygular. */
const INBOX_PREVIEW_LIMIT = 5;

export default function FriendsPage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [overview, setOverview] = useState<SocialOverviewView | null>(null);
  const [inbox, setInbox] = useState<DirectMessageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Seçili arkadaş — yazışma panelini açar (bkz. dosya başı "tembel yükleme" notu). */
  const [activeFriend, setActiveFriend] = useState<FriendView | null>(null);
  const [messages, setMessages] = useState<DirectMessageView[] | null>(null);
  const [draft, setDraft] = useState('');
  /** Satır bazlı "işleniyor" durumu — bir isteği yanıtlarken TÜM liste kilitlenmez. */
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const loadOverview = useCallback(async (playerId: string) => {
    const [social, myInbox] = await Promise.all([
      apiClient.getSocialOverview(playerId),
      apiClient.getInbox(playerId),
    ]);
    return { social, myInbox };
  }, []);

  useEffect(() => {
    if (!player) {
      return;
    }
    let cancelled = false;
    setOverview(null);
    setInbox(null);
    setError(null);
    void loadOverview(player.id)
      .then(({ social, myInbox }) => {
        if (cancelled) return;
        setOverview(social);
        setInbox(myInbox);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Sosyal ekran yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [player, loadOverview]);

  /**
   * Özeti tazeler ve AÇIK yazışmayı da yeniler. Yazışma yenilenirken
   * okunmamış sayısının düşmesi beklenen davranıştır (sunucu okundu
   * işaretler — bkz. dosya başı notu).
   */
  const refresh = useCallback(
    async (options: { keepConversation?: boolean } = {}): Promise<void> => {
      if (!player) return;
      const { social, myInbox } = await loadOverview(player.id);
      setOverview(social);
      setInbox(myInbox);
      if (options.keepConversation && activeFriend) {
        setMessages(await apiClient.getConversation(player.id, activeFriend.playerId));
      }
    },
    [player, loadOverview, activeFriend],
  );

  /** Ortak hata yakalayıcı — her eylem aynı `error` satırını besler. */
  const runAction = useCallback(
    async (key: string, action: () => Promise<void>, fallbackMessage: string): Promise<void> => {
      setPendingKey(key);
      setError(null);
      try {
        await action();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : fallbackMessage);
      } finally {
        setPendingKey(null);
      }
    },
    [],
  );

  const respond = (request: FriendRequestView, action: 'accept' | 'reject'): Promise<void> =>
    runAction(
      request.requestId,
      async () => {
        await apiClient.respondFriendRequest(player?.id ?? '', request.requestId, action);
        await refresh();
      },
      'İstek yanıtlanamadı',
    );

  /**
   * Tek `removeFriend` çağrısı İKİ işi yapar (sunucudaki
   * `RemoveFriendUseCase` ile AYNI): kabul edilmiş arkadaşlığı siler VEYA
   * bekleyen isteği geri çeker. Bu yüzden hem "Çıkar" hem "İptal Et"
   * düğmesi buraya bağlanır.
   */
  const remove = (targetId: string, key: string, fallbackMessage: string): Promise<void> =>
    runAction(
      key,
      async () => {
        await apiClient.removeFriend(player?.id ?? '', targetId);
        if (activeFriend?.playerId === targetId) {
          setActiveFriend(null);
          setMessages(null);
        }
        await refresh();
      },
      fallbackMessage,
    );

  const openConversation = (friend: FriendView): Promise<void> =>
    runAction(
      `open-${friend.playerId}`,
      async () => {
        if (!player) return;
        setActiveFriend(friend);
        setMessages(await apiClient.getConversation(player.id, friend.playerId));
        // Okundu işaretlemesi sunucuda oldu; özet tazelenir ki rozet düşsün.
        const social = await apiClient.getSocialOverview(player.id);
        setOverview(social);
      },
      'Yazışma açılamadı',
    );

  const send = (): Promise<void> =>
    runAction(
      'send',
      async () => {
        if (!player || !activeFriend) return;
        const body = draft.trim();
        if (body.length === 0) return;
        setIsSending(true);
        try {
          await apiClient.sendMessage(player.id, activeFriend.playerId, body);
          setDraft('');
          setMessages(await apiClient.getConversation(player.id, activeFriend.playerId));
        } finally {
          setIsSending(false);
        }
      },
      'Mesaj gönderilemedi',
    );

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Arkadaşlar</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Arkadaş ekle, istekleri yanıtla ve arkadaşlarınla yazış. Yeni arkadaş bulmak için{' '}
        <a href="/leaderboard" style={{ color: 'var(--color-accent-gold)' }}>
          sıralama tablosuna
        </a>{' '}
        göz at.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Arkadaş ekleyebilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} style={primaryButtonStyle()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}

      {player && overview === null && !error ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Yükleniyor…</p>
      ) : null}

      {overview ? (
        <>
          {overview.incomingRequests.length > 0 ? (
            <Section title={`Gelen İstekler (${overview.incomingRequests.length})`}>
              {overview.incomingRequests.map((request) => (
                <Row key={request.requestId}>
                  <RowLabel primary={request.displayName} secondary={`Seviye ${request.level} · ${formatRelativeDate(request.createdAt)}`} />
                  <RowActions>
                    <button
                      type="button"
                      disabled={pendingKey === request.requestId}
                      onClick={() => void respond(request, 'accept')}
                      style={primaryButtonStyle()}
                    >
                      Kabul Et
                    </button>
                    <button
                      type="button"
                      disabled={pendingKey === request.requestId}
                      onClick={() => void respond(request, 'reject')}
                      style={secondaryButtonStyle()}
                    >
                      Reddet
                    </button>
                  </RowActions>
                </Row>
              ))}
            </Section>
          ) : null}

          {overview.outgoingRequests.length > 0 ? (
            <Section title={`Gönderdiğim İstekler (${overview.outgoingRequests.length})`}>
              {overview.outgoingRequests.map((request) => (
                <Row key={request.requestId}>
                  <RowLabel primary={request.displayName} secondary={`Yanıt bekleniyor · ${formatRelativeDate(request.createdAt)}`} />
                  <RowActions>
                    <button
                      type="button"
                      disabled={pendingKey === request.requestId}
                      onClick={() => void remove(request.playerId, request.requestId, 'İstek geri çekilemedi')}
                      style={secondaryButtonStyle()}
                    >
                      İptal Et
                    </button>
                  </RowActions>
                </Row>
              ))}
            </Section>
          ) : null}

          <Section title={`Arkadaşlar (${overview.friends.length})`}>
            {overview.friends.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '13px' }}>
                Henüz arkadaşın yok. Sıralama tablosundan bir sporcuya istek gönderebilirsin.
              </p>
            ) : (
              overview.friends.map((friend) => (
                <Row key={friend.friendshipId} highlight={activeFriend?.playerId === friend.playerId}>
                  <RowLabel
                    primary={friend.displayName}
                    secondary={`Seviye ${friend.level} · ${formatRelativeDate(friend.friendsSince)} arkadaş`}
                  />
                  <RowActions>
                    <button
                      type="button"
                      disabled={pendingKey === `open-${friend.playerId}`}
                      onClick={() => void openConversation(friend)}
                      style={primaryButtonStyle()}
                    >
                      Yazış
                    </button>
                    <button
                      type="button"
                      disabled={pendingKey === friend.friendshipId}
                      onClick={() => void remove(friend.playerId, friend.friendshipId, 'Arkadaşlıktan çıkarılamadı')}
                      style={secondaryButtonStyle()}
                    >
                      Çıkar
                    </button>
                  </RowActions>
                </Row>
              ))
            )}
          </Section>

          {activeFriend ? (
            <Section title={`${activeFriend.displayName} ile yazışma`}>
              {messages === null ? (
                <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '13px' }}>Yazışma yükleniyor…</p>
              ) : messages.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '13px' }}>
                  Henüz mesaj yok. İlk mesajı sen yaz.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                  {/* Sunucu en yeniden eskiye döner; sohbet için ters çevrilir. */}
                  {[...messages].reverse().map((message) => (
                    <div
                      key={message.messageId}
                      style={{
                        alignSelf: message.senderId === player?.id ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        padding: 'var(--space-sm) var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        background:
                          message.senderId === player?.id ? 'var(--color-accent-gold)' : 'var(--color-bg-surface-elevated)',
                        color: message.senderId === player?.id ? '#1a1405' : 'var(--color-text-primary)',
                        fontSize: '14px',
                        wordBreak: 'break-word',
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
                      <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>
                        {formatRelativeDate(message.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !isSending) void send();
                  }}
                  placeholder="Mesaj yaz…"
                  maxLength={500}
                  style={inputStyle()}
                />
                <button
                  type="button"
                  disabled={isSending || draft.trim().length === 0}
                  onClick={() => void send()}
                  style={{ ...primaryButtonStyle(), opacity: isSending || draft.trim().length === 0 ? 0.55 : 1 }}
                >
                  {isSending ? 'Gönderiliyor…' : 'Gönder'}
                </button>
              </div>
            </Section>
          ) : null}

          <Section title={`Gelen Kutusu${overview.unreadMessageCount > 0 ? ` (${overview.unreadMessageCount} okunmamış)` : ''}`}>
            {inbox === null || inbox.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '13px' }}>Gelen kutun boş.</p>
            ) : (
              inbox.slice(0, INBOX_PREVIEW_LIMIT).map((message) => (
                <Row key={message.messageId}>
                  <RowLabel
                    primary={message.senderDisplayName}
                    secondary={message.body}
                    unread={message.readAt === null}
                  />
                  <RowActions>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {formatRelativeDate(message.createdAt)}
                    </span>
                  </RowActions>
                </Row>
              ))
            )}
          </Section>
        </>
      ) : null}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section style={{ marginBottom: 'var(--space-xl)' }}>
      <h2
        style={{
          fontSize: '18px',
          color: 'var(--color-text-primary)',
          marginTop: 0,
          marginBottom: 'var(--space-sm)',
        }}
      >
        {title}
      </h2>
      <GlassPanel style={{ padding: 'var(--space-md)', display: 'grid', gap: 'var(--space-sm)' }}>{children}</GlassPanel>
    </section>
  );
}

function Row({ children, highlight }: { children: React.ReactNode; highlight?: boolean }): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        paddingBottom: 'var(--space-sm)',
        borderBottom: '1px solid var(--color-border)',
        ...(highlight ? { borderLeft: '2px solid var(--color-accent-gold)', paddingLeft: 'var(--space-sm)' } : {}),
      }}
    >
      {children}
    </div>
  );
}

function RowLabel({
  primary,
  secondary,
  unread,
}: {
  primary: string;
  secondary: string;
  unread?: boolean;
}): React.ReactElement {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: unread ? 700 : 600 }}>
        {primary}
        {unread ? <span style={{ color: 'var(--color-accent-gold)', fontSize: '12px' }}> · yeni</span> : null}
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--color-text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '46ch',
        }}
      >
        {secondary}
      </div>
    </div>
  );
}

function RowActions({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexShrink: 0 }}>{children}</div>;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** `grandstand/page.tsx` ile AYNI yardımcı — ortak bir modüle taşınmadı (iki kullanım). */
function formatRelativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < MS_PER_MINUTE) return 'az önce';
  if (diffMs < MS_PER_HOUR) return `${Math.floor(diffMs / MS_PER_MINUTE)} dk önce`;
  if (diffMs < MS_PER_DAY) return `${Math.floor(diffMs / MS_PER_HOUR)} sa önce`;
  return `${Math.floor(diffMs / MS_PER_DAY)} gün önce`;
}

function primaryButtonStyle(): React.CSSProperties {
  return {
    minHeight: '36px',
    padding: '8px 16px',
    background: 'var(--color-accent-gold)',
    color: '#1a1405',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    minHeight: '36px',
    padding: '8px 16px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function inputStyle(): React.CSSProperties {
  return {
    flex: 1,
    minHeight: '40px',
    padding: '8px 12px',
    background: 'var(--color-bg-surface-elevated)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
  };
}
