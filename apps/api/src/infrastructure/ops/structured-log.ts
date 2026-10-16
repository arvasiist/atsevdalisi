import type { LoggerService } from '@nestjs/common';

/**
 * YAPILANDIRILMIŞ LOG (02.10.2026, Faz 13-C). Üretimde her log TEK SATIR
 * JSON'dur — barındırma sağlayıcısı ya da log toplayıcı (CloudWatch, Loki,
 * Datadog…) ne olursa olsun ayrıştırılabilir. Geliştirmede Nest'in renkli
 * logu korunur (`main.ts` yalnızca üretimde bunu takar).
 *
 * ⚠️ Buraya gizli değer YAZILMAZ: token, şifre, sıfırlama/doğrulama
 * bağlantısı ve e-posta içeriği hiçbir log çağrısına geçirilmez.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function formatLogLine(
  level: LogLevel,
  message: unknown,
  fields: Record<string, unknown> = {},
  now: Date = new Date(),
): string {
  const text = message instanceof Error ? message.message : typeof message === 'string' ? message : JSON.stringify(message);
  return JSON.stringify({ ts: now.toISOString(), level, msg: text, ...fields });
}

export function writeLog(level: LogLevel, message: unknown, fields: Record<string, unknown> = {}): void {
  const line = formatLogLine(level, message, fields);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

/** Nest'in iç loglarını (başlangıç, rota haritası, uyarılar) JSON'a çevirir. */
export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    writeLog('info', message, context ? { context } : {});
  }
  error(message: unknown, trace?: string, context?: string): void {
    writeLog('error', message, { ...(context ? { context } : {}), ...(trace ? { stack: trace } : {}) });
  }
  warn(message: unknown, context?: string): void {
    writeLog('warn', message, context ? { context } : {});
  }
  debug(message: unknown, context?: string): void {
    writeLog('debug', message, context ? { context } : {});
  }
  verbose(message: unknown, context?: string): void {
    writeLog('debug', message, context ? { context } : {});
  }
}
