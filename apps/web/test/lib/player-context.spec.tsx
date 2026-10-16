// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AuthSession, PlayerSummary } from '@at-sevdalisi/shared-types';
import { ApiError } from '../../src/lib/api-client';
import { PlayerProvider, usePlayer } from '../../src/lib/player-context';

/**
 * AUDIT_REPORT.md T2 (Medium) — `player-context.tsx`, projenin en kritik
 * frontend dosyası: bu turdaki "Bugün bulunan ve düzeltilen kritik
 * regresyon" (bkz. `claude/hizli-bitirme-plani.md`) TAM OLARAK bu
 * dosyanın auth/token akışındaki bir sözleşme kırılmasıydı ve o zaman
 * hiçbir test bunu YAKALAMAMIŞTI — yalnızca elle kod okuma. Bu dosya o
 * sınıf regresyona karşı gerçek bir güvenlik ağıdır: `apiClient.getPlayer`/
 * `registerPlayer`/`setAuthToken` `vi.mock` ile taklit edilir (gerçek
 * HTTP/backend YOK — `api-client.spec.ts`'in kendi kontratını zaten ayrı
 * test ettiği yer), ve `localStorage` + `usePlayer()` hook'unun DAVRANIŞI
 * gerçek bir DOM'a (jsdom) karşı doğrulanır.
 *
 * `vi.mock` çağrıları vitest'in derleme adımında dosyanın EN BAŞINA
 * hoisted edilir (yukarıdaki `import` ifadelerinden bile ÖNCE çalışır).
 * Mock fonksiyonları (`getPlayerMock` vb.) bu yüzden düz `const ... =
 * vi.fn()` ile DEĞİL, `vi.hoisted()` ile tanımlanır — aksi halde `vi.mock`
 * fabrikası çalıştığında bu değişkenler henüz initialize edilmemiş olurdu
 * ("Cannot access before initialization").
 */

const {
  getPlayerMock,
  registerPlayerMock,
  setAuthTokenMock,
  loginWithPasswordMock,
  loginWithGoogleMock,
  upgradeSessionMock,
  logoutMock,
  logoutAllMock,
} = vi.hoisted(() => ({
  getPlayerMock: vi.fn(),
  registerPlayerMock: vi.fn(),
  setAuthTokenMock: vi.fn(),
  loginWithPasswordMock: vi.fn(),
  loginWithGoogleMock: vi.fn(),
  upgradeSessionMock: vi.fn(),
  logoutMock: vi.fn(),
  logoutAllMock: vi.fn(),
}));

vi.mock('../../src/lib/api-client', async () => {
  // `ApiError` GERÇEK sınıftır — oturum yalnızca `status === 401`de silinir.
  const actual = await vi.importActual<typeof import('../../src/lib/api-client')>('../../src/lib/api-client');
  return {
    ApiError: actual.ApiError,
    apiClient: {
      getPlayer: (...args: unknown[]) => getPlayerMock(...args),
      registerPlayer: (...args: unknown[]) => registerPlayerMock(...args),
      loginWithPassword: (...args: unknown[]) => loginWithPasswordMock(...args),
      loginWithGoogle: (...args: unknown[]) => loginWithGoogleMock(...args),
      upgradeSession: (...args: unknown[]) => upgradeSessionMock(...args),
      logout: (...args: unknown[]) => logoutMock(...args),
      logoutAll: (...args: unknown[]) => logoutAllMock(...args),
      refreshSession: vi.fn(),
    },
    setAuthToken: (...args: unknown[]) => setAuthTokenMock(...args),
    getAuthToken: () => null,
    setSessionRefresher: vi.fn(),
    refreshSessionOnce: vi.fn(),
  };
});

const STORAGE_KEY = 'atSevdalisi.playerId';
const TOKEN_STORAGE_KEY = 'atSevdalisi.authToken';
const REFRESH_STORAGE_KEY = 'atSevdalisi.refreshToken';
const EXPIRES_AT = '2030-01-01T00:00:00.000Z';

function tokens(token: string) {
  return { token, refreshToken: `yenile-${token}`, accessTokenExpiresAt: EXPIRES_AT };
}

function samplePlayer(overrides: Partial<PlayerSummary> = {}): PlayerSummary {
  return {
    id: 'p1',
    displayName: 'Test Oyuncu',
    avatarId: null,
    level: 1,
    xp: 0,
    money: 1000,
    gems: 0,
    isAdmin: false,
    isModerator: false,
    ...overrides,
  };
}

