import type { ErrorContext, ErrorReporter } from './error-reporting';

/**
 * ALARM KANCASI (08.10.2026) — sağlayıcıdan bağımsız. `ALERT_WEBHOOK_URL`
 * verilirse beklenmeyen SUNUCU hataları (500) bu adrese JSON olarak POST
 * edilir. Gövde hem `text` (Slack) hem `content` (Discord) taşır; başka bir
 * hedef (Teams, PagerDuty köprüsü, kendi uç noktan) aynı alanları okuyabilir.
 *
 * ⚠️ Alarm İÇERİĞİ: yalnızca hata ADI, yöntem, rota (sorgu dizesi atılır) ve
 * istek kimliği. Hata MESAJI, yığın izi, token, gövde GÖNDERİLMEZ — mesaj
 * veritabanı değeri/girdi taşıyabilir (CLAUDE.md (43)); ayrıntı loglarda
 * istek kimliğiyle bulunur. İstemci raporları (`source: 'client'`) alarm
 * üretmez — herkes gönderebildiği için gürültü/taciz aracı olurdu.
 *
 * Soğuma: en fazla `cooldownSeconds`te bir mesaj; arada bastırılanlar bir
 * sonraki mesajda sayılır (alarm fırtınası olmaz).
 */

export interface AlertPayload {
  text: string;
  content: string;
  level: 'error';
  kind: 'server_error';
  errorName: string;
  method: string | null;
  path: string | null;
  requestId: string | null;
  suppressedSinceLast: number;
}

export interface AlertSender {
  send(payload: AlertPayload): Promise<void>;
}

/** Saf soğuma durumu. */
export class AlertThrottle {
  private lastSentAt: number | null = null;
  private suppressed = 0;

  constructor(private readonly cooldownMs: number) {}

  /** `send: true` ise mesaj gönderilmeli; `suppressed` o ana kadar bastırılanlar. */
  record(nowMs: number): { send: boolean; suppressed: number } {
    if (this.lastSentAt !== null && nowMs - this.lastSentAt < this.cooldownMs) {
      this.suppressed += 1;
      return { send: false, suppressed: this.suppressed };
    }
    const suppressed = this.suppressed;
    this.suppressed = 0;
    this.lastSentAt = nowMs;
    return { send: true, suppressed };
  }
}

export function stripQuery(path: string | undefined): string | null {
  if (!path) return null;
  return path.split('?')[0] ?? null;
}

export function buildServerErrorAlert(
  error: unknown,
  context: ErrorContext,
  suppressed: number,
): AlertPayload {
  const errorName = error instanceof Error ? error.name : typeof error;
  const method = typeof context.method === 'string' ? context.method : null;
  const path = stripQuery(typeof context.path === 'string' ? context.path : undefined);
  const requestId = typeof context.requestId === 'string' ? context.requestId : null;
  const where = [method, path].filter(Boolean).join(' ');
  const tail = suppressed > 0 ? ` (+${suppressed} hata önceki mesajdan beri bastırıldı)` : '';
  const text = `🚨 At Sevdalısı API — sunucu hatası: ${errorName}${where ? ` · ${where}` : ''}${
    requestId ? ` · istek ${requestId}` : ''
  }${tail}`;
  return { text, content: text, level: 'error', kind: 'server_error', errorName, method, path, requestId, suppressedSinceLast: suppressed };
}

export class WebhookAlertSender implements AlertSender {
  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
  ) {}

  async send(payload: AlertPayload): Promise<void> {
    await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}

/** Var olan raporlayıcıyı sarar: her hata yine loglanır, sunucu hatası ek olarak alarm üretir. */
export class AlertingErrorReporter implements ErrorReporter {
  constructor(
    private readonly inner: ErrorReporter,
    private readonly sender: AlertSender,
    private readonly throttle: AlertThrottle,
    private readonly now: () => number = Date.now,
  ) {}

  report(error: unknown, context: ErrorContext): void {
    this.inner.report(error, context);
    if (context.source !== 'server') return;
    const decision = this.throttle.record(this.now());
    if (!decision.send) return;
    // Gönderim isteği BEKLETMEZ; alarmın kendi hatası yutulur (alarm, alarm üretmez).
    void this.sender.send(buildServerErrorAlert(error, context, decision.suppressed)).catch(() => undefined);
  }
}
