import { loadOpsConfig } from '@at-sevdalisi/game-config';

/**
 * METRİKLER (08.10.2026) — bağımlılıksız, süreç içi kayıt + Prometheus metin
 * biçimi (`GET /metrics`). Sağlayıcıdan bağımsız: Prometheus, Grafana Agent,
 * Datadog/OTel toplayıcısı bu biçimi kazır.
 *
 * ⚠️ Etiketler SINIRLI kümedir: rota KALIBI (`/api/v1/races/:id`, kimlik
 * değil), HTTP yöntemi, durum kodu, hata kaynağı. Oyuncu kimliği, sorgu
 * dizesi ya da girdi etiket YAPILMAZ — hem kişisel veri hem de sınırsız
 * zaman serisi (kardinalite) olurdu.
 */

export type Labels = Record<string, string>;

export interface GaugeSample {
  name: string;
  help: string;
  value: number;
  labels?: Labels;
}

interface HistogramSeries {
  labels: Labels;
  buckets: number[];
  sum: number;
  count: number;
}

const HELP: Record<string, string> = {
  http_requests_total: 'HTTP istek sayısı (yöntem, rota kalıbı, durum kodu).',
  http_request_duration_seconds: 'HTTP istek süresi (saniye).',
  app_errors_total: 'Raporlanan hata sayısı (server = beklenmeyen 500, client = istemci raporu).',
};

export function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}="${escapeLabelValue(labels[key] ?? '')}"`)
    .join(',');
}

function formatLabels(labels: Labels, extra?: [string, string]): string {
  const parts = labelKey(labels);
  const tail = extra ? `${extra[0]}="${escapeLabelValue(extra[1])}"` : '';
  const joined = [parts, tail].filter((part) => part.length > 0).join(',');
  return joined.length > 0 ? `{${joined}}` : '';
}

/** Ondalık değerlerde (süre toplamı) mikrosaniye hassasiyeti yeter. */
const FRACTION_DIGITS = 6;

function formatNumber(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return '+Inf';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(FRACTION_DIGITS)));
}

export class MetricsRegistry {
  private readonly counters = new Map<string, Map<string, { labels: Labels; value: number }>>();
  private readonly histograms = new Map<string, Map<string, HistogramSeries>>();

  constructor(private readonly bucketBounds: readonly number[]) {}

  incCounter(name: string, labels: Labels, by = 1): void {
    const series = this.counters.get(name) ?? new Map<string, { labels: Labels; value: number }>();
    const key = labelKey(labels);
    const current = series.get(key) ?? { labels, value: 0 };
    current.value += by;
    series.set(key, current);
    this.counters.set(name, series);
  }

  observe(name: string, labels: Labels, value: number): void {
    const series = this.histograms.get(name) ?? new Map<string, HistogramSeries>();
    const key = labelKey(labels);
    const current = series.get(key) ?? { labels, buckets: this.bucketBounds.map(() => 0), sum: 0, count: 0 };
    this.bucketBounds.forEach((bound, index) => {
      if (value <= bound) current.buckets[index] = (current.buckets[index] ?? 0) + 1;
    });
    current.sum += value;
    current.count += 1;
    series.set(key, current);
    this.histograms.set(name, series);
  }

  /** Prometheus metin biçimi (0.0.4). Göstergeler kazıma anında verilir. */
  render(gauges: readonly GaugeSample[] = []): string {
    const lines: string[] = [];
    for (const [name, series] of [...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`# HELP ${name} ${HELP[name] ?? name}`, `# TYPE ${name} counter`);
      for (const { labels, value } of series.values()) lines.push(`${name}${formatLabels(labels)} ${formatNumber(value)}`);
    }
    for (const [name, series] of [...this.histograms.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`# HELP ${name} ${HELP[name] ?? name}`, `# TYPE ${name} histogram`);
      for (const { labels, buckets, sum, count } of series.values()) {
        this.bucketBounds.forEach((bound, index) => {
          lines.push(`${name}_bucket${formatLabels(labels, ['le', formatNumber(bound)])} ${buckets[index] ?? 0}`);
        });
        lines.push(`${name}_bucket${formatLabels(labels, ['le', '+Inf'])} ${count}`);
        lines.push(`${name}_sum${formatLabels(labels)} ${formatNumber(sum)}`);
        lines.push(`${name}_count${formatLabels(labels)} ${count}`);
      }
    }
    const seenGauges = new Set<string>();
    for (const gauge of gauges) {
      if (!seenGauges.has(gauge.name)) {
        lines.push(`# HELP ${gauge.name} ${gauge.help}`, `# TYPE ${gauge.name} gauge`);
        seenGauges.add(gauge.name);
      }
      lines.push(`${gauge.name}${formatLabels(gauge.labels ?? {})} ${formatNumber(gauge.value)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  /** Yalnızca testler için. */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}

/**
 * Rota etiketi: Express'in eşleştirdiği KALIP (`/api/v1/races/:id`).
 * Eşleşmeyen istek (404) tek bir `unmatched` etiketinde toplanır — yoksa
 * rastgele adresler sınırsız zaman serisi üretirdi. ⚠️ Eşleşmeyen istekte
 * Express `route`u ara katmanların joker kalıbı (`/api/v1/{*path}`) olarak
 * bırakır; joker içeren kalıp da `unmatched` sayılır (projede joker rotalı
 * controller yok — yalnızca ara katmanlar).
 */
export function routeLabel(request: { baseUrl?: string; route?: { path?: unknown } }): string {
  const path = request.route?.path;
  if (typeof path !== 'string' || path.length === 0 || path.includes('{*')) return 'unmatched';
  return `${request.baseUrl ?? ''}${path}`;
}

/** Süreç geneli tek kayıt (hata raporlama `current` raporlayıcısıyla aynı desen). */
export const metrics = new MetricsRegistry(loadOpsConfig().metrics.durationBucketsSeconds);
