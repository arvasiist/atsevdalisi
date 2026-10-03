import { writeLog } from './structured-log';

/**
 * HATA RAPORLAMA (02.10.2026, Faz 13-C) — sağlayıcıdan bağımsız nokta.
 * Beklenmeyen sunucu hataları (500) ve istemciden gelen hata raporları
 * buradan geçer. Varsayılan raporlayıcı yapılandırılmış log yazar; bir hata
 * izleme hizmeti (Sentry vb.) seçildiğinde YALNIZCA `setErrorReporter` ile
 * yeni bir uygulama takılır — çağıranlar değişmez.
 *
 * ⚠️ Rapor içeriği istemciye DÖNMEZ; yığın izi yalnızca burada yaşar.
 */
export interface ErrorContext {
  requestId?: string;
  method?: string;
  path?: string;
  source: 'server' | 'client';
  [key: string]: unknown;
}

export interface ErrorReporter {
  report(error: unknown, context: ErrorContext): void;
}

export class LogErrorReporter implements ErrorReporter {
  report(error: unknown, context: ErrorContext): void {
    const details =
      error instanceof Error
        ? { errorName: error.name, stack: error.stack }
        : { errorValue: typeof error === 'string' ? error : JSON.stringify(error) };
    writeLog(context.source === 'client' ? 'warn' : 'error', error, { kind: `${context.source}_error`, ...context, ...details });
  }
}

let current: ErrorReporter = new LogErrorReporter();

export function setErrorReporter(reporter: ErrorReporter): void {
  current = reporter;
}

export function reportError(error: unknown, context: ErrorContext): void {
  try {
    current.report(error, context);
  } catch {
    // Raporlayıcının kendi hatası isteği DÜŞÜRMEMELİ.
  }
}
