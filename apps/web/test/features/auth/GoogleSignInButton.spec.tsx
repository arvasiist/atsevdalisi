// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { GoogleSignInButton, type GoogleIdentityApi } from '../../../src/features/auth/GoogleSignInButton';

/**
 * `GoogleSignInButton` (01.10.2026). Sabitlenenler:
 *   1. Google'a SUNUCUDAN gelen istemci kimliği verilir.
 *   2. Google'ın verdiği belge `onCredential`a AYNEN iletilir; boş belge iletilmez.
 *   3. Betik yüklenemezse kullanıcı bir hata görür (düğme sessizce kaybolmaz).
 */

let capturedCallback: ((response: { credential?: string }) => void) | null = null;
const initialize = vi.fn((options: { client_id: string; callback: (response: { credential?: string }) => void }) => {
  capturedCallback = options.callback;
});
const renderButton = vi.fn();

beforeEach(() => {
  capturedCallback = null;
  initialize.mockClear();
  renderButton.mockClear();
});

afterEach(() => {
  cleanup();
  delete window.google;
  document.head.querySelectorAll('script').forEach((script) => script.remove());
});

describe('GoogleSignInButton', () => {
  it('istemci kimliğiyle başlatır, düğmeyi çizer ve belgeyi aynen iletir', async () => {
    window.google = { accounts: { id: { initialize, renderButton } } } as GoogleIdentityApi;
    const onCredential = vi.fn();
    render(<GoogleSignInButton clientId="istemci-123.apps.googleusercontent.com" text="signin_with" onCredential={onCredential} />);

    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
    expect(initialize.mock.calls[0][0].client_id).toBe('istemci-123.apps.googleusercontent.com');
    expect(renderButton).toHaveBeenCalledWith(
      screen.getByTestId('google-signin-button'),
      expect.objectContaining({ text: 'signin_with', locale: 'tr' }),
    );

    capturedCallback?.({ credential: '' });
    capturedCallback?.({});
    expect(onCredential).not.toHaveBeenCalled();
    capturedCallback?.({ credential: 'google-belgesi' });
    expect(onCredential).toHaveBeenCalledWith('google-belgesi');
  });

  it('betik yüklenemezse hata gösterir', async () => {
    render(<GoogleSignInButton clientId="istemci-123" text="continue_with" onCredential={vi.fn()} />);
    const script = document.head.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    expect(script).not.toBeNull();
    script?.onerror?.(new Event('error'));
    expect(await screen.findByText('Google girişi yüklenemedi.')).toBeTruthy();
  });
});
