import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { SchedulerLeaderService } from '../../src/infrastructure/scheduler/scheduler-leader';
import { bootstrapTestApp } from './test-helpers';

/**
 * ZAMANLAYICI LİDER KİLİDİ (02.10.2026). İki "örnek" aynı veritabanına
 * karşı iki servis nesnesiyle taklit edilir (gerçek Postgres oturum kilidi).
 * Kanıtlananlar: aynı anda tek lider; izleyici işi koşmaz; lider bırakınca ya
 * da bağlantısı ÖLDÜRÜLÜNCE izleyici devralır; her zamanlayıcının zamanlanmış
 * turu kapıdan geçer (kaynak taraması — yeni zamanlayıcı kapıyı unutursa kırılır).
 */
describe('Zamanlayıcı lider kilidi (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  // Çalışan başka bir örnek (ör. yerel geliştirme sunucusu) gerçek anahtarı
  // tutuyor olabilir — test kendi anahtarıyla koşar.
  const key = 9_100_000_000 + Math.floor(Math.random() * 1_000_000);
  class TestLeader extends SchedulerLeaderService {
    protected override readonly settings = { ...loadOpsConfig().schedulerLeader, lockKey: key };
  }

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const instance = () => new TestLeader(pool, app.get(AppConfigService));

  it('aynı anda tek lider; izleyici işi koşmaz; bırakınca devir', async () => {
    const a = instance();
    const b = instance();
    try {
      expect(await a.tryAcquire()).toBe(true);
      expect(await b.tryAcquire()).toBe(false);
      expect(a.isLeader()).toBe(true);
      expect(b.isLeader()).toBe(false);
      let runs = 0;
      expect(await b.runIfLeader(async () => ++runs)).toBeNull();
      expect(await a.runIfLeader(async () => ++runs)).toBe(1);
      expect(runs).toBe(1);
      // Lider tekrar denerse yalnızca yoklar ve lider kalır.
      expect(await a.tryAcquire()).toBe(true);

      await a.release();
      expect(a.isLeader()).toBe(false);
      expect(await b.tryAcquire()).toBe(true);
      expect(await a.tryAcquire()).toBe(false);
    } finally {
      await a.release();
      await b.release();
    }
  });

  it('liderin veritabanı oturumu öldürülürse kilit düşer, yoklama liderliği bırakır, izleyici devralır', async () => {
    const a = instance();
    const b = instance();
    try {
      expect(await a.tryAcquire()).toBe(true);
      const holder = await pool.query<{ pid: number }>(
        `SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND granted
           AND ((classid::bigint << 32) | objid::bigint) = $1::bigint`,
        [key],
      );
      expect(holder.rows).toHaveLength(1);
      await pool.query('SELECT pg_terminate_backend($1)', [holder.rows[0]!.pid]);
      expect(await a.checkHeartbeat()).toBe(false);
      expect(a.isLeader()).toBe(false);
      expect(await b.tryAcquire()).toBe(true);
    } finally {
      await a.release();
      await b.release();
    }
  });

  it('her zamanlayıcının zamanlanmış turu lider kapısından geçer', () => {
    const dir = join(__dirname, '../../src/infrastructure/scheduler');
    const files = readdirSync(dir).filter((file) => file.endsWith('.scheduler.ts'));
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8');
      const scheduleNext = source.slice(source.indexOf('private scheduleNext'));
      expect(scheduleNext, file).toContain('runIfLeader(() => this.tickNow())');
      expect(scheduleNext, file).not.toMatch(/void this\.tickNow\(\)/);
    }
  });
});
