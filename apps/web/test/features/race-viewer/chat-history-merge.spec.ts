import { describe, expect, it } from 'vitest';
import type { RaceChatMessageView } from '@at-sevdalisi/shared-types';
import { mergeChatMessages } from '../../../src/features/race-viewer/chat-history-merge';

function msg(messageId: string, createdAt: string, body = 'merhaba'): RaceChatMessageView {
  return { messageId, raceId: 'r1', playerId: 'p1', username: 'seyis', body, createdAt };
}

describe('mergeChatMessages', () => {
  it('boş bir listeye gelen mesajları createdAt\'e göre ARTAN sırada ekler', () => {
    const result = mergeChatMessages([], [msg('b', '2026-09-29T10:00:05.000Z'), msg('a', '2026-09-29T10:00:01.000Z')], 100);
    expect(result.map((m) => m.messageId)).toEqual(['a', 'b']);
  });

  it('reconnection senaryosu: chat.history HER abone olmada tekrar gelir — AYNI messageId TEKİLLEŞTİRİLİR', () => {
    const first = mergeChatMessages([], [msg('a', '2026-09-29T10:00:01.000Z'), msg('b', '2026-09-29T10:00:02.000Z')], 100);
    const afterReconnect = mergeChatMessages(first, [msg('a', '2026-09-29T10:00:01.000Z'), msg('b', '2026-09-29T10:00:02.000Z')], 100);
    expect(afterReconnect).toHaveLength(2);
  });

  it('YARIŞ DURUMU: canlı mesaj geçmişten ÖNCE gelirse eski mesaj listenin BAŞINA değil, KRONOLOJİK yerine girer', () => {
    // gateway `chat.history` okumasını `await` ederken odadaki başka bir
    // izleyicinin `chat.message.received`i ÖNCE varabilir; naif "sona ekle"
    // eski mesajı yeni mesajın ARKASINA koyardı.
    const live = mergeChatMessages([], [msg('yeni', '2026-09-29T10:00:09.000Z')], 100);
    const withHistory = mergeChatMessages(live, [msg('eski', '2026-09-29T10:00:01.000Z')], 100);
    expect(withHistory.map((m) => m.messageId)).toEqual(['eski', 'yeni']);
  });

  it('aynı createdAt\'te sıra messageId ile KARARLIDIR (iki taraf da aynı sonucu üretir)', () => {
    const a = mergeChatMessages([], [msg('zzz', '2026-09-29T10:00:01.000Z'), msg('aaa', '2026-09-29T10:00:01.000Z')], 100);
    const b = mergeChatMessages([], [msg('aaa', '2026-09-29T10:00:01.000Z'), msg('zzz', '2026-09-29T10:00:01.000Z')], 100);
    expect(a.map((m) => m.messageId)).toEqual(['aaa', 'zzz']);
    expect(b.map((m) => m.messageId)).toEqual(['aaa', 'zzz']);
  });

  it('limit AŞILINCA EN YENİ `limit` mesaj kalır (eskiler düşer)', () => {
    const incoming = [1, 2, 3, 4, 5].map((n) => msg(`m${n}`, `2026-09-29T10:00:0${n}.000Z`));
    const result = mergeChatMessages([], incoming, 3);
    expect(result.map((m) => m.messageId)).toEqual(['m3', 'm4', 'm5']);
  });

  it('DEĞİŞİKLİK YOKSA AYNI referansı döner (gereksiz render maliyeti üretmez)', () => {
    const existing = mergeChatMessages([], [msg('a', '2026-09-29T10:00:01.000Z')], 100);
    expect(mergeChatMessages(existing, [], 100)).toBe(existing);
    expect(mergeChatMessages(existing, [msg('a', '2026-09-29T10:00:01.000Z')], 100)).toBe(existing);
  });

  it('tekrarlı "reconnect" simülasyonlarında sonuç boyutu ASLA katlanmaz (bellek sızıntısı yok)', () => {
    let accumulated: RaceChatMessageView[] = [];
    const catchUpBatch = [msg('a', '2026-09-29T10:00:01.000Z'), msg('b', '2026-09-29T10:00:02.000Z')];
    for (let i = 0; i < 5; i += 1) {
      accumulated = mergeChatMessages(accumulated, catchUpBatch, 100);
    }
    expect(accumulated).toHaveLength(2);
  });
});
