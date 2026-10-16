import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import {
  LogErrorReporter,
  setErrorReporter,
  type ErrorContext,
} from '../../src/infrastructure/ops/error-reporting';
import { bootstrapTestApp } from './test-helpers';

/**
 * İSTEMCİ HATA RAPORU (02.10.2026, Faz 13-C) — `POST /client-errors`.
 * Oturumsuz çalışır, raporlayıcıya istek kimliğiyle gider, alanlar
 * config sınırında kırpılır, mesajsız gövde 400. Veritabanına yazmaz.
 */
describe('POST /client-errors (e2e)', () => {
  let app: INestApplication;
  const reports: Array<{ error: unknown; context: ErrorContext }> = [];

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    reports.length = 0;
    setErrorReporter(new LogErrorReporter());
  });

  it('oturumsuz rapor 202; raporlayıcıya istek kimliğiyle ve kırpılmış alanlarla gider', async () => {
    setErrorReporter({ report: (error, context) => reports.push({ error, context }) });
    const limits = loadOpsConfig().clientErrors;
    const response = await request(app.getHttpServer())
      .post('/api/v1/client-errors')
      .set('X-Request-Id', 'istemci-hata-1')
      .send({ message: 'x'.repeat(limits.maxMessageLength + 50), digest: 'd1', path: '/races' })
      .expect(202);
    expect(response.body.data).toEqual({ accepted: true });
    expect(reports).toHaveLength(1);
    expect(reports[0]!.error).toHaveLength(limits.maxMessageLength);
    expect(reports[0]!.context).toMatchObject({ source: 'client', requestId: 'istemci-hata-1', digest: 'd1', clientPath: '/races' });
  });

  it('mesajsız / metin olmayan gövde 400 ve rapor yok', async () => {
    setErrorReporter({ report: (error, context) => reports.push({ error, context }) });
    for (const body of [{}, { message: '' }, { message: 42 }]) {
      await request(app.getHttpServer()).post('/api/v1/client-errors').send(body).expect(400);
    }
    expect(reports).toHaveLength(0);
  });
});
