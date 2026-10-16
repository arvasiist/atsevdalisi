import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LogErrorReporter, reportError, setErrorReporter } from '../../src/infrastructure/ops/error-reporting';
import { bootstrapTestApp } from './test-helpers';

/**
 * METRİK UCU + ALARM KANCASI (08.10.2026). Kanıtlananlar:
 *   (1) `METRICS_TOKEN` yoksa uç yok (404); yanlış/eksik token 401.
 *   (2) Doğru token ile Prometheus metni: rota KALIBI etiketi (kullanıcı adı
 *       değil), eşleşmeyen adres tek `unmatched` etiketi, oyun göstergeleri.
 *   (3) `ALERT_WEBHOOK_URL` verilirse açılışta alarm raporlayıcısı takılır;
 *       sunucu hatası webhook'a gider — hata mesajı ve sorgu dizesi GİTMEZ.
 */
describe('Metrik ucu + alarm kancası (e2e)', () => {
  const TOKEN = 'metrics-token-for-e2e-0123456789';
  let app: INestApplication;

  beforeAll(async () => {
    delete process.env.METRICS_TOKEN;
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    delete process.env.METRICS_TOKEN;
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('token yapılandırılmamışsa 404; yanlış token 401', async () => {
    await http().get('/api/v1/metrics').expect(404);
    process.env.METRICS_TOKEN = TOKEN;
    await http().get('/api/v1/metrics').expect(401);
    await http().get('/api/v1/metrics').set('Authorization', 'Bearer yanlis').expect(401);
  });

  it('doğru token: rota kalıbı etiketleri, unmatched, oyun göstergeleri', async () => {
    process.env.METRICS_TOKEN = TOKEN;
    await http().get('/api/v1/players/profile/gizli_kullanici_adi');
    await http().get('/api/v1/bu-adres-yok-xyz');
    const response = await http().get('/api/v1/metrics').set('Authorization', `Bearer ${TOKEN}`).expect(200);
    expect(response.headers['content-type']).toContain('text/plain');
    const text = response.text;
    expect(text).toMatch(/http_requests_total\{method="GET",route="\/api\/v1\/players\/profile\/:username",status="\d+"\} \d+/);
    expect(text).toMatch(/http_requests_total\{method="GET",route="unmatched",status="404"\} \d+/);
    expect(text).not.toContain('gizli_kullanici_adi');
    expect(text).not.toContain('bu-adres-yok-xyz');
    expect(text).toContain('# TYPE http_request_duration_seconds histogram');
    expect(text).toContain('game_gauge_query_up 1');
    expect(text).toMatch(/game_players \d+/);
    expect(text).toMatch(/db_pool_connections\{state="total"\} \d+/);
  });

  it('alarm kancası: sunucu hatası webhook\'a gider, mesaj ve sorgu dizesi gitmez', async () => {
    const received: Array<Record<string, unknown>> = [];
    const server: Server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push(JSON.parse(body) as Record<string, unknown>);
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.ALERT_WEBHOOK_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    const alarmApp = await bootstrapTestApp();
    try {
      reportError(new Error('duplicate key (email)=(ayse@ornek.com)'), {
        source: 'server',
        method: 'POST',
        path: '/api/v1/races/1/join?token=gizli',
        requestId: 'req-e2e',
      });
      for (let attempt = 0; attempt < 50 && received.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        level: 'error',
        kind: 'server_error',
        errorName: 'Error',
        path: '/api/v1/races/1/join',
        requestId: 'req-e2e',
      });
      const serialized = JSON.stringify(received[0]);
      expect(serialized).not.toContain('ayse@ornek.com');
      expect(serialized).not.toContain('gizli');
    } finally {
      delete process.env.ALERT_WEBHOOK_URL;
      setErrorReporter(new LogErrorReporter());
      await alarmApp.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
