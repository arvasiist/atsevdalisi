import { describe, expect, it } from 'vitest';
import {
  AlertingErrorReporter,
  AlertThrottle,
  buildServerErrorAlert,
  type AlertPayload,
} from '../../src/infrastructure/ops/alerting';
import type { ErrorContext, ErrorReporter } from '../../src/infrastructure/ops/error-reporting';
import { escapeLabelValue, MetricsRegistry, routeLabel } from '../../src/infrastructure/ops/metrics';

/**
 * 08.10.2026 — metrik kaydı (Prometheus metin biçimi) ve alarm kancası.
 * Kilitlenenler: kardinalite (rota KALIBI, eşleşmeyen tek etiket), kaçış,
 * histogram kovaları; alarm soğuması + bastırılan sayısı; alarm GİZLİ/KİŞİSEL
 * veri taşımaz (mesaj, yığın izi, sorgu dizesi yok); istemci raporu alarm
 * üretmez; alarmın kendi hatası isteği düşürmez.
 */
describe('MetricsRegistry', () => {
  it('sayaç ve histogram Prometheus biçiminde', () => {
    const registry = new MetricsRegistry([0.1, 1]);
    registry.incCounter('http_requests_total', { method: 'GET', route: '/api/v1/races/:id', status: '200' });
    registry.incCounter('http_requests_total', { method: 'GET', route: '/api/v1/races/:id', status: '200' });
    registry.observe('http_request_duration_seconds', { method: 'GET', route: '/x' }, 0.05);
    registry.observe('http_request_duration_seconds', { method: 'GET', route: '/x' }, 0.5);
    registry.observe('http_request_duration_seconds', { method: 'GET', route: '/x' }, 3);
    const text = registry.render([{ name: 'game_players', help: 'Oyuncu', value: 7 }]);
    expect(text).toContain('# TYPE http_requests_total counter');
    expect(text).toContain('http_requests_total{method="GET",route="/api/v1/races/:id",status="200"} 2');
    expect(text).toContain('http_request_duration_seconds_bucket{method="GET",route="/x",le="0.1"} 1');
    expect(text).toContain('http_request_duration_seconds_bucket{method="GET",route="/x",le="1"} 2');
    expect(text).toContain('http_request_duration_seconds_bucket{method="GET",route="/x",le="+Inf"} 3');
    expect(text).toContain('http_request_duration_seconds_count{method="GET",route="/x"} 3');
    expect(text).toContain('# TYPE game_players gauge');
    expect(text).toContain('game_players 7');
  });

  it('etiket kaçışı ve rota kalıbı (kimlik ve sorgu değil)', () => {
    expect(escapeLabelValue('a"b\\c\nd')).toBe('a\\"b\\\\c\\nd');
    expect(routeLabel({ baseUrl: '', route: { path: '/api/v1/races/:id' } })).toBe('/api/v1/races/:id');
    expect(routeLabel({})).toBe('unmatched');
    expect(routeLabel({ route: { path: undefined } })).toBe('unmatched');
    // Eşleşmeyen istekte ara katmanın joker kalıbı kalır — ayrı etiket olmamalı.
    expect(routeLabel({ route: { path: '/api/v1/{*path}' } })).toBe('unmatched');
  });
});

describe('alarm kancası', () => {
  const context: ErrorContext = {
    source: 'server',
    method: 'POST',
    path: '/api/v1/races/123/join?token=gizli',
    requestId: 'req-1',
  };

  it('soğuma: pencere içinde bastırır, sonraki mesaj bastırılanları sayar', () => {
    const throttle = new AlertThrottle(1000);
    expect(throttle.record(0)).toEqual({ send: true, suppressed: 0 });
    expect(throttle.record(100).send).toBe(false);
    expect(throttle.record(200).send).toBe(false);
    expect(throttle.record(1500)).toEqual({ send: true, suppressed: 2 });
  });

  it('alarm metni yalnızca hata adı + rota + istek kimliği taşır (mesaj, yığın, sorgu YOK)', () => {
    const error = new Error('duplicate key value (email)=(ayse@ornek.com)');
    const payload = buildServerErrorAlert(error, context, 3);
    expect(payload.path).toBe('/api/v1/races/123/join');
    expect(payload.requestId).toBe('req-1');
    expect(payload.suppressedSinceLast).toBe(3);
    expect(payload.text).toBe(payload.content);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('ayse@ornek.com');
    expect(serialized).not.toContain('gizli');
    expect(serialized).not.toMatch(/\n\s+at /); // yığın izi satırı yok
  });

  it('istemci raporu alarm üretmez; sunucu hatası üretir; gönderim hatası yutulur', async () => {
    const sent: AlertPayload[] = [];
    const logged: string[] = [];
    const inner: ErrorReporter = { report: (_error, ctx) => logged.push(ctx.source) };
    let fail = false;
    const reporter = new AlertingErrorReporter(
      inner,
      {
        send: async (payload) => {
          if (fail) throw new Error('webhook düştü');
          sent.push(payload);
        },
      },
      new AlertThrottle(0),
      () => Date.now(),
    );
    reporter.report(new Error('x'), { source: 'client', path: '/x' });
    reporter.report(new TypeError('y'), context);
    fail = true;
    expect(() => reporter.report(new Error('z'), context)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logged).toEqual(['client', 'server', 'server']);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.errorName).toBe('TypeError');
  });
});
