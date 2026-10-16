import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import { parseNotificationSignal } from '../../../src/infrastructure/realtime/notification-stream';

/** 16.10.2026 — canlı bildirim akışı: tetikleyici kanalı = config kanalı; yük yalnızca kimlik. */
const MIGRATION = join(__dirname, '../../../../../database/migrations/0088_notification_stream.up.sql');

describe('bildirim akışı', () => {
  it('migration tetikleyicisinin kanalı config ile AYNI', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const channel = loadOpsConfig().realtime.notificationStream.channel;
    expect(sql).toContain(`pg_notify('${channel}'`);
    // Yük kişisel veri taşımaz: yalnızca kimlikler.
    expect(sql).toMatch(/json_build_object\('id', NEW\.id, 'playerId', NEW\.player_id\)/);
  });

  it('yük ayrıştırıcısı bozuk/eksik yükü yok sayar', () => {
    expect(parseNotificationSignal('{"id":"a","playerId":"b"}')).toEqual({ id: 'a', playerId: 'b' });
    expect(parseNotificationSignal(undefined)).toBeNull();
    expect(parseNotificationSignal('not json')).toBeNull();
    expect(parseNotificationSignal('{"id":1,"playerId":"b"}')).toBeNull();
    expect(parseNotificationSignal('null')).toBeNull();
  });
});
