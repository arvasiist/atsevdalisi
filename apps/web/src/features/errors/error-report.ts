import { apiClient } from '../../lib/api-client';

/**
 * Hata sınırından sunucuya gönderilecek ALANLAR (02.10.2026, Faz 13-C) —
 * saf, test edilir. Yığın izi ve kullanıcı girdisi GÖNDERİLMEZ; yol sorgu
 * dizesi olmadan gider (sorguda kişisel veri / token olabilir).
 */
export function buildClientErrorReport(
  error: { message?: string; digest?: string },
  location: { pathname: string } | null,
): { message: string; digest?: string; path?: string } {
  const message = (error.message ?? '').trim() || 'Bilinmeyen istemci hatası';
  return {
    message,
    ...(error.digest ? { digest: error.digest } : {}),
    ...(location ? { path: location.pathname } : {}),
  };
}

export function reportBoundaryError(error: Error & { digest?: string }): void {
  const location = typeof window !== 'undefined' ? window.location : null;
  void apiClient.reportClientError(buildClientErrorReport(error, location));
}
