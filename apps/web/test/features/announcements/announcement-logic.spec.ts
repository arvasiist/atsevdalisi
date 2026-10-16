import { describe, expect, it } from 'vitest';
import type { AnnouncementView } from '@at-sevdalisi/shared-types';
import {
  DISMISSED_MAX,
  addDismissed,
  announcementStripLayout,
  parseDismissed,
  visibleAnnouncements,
} from '../../../src/features/announcements/announcement-logic';

const item = (id: string): AnnouncementView => ({ id, title: id, body: 'b', level: 'info', startsAt: '2026-10-02T00:00:00Z', endsAt: null });

describe('duyuru şeridi kararları (Faz 11-A)', () => {
  it('kapatılan duyuru gizlenir', () => {
    expect(visibleAnnouncements([item('a'), item('b')], ['a']).map((x) => x.id)).toEqual(['b']);
  });
  it('kapatılanlar listesi tekrar etmez ve sınırlıdır', () => {
    let list: string[] = [];
    for (let index = 0; index < DISMISSED_MAX + 10; index += 1) list = addDismissed(list, `id-${index}`);
    list = addDismissed(list, 'id-60');
    expect(list).toHaveLength(DISMISSED_MAX);
    expect(list[0]).toBe('id-60');
    expect(new Set(list).size).toBe(list.length);
  });
  it('bozuk depolama boş listeye düşer', () => {
    expect(parseDismissed(null)).toEqual([]);
    expect(parseDismissed('{bozuk')).toEqual([]);
    expect(parseDismissed('[1,"a",null]')).toEqual(['a']);
  });
});

describe('kompakt duyuru şeridi (10.10.2026)', () => {
  const withLevel = (id: string, level: AnnouncementView['level']): AnnouncementView => ({ ...item(id), level });
  it('kapalıyken yalnızca en önemli duyuru; kalanı sayılır', () => {
    const list = [withLevel('a', 'info'), withLevel('b', 'maintenance'), withLevel('c', 'warning'), withLevel('d', 'info')];
    const closed = announcementStripLayout(list, false);
    expect(closed.shown.map((x) => x.id)).toEqual(['b']);
    expect(closed.hiddenCount).toBe(3);
    const open = announcementStripLayout(list, true);
    expect(open.shown.map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(open.hiddenCount).toBe(0);
  });
  it('tek duyuru ya da boş liste: gizlenen yok', () => {
    expect(announcementStripLayout([item('x')], false)).toEqual({ shown: [item('x')], hiddenCount: 0 });
    expect(announcementStripLayout([], false)).toEqual({ shown: [], hiddenCount: 0 });
  });
});