function TestConsumer(): React.ReactElement {
  const { player, isLoading, error, createPlayer, loginWithPassword, loginWithGoogle, logout } = usePlayer();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="player-name">{player?.displayName ?? 'yok'}</span>
      <span data-testid="error">{error ?? 'yok'}</span>
      <button type="button" onClick={() => void createPlayer()}>
        Oyuncu Oluştur
      </button>
      <button type="button" onClick={() => void loginWithPassword('ali@ornek.com', 'sifre-12345')}>
        Giriş Yap
      </button>
      <button type="button" onClick={() => void loginWithGoogle('google-belgesi')}>
        Google Giriş
      </button>
      <button type="button" onClick={() => void logout()}>
        Çıkış
      </button>
    </div>
  );
}

describe('PlayerProvider / usePlayer', () => {
  beforeEach(() => {
    window.localStorage.clear();
    getPlayerMock.mockReset();
    registerPlayerMock.mockReset();
    setAuthTokenMock.mockReset();
    loginWithPasswordMock.mockReset();
    loginWithGoogleMock.mockReset();
    upgradeSessionMock.mockReset();
    logoutMock.mockReset().mockResolvedValue({ loggedOut: true });
    logoutAllMock.mockReset().mockResolvedValue({ loggedOut: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('localStorage boşsa hiç apiClient.getPlayer çağırmadan "oyuncu yok" durumuna geçer', async () => {
    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('player-name').textContent).toBe('yok');
    expect(getPlayerMock).not.toHaveBeenCalled();
  });

  it('localStorage\'da geçerli id+token varsa sayfa yüklenirken token HEMEN etkinleştirilir ve getPlayer çağrılır', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'p1');
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'tok-123');
    window.localStorage.setItem(REFRESH_STORAGE_KEY, 'yenile-123');
    getPlayerMock.mockResolvedValueOnce(samplePlayer());

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );

    // AUDIT_REPORT.md'nin bu turda düzeltilen regresyonu tam olarak
    // BUYDU: token, İLK korumalı istekten ÖNCE etkinleştirilmeliydi.
    expect(setAuthTokenMock).toHaveBeenCalledWith('tok-123');
    await waitFor(() => expect(screen.getByTestId('player-name').textContent).toBe('Test Oyuncu'));
    expect(getPlayerMock).toHaveBeenCalledWith('p1');
    expect(upgradeSessionMock).not.toHaveBeenCalled();
  });

  it('kayıtlı token artık geçersizse (sunucu 401) localStorage temizlenir ve "oyuncu oluştur" durumuna döner', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'p1');
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'eski-token');
    window.localStorage.setItem(REFRESH_STORAGE_KEY, 'yenile-eski');
    getPlayerMock.mockRejectedValueOnce(new ApiError('Geçersiz oturum', 'UNAUTHORIZED', 401));

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFRESH_STORAGE_KEY)).toBeNull();
    expect(setAuthTokenMock).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('player-name').textContent).toBe('yok');
  });

  it('AĞ HATASI oturumu SİLMEZ (eskiden her hata misafir hesabını kaybettiriyordu)', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'p1');
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'tok-ag');
    window.localStorage.setItem(REFRESH_STORAGE_KEY, 'yenile-ag');
    getPlayerMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('tok-ag');
    expect(window.localStorage.getItem(REFRESH_STORAGE_KEY)).toBe('yenile-ag');
    expect(screen.getByTestId('error').textContent).toMatch(/ulaşılamadı/);

    // "Oyuncu oluştur" depodaki oturumu EZMEZ: sunucu hâlâ yoksa yeni hesap açılmaz.
    getPlayerMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByText('Oyuncu Oluştur'));
    await waitFor(() => expect(getPlayerMock).toHaveBeenCalledTimes(2));
    expect(registerPlayerMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('tok-ag');

    // Sunucu dönünce aynı düğme mevcut oyuncuyu yükler.
    getPlayerMock.mockResolvedValueOnce(samplePlayer({ displayName: 'Geri Dönen' }));
    fireEvent.click(screen.getByText('Oyuncu Oluştur'));
    await waitFor(() => expect(screen.getByTestId('player-name').textContent).toBe('Geri Dönen'));
    expect(registerPlayerMock).not.toHaveBeenCalled();
  });

  it('askıdaki hesap (403 ACCOUNT_SUSPENDED): oturum SİLİNMEZ, sunucu mesajı gösterilir', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'p1');
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'tok-aski');
    window.localStorage.setItem(REFRESH_STORAGE_KEY, 'yenile-aski');
    getPlayerMock.mockRejectedValueOnce(new ApiError('Hesabın askıya alındı. Gerekçe: spam', 'ACCOUNT_SUSPENDED', 403));

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('error').textContent).toMatch(/askıya alındı/));
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('tok-aski');
    expect(window.localStorage.getItem(REFRESH_STORAGE_KEY)).toBe('yenile-aski');
  });

  it('refresh token\'ı olmayan ESKİ oturum açılışta yükseltilir ve yeni token\'lar yazılır', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'p1');
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'eski-tip');
    upgradeSessionMock.mockResolvedValueOnce(tokens('oturumlu'));
    getPlayerMock.mockResolvedValueOnce(samplePlayer());

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('player-name').textContent).toBe('Test Oyuncu'));
    expect(upgradeSessionMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('oturumlu');
    expect(window.localStorage.getItem(REFRESH_STORAGE_KEY)).toBe('yenile-oturumlu');
    expect(setAuthTokenMock).toHaveBeenLastCalledWith('oturumlu');
  });

  it('yükseltme ağ hatasıyla düşerse eski token\'la devam edilir (silinmez)', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'p1');
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'eski-tip');
    upgradeSessionMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    getPlayerMock.mockResolvedValueOnce(samplePlayer());

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('player-name').textContent).toBe('Test Oyuncu'));
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('eski-tip');
  });

  it('createPlayer() yeni bir oturum açar, token\'ı etkinleştirir ve id+token\'ı localStorage\'a yazar', async () => {
    const session: AuthSession = {
      ...tokens('yeni-token'),
      player: samplePlayer({ id: 'p2', displayName: 'Yeni Oyuncu' }),
    };
    registerPlayerMock.mockResolvedValueOnce(session);

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    fireEvent.click(screen.getByText('Oyuncu Oluştur'));

    await waitFor(() => expect(screen.getByTestId('player-name').textContent).toBe('Yeni Oyuncu'));
    expect(setAuthTokenMock).toHaveBeenCalledWith('yeni-token');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('p2');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('yeni-token');
    expect(window.localStorage.getItem(REFRESH_STORAGE_KEY)).toBe('yenile-yeni-token');
  });

  it('createPlayer() başarısız olursa hatayı error alanına yazar ve localStorage\'a hiçbir şey YAZMAZ', async () => {
    registerPlayerMock.mockRejectedValueOnce(new Error('Sunucu hatası'));

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    fireEvent.click(screen.getByText('Oyuncu Oluştur'));

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('Sunucu hatası'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('loginWithPassword() oturumu bu tarayıcıya yazar; logout() siler ve oyuncuyu boşaltır (30.09.2026)', async () => {
    loginWithPasswordMock.mockResolvedValueOnce({
      ...tokens('giris-token'),
      player: samplePlayer({ id: 'p9', displayName: 'Dönen Oyuncu' }),
    } satisfies AuthSession);

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    fireEvent.click(screen.getByText('Giriş Yap'));
    await waitFor(() => expect(screen.getByTestId('player-name').textContent).toBe('Dönen Oyuncu'));
    expect(loginWithPasswordMock).toHaveBeenCalledWith('ali@ornek.com', 'sifre-12345');
    expect(setAuthTokenMock).toHaveBeenCalledWith('giris-token');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('p9');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('giris-token');

    fireEvent.click(screen.getByText('Çıkış'));
    await waitFor(() => expect(screen.getByTestId('player-name').textContent).toBe('yok'));
    // Çıkış SUNUCUDA da oturumu kapatır (02.10.2026).
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFRESH_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(setAuthTokenMock).toHaveBeenLastCalledWith(null);
  });

  it('loginWithGoogle() oturumu bu tarayıcıya yazar (01.10.2026)', async () => {
    loginWithGoogleMock.mockResolvedValueOnce({
      ...tokens('google-token'),
      player: samplePlayer({ id: 'p7', displayName: 'Google Oyuncu' }),
    } satisfies AuthSession);

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    fireEvent.click(screen.getByText('Google Giriş'));
    await waitFor(() => expect(screen.getByTestId('player-name').textContent).toBe('Google Oyuncu'));
    expect(loginWithGoogleMock).toHaveBeenCalledWith('google-belgesi');
    expect(setAuthTokenMock).toHaveBeenCalledWith('google-token');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('p7');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('google-token');
  });

  it('usePlayer(), <PlayerProvider> dışında çağrılırsa açıklayıcı bir hata fırlatır', () => {
    function Broken(): React.ReactElement {
      usePlayer();
      return <div />;
    }

    // React, hata sınırı olmadan render hatalarını konsola da yazar —
    // bu test yalnızca fırlatılan hatayı doğruluyor, konsol gürültüsü
    // test sonucunu etkilemez.
    expect(() => render(<Broken />)).toThrow(/PlayerProvider/);
  });
});
