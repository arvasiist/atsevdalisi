import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAuthConfig } from '@at-sevdalisi/game-config';
import { EmailDeliveryError, EmailNotConfiguredError } from '../../src/domain/auth/errors';
import { OutboxEmailSender } from '../../src/infrastructure/email/outbox-email-sender';
import { ResendEmailSender } from '../../src/infrastructure/email/resend-email-sender';

/**
 * Resend gönderimi (30.09.2026; 16.10.2026 zaman aşımı + anlaşılır hata) — gerçek
 * ağ YOK, `fetch` taklit edilir. Sabitlenen: uç, yetki başlığı, gövde biçimi,
 * zaman aşımı sinyali, hata durumunda `EmailDeliveryError` (kullanıcı mesajı
 * genel) ve loglarda anahtar/alıcı/içerik GEÇMEMESİ.
 */
const KEY = 're_gizliTestAnahtari123';
const TIMEOUT = loadAuthConfig().email.deliveryTimeoutMs;
const mail = { to: 'ali@ornek.com', subject: 'Konu', text: 'Gizli bağlantı https://x/reset?token=abc' };

describe('ResendEmailSender', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Resend API\'sine doğru uç, başlık, gövde ve zaman aşımı sinyaliyle POST eder', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new ResendEmailSender(KEY, 'Oyun <no-reply@ornek.com>', TIMEOUT).send(mail);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Oyun <no-reply@ornek.com>',
      to: ['ali@ornek.com'],
      subject: 'Konu',
      text: mail.text,
    });
  });

  it('HTTP hatasında EmailDeliveryError; log anahtar, alıcı ve içeriği taşımaz', async () => {
    const logs = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"domain is not verified"}', { status: 403 })));
    const error = await new ResendEmailSender(KEY, 'x@ornek.com', TIMEOUT).send(mail).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect((error as Error).message).not.toMatch(/403|domain/);
    const logged = logs.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).toContain('HTTP 403');
    expect(logged).toContain('domain is not verified');
    for (const secret of [KEY, mail.to, 'token=abc']) expect(logged).not.toContain(secret);
  });

  it('ağ hatası ve zaman aşımı da EmailDeliveryError (istek asılı kalmaz)', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(new ResendEmailSender(KEY, 'x@ornek.com', TIMEOUT).send(mail)).rejects.toBeInstanceOf(EmailDeliveryError);

    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('zaman aşımı', 'TimeoutError')));
      })),
    );
    await expect(new ResendEmailSender(KEY, 'x@ornek.com', 20).send(mail)).rejects.toBeInstanceOf(EmailDeliveryError);
  });
});

describe('OutboxEmailSender (anahtar yokken)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('üretimde "gönderildi" DEMEZ: EmailNotConfiguredError ve içerik bellekte tutulmaz', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const sender = new OutboxEmailSender('production');
    await expect(sender.send(mail)).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(sender.outbox).toHaveLength(0);
    expect(warn.mock.calls.map((call) => String(call[0])).join(' ')).not.toContain('token=abc');
  });

  it('geliştirme/testte giden kutusuna yazar', async () => {
    const sender = new OutboxEmailSender('test');
    await sender.send(mail);
    expect(sender.outbox).toEqual([mail]);
  });
});
