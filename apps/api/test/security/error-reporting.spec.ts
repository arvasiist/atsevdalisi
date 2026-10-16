import type { ArgumentsHost } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';
import {
  LogErrorReporter,
  setErrorReporter,
  type ErrorContext,
  type ErrorReporter,
} from '../../src/infrastructure/ops/error-reporting';
import { formatLogLine } from '../../src/infrastructure/ops/structured-log';

/** Faz 13-C (02.10.2026) — beklenmeyen hata raporlanır, istemciye sızmaz. */
function fakeHost(request: Record<string, unknown>) {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
    setHeader() {
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('HttpExceptionFilter + hata raporlayıcı', () => {
  afterEach(() => setErrorReporter(new LogErrorReporter()));

  it('beklenmeyen hata raporlayıcıya istek bağlamıyla gider; yanıtta yığın izi YOK', () => {
    const reports: Array<{ error: unknown; context: ErrorContext }> = [];
    const spy: ErrorReporter = { report: (error, context) => reports.push({ error, context }) };
    setErrorReporter(spy);
    const { host, sent } = fakeHost({ requestId: 'req-42', method: 'POST', originalUrl: '/api/v1/x?token=gizli' });

    new HttpExceptionFilter().catch(new Error('veritabanı patladı /srv/app/secret.ts'), host);

    expect(sent.status).toBe(500);
    expect(sent.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Beklenmeyen bir hata oluştu.', requestId: 'req-42' },
    });
    expect(JSON.stringify(sent.body)).not.toMatch(/patladı|secret|stack|at /);
    expect(reports).toHaveLength(1);
    // Sorgu dizesi (token olabilir) rapora girmez.
    expect(reports[0]!.context).toMatchObject({ source: 'server', requestId: 'req-42', method: 'POST', path: '/api/v1/x' });
  });

  it('raporlayıcının kendi hatası yanıtı bozmaz', () => {
    setErrorReporter({
      report: () => {
        throw new Error('raporlayıcı çöktü');
      },
    });
    const { host, sent } = fakeHost({});
    new HttpExceptionFilter().catch(new Error('x'), host);
    expect(sent.status).toBe(500);
  });
});

describe('formatLogLine', () => {
  it('tek satır JSON, zaman + düzey + mesaj + alanlar', () => {
    const line = formatLogLine('error', new Error('boom'), { requestId: 'r1' }, new Date('2026-10-02T00:00:00Z'));
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({ ts: '2026-10-02T00:00:00.000Z', level: 'error', msg: 'boom', requestId: 'r1' });
  });
});
