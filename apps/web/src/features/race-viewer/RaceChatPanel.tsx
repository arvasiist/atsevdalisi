'use client';

/**
 * Yarış sohbeti + canlı izleyici sayısı paneli (brief §13, §27, §42
 * PHASE 7.3 — 29.09.2026).
 *
 * ## Neden `RaceHud`'un İÇİNE DEĞİL, KARDEŞ bir katman olarak yazıldı
 *
 * `RaceHud` `memo()` ile sarmalanmıştır ve sığ prop karşılaştırmasına
 * GÜVENİR: `LiveRaceViewer` HUD'a giden türetilmiş veriyi bilerek 10Hz'de
 * throttle eder (bkz. `RaceViewer.tsx` → `HUD_SYNC_INTERVAL_MS`). Sohbet
 * durumunu `RaceHud`'a prop olarak geçirmek, her yeni mesajda (ve her
 * izleyici sayısı güncellemesinde) TÜM HUD'u — liderlik tablosu, minimap,
 * telemetri çubukları — yeniden çizerdi ve o throttle'ı anlamsız kılardı.
 * Bu yüzden sohbet ayrı bir bileşendir: kendi durumu, kendi render
 * döngüsü, HUD'un sığ karşılaştırmasına DOKUNMAZ.
 *
 * Aynı gerekçe `RaceHud`'un kabındaki `pointerEvents: 'none'` içindir —
 * bu panel o kabın DIŞINDA (kardeş olarak) durur, yani tıklama/klavye
 * olaylarını NORMAL alır.
 *
 * ## Neden kendi aç/kapa durumu var
 *
 * Panel 3D sahnenin ÜZERİNDE durur; kullanıcı yarışı izlemek isterken
 * sohbeti kapatabilmelidir. Aç/kapa durumu `LiveRaceViewer`'da tutulsaydı
 * her yeni telemetri batch'i (saniyede birkaç kez) `LiveRaceViewer`'ı
 * yeniden render eder ve bu prop zinciri üzerinden paneli de etkilerdi;
 * durumu panelin KENDİSİNDE tutmak bu bağı koparır.
 *
 * ## Sunucu otoritesi
 *
 * Gönderilen gövde SUNUCUDA doğrulanır (uzunluk/kırpma, hız sınırı,
 * abonelik kapısı) ve geri dönen KAYITLI satır `chat.message.received`
 * ile yayınlanır — bkz. `race.gateway.ts`. Bu bileşen gönderdiği metni
 * iyimser (optimistic) biçimde listeye EKLEMEZ: ekleseydi sunucunun
 * kırptığı/reddettiği bir gövde ekranda "gönderilmiş" görünürdü.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RaceChatMessageView } from '@at-sevdalisi/shared-types';
import { loadChatConfig } from '@at-sevdalisi/game-config';

/**
 * `RaceViewer.tsx`'teki `cameraConfig` ile AYNI desen: modül kapsamında
 * BİR KEZ yüklenir. Buradaki tek kullanımı `maxMessageLength`tır —
 * girdi alanının `maxLength`ini sunucunun kabul ettiği sınıra eşitler,
 * böylece kullanıcı sunucunun sessizce kırpacağı bir mesajı YAZMAZ.
 */
const chatConfig = loadChatConfig();

export interface RaceChatPanelProps {
  /** Kronolojik sırada, TEKİLLEŞTİRİLMİŞ mesajlar (`chat-history-merge.ts`). */
  messages: RaceChatMessageView[];
  /** `race.spectators` — o an odadaki açık soket sayısı. Henüz gelmediyse `null`. */
  spectatorCount: number | null;
  /** `chat.message` gönderir. Gövde SUNUCUDA doğrulanır (bkz. dosya başı doc yorumu). */
  onSend: (body: string) => void;
  /** `chat.error` — sohbet reddedildi (hız sınırı, abonelik yok, boş gövde). */
  errorMessage: string | null;
}

