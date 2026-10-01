import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResendEmailSender } from '../../src/infrastructure/email/resend-email-sender';

/**
 * Resend gönderimi (30.09.2026) — gerçek ağ YOK, `fetch` taklit edilir.
 * Sabitlenen: uç, yetki başlığı, gövde biçimi ve hata durumunda FIRLATMA
 * (çağıran use-case yutup loglar; istemciye farklı yanıt dönmez).
 */
describe('ResendEmailSender', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Resend API\'sine doğru uç, başlık ve gövdeyle POST eder', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new ResendEmailSender('re_test', 'Oyun <no-reply@ornek.com>').send({
      to: 'ali@ornek.com',
      subject: 'Konu',
      text: 'Gövde',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Oyun <no-reply@ornek.com>',
      to: ['ali@ornek.com'],
      subject: 'Konu',
      text: 'Gövde',
    });
  });

  it('HTTP hatasında fırlatır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('kota', { status: 429 })));
    await expect(
      new ResendEmailSender('re_test', 'x@ornek.com').send({ to: 'a@ornek.com', subject: 's', text: 't' }),
    ).rejects.toThrow('HTTP 429');
  });
});
