import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildClientErrorReport } from '../../../src/features/errors/error-report';
import { API_BASE_URL, apiClient } from '../../../src/lib/api-client';

describe('buildClientErrorReport (Faz 13-C)', () => {
  it('yalnızca mesaj, özet ve SORGUSUZ yol gönderir', () => {
    expect(buildClientErrorReport({ message: 'patladı', digest: 'abc' }, { pathname: '/races' })).toEqual({
      message: 'patladı',
      digest: 'abc',
      path: '/races',
    });
  });
  it('boş mesaj genel metne düşer; konum yoksa yol gönderilmez', () => {
    expect(buildClientErrorReport({ message: '  ' }, null)).toEqual({ message: 'Bilinmeyen istemci hatası' });
  });
});

describe('apiClient.reportClientError', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POST /client-errors; ağ hatasını YUTAR (hata ekranı ikinci hata üretmez)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiClient.reportClientError({ message: 'x' })).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/client-errors`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ message: 'x' });
  });
});