export function RaceChatPanel({
  messages,
  spectatorCount,
  onSend,
  errorMessage,
}: RaceChatPanelProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(true);
  const [draft, setDraft] = useState('');
  // Yeni mesaj geldiğinde listeyi SONA kaydırmak için — kullanıcı yukarı
  // kaydırmış olsa bile yeni mesajı görmek ister (sohbet bir canlı yayın
  // yüzeyidir, arşiv değil).
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const body = draft.trim();
      if (body.length === 0) {
        return;
      }
      onSend(body);
      // Girdi SUNUCU YANITINI BEKLEMEDEN temizlenir: sunucu reddederse
      // (`chat.error`) mesaj zaten kaydedilmemiştir ve kullanıcı hatayı
      // panelin alt satırında görür. Temizlememek, başarılı gönderimlerde
      // metni girdide bırakıp ikinci kez gönderilmesine davetiye olurdu.
      setDraft('');
    },
    [draft, onSend],
  );

  const countLabel = useMemo(() => {
    if (spectatorCount === null) {
      return null;
    }
    return `${spectatorCount} izleyici`;
  }, [spectatorCount]);

  return (
    <div
      style={{
        position: 'absolute',
        right: 'var(--space-sm)',
        bottom: 'var(--space-sm)',
        width: '260px',
        maxWidth: 'calc(100% - var(--space-md))',
        background: 'var(--color-bg-surface-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-xs)',
          width: '100%',
          minHeight: '32px',
          padding: '4px var(--space-sm)',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-secondary)',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
        }}
        aria-expanded={isOpen}
      >
        <span>Tribün sohbeti</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          {countLabel ? (
            <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{countLabel}</span>
          ) : null}
          <span aria-hidden="true">{isOpen ? '▾' : '▴'}</span>
        </span>
      </button>

      {isOpen ? (
        <>
          <ol
            ref={listRef}
            style={{
              listStyle: 'none',
              margin: 0,
              padding: '0 var(--space-sm)',
              height: '132px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {messages.length === 0 ? (
              <li style={{ fontSize: '12px', color: 'var(--color-text-muted)', padding: '4px 0' }}>
                Henüz mesaj yok. İlk yazan sen ol.
              </li>
            ) : (
              messages.map((message) => (
                <li key={message.messageId} style={{ fontSize: '12px', lineHeight: 1.4 }}>
                  <span style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>{message.username}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}> {formatClockTime(message.createdAt)} </span>
                  <span style={{ color: 'var(--color-text-primary)', wordBreak: 'break-word' }}>{message.body}</span>
                </li>
              ))
            )}
          </ol>

          {errorMessage ? (
            <p
              style={{
                margin: 0,
                padding: '4px var(--space-sm)',
                fontSize: '12px',
                color: 'var(--color-status-critical)',
              }}
            >
              {errorMessage}
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', gap: 'var(--space-xs)', padding: 'var(--space-xs)', borderTop: '1px solid var(--color-border)' }}
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={chatConfig.maxMessageLength}
              placeholder="Mesaj yaz…"
              aria-label="Sohbet mesajı"
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: '32px',
                padding: '0 var(--space-xs)',
                background: 'var(--color-bg-base)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-primary)',
                fontSize: '12px',
              }}
            />
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              style={{
                minHeight: '32px',
                padding: '0 var(--space-sm)',
                background: 'var(--color-accent-gold)',
                color: '#1a1405',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: draft.trim().length === 0 ? 'not-allowed' : 'pointer',
                opacity: draft.trim().length === 0 ? 0.55 : 1,
              }}
            >
              Gönder
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}

/**
 * `createdAt` (ISO 8601, UTC) → yerel saat `SS:DD`.
 *
 * `toLocaleTimeString` BİLEREK kullanılmadı: sunucu tarafı render ile
 * istemci saati arasındaki fark, Next.js'in hidrasyon uyuşmazlığı
 * uyarısını tetikleyebilir (bu bileşen `'use client'` olsa da ilk render
 * sunucuda yapılır). `Date` metotlarıyla açıkça biçimlendirmek bu riski
 * ortadan kaldırır.
 */
function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
