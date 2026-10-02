import { describe, expect, it } from 'vitest';
import type { AnnouncementView } from '@at-sevdalisi/shared-types';
import {
  DISMISSED_MAX,
  addDismissed,
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
