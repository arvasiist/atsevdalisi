// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AuthSession, PlayerSummary } from '@at-sevdalisi/shared-types';
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

const { getPlayerMock, registerPlayerMock, setAuthTokenMock } = vi.hoisted(() => ({
  getPlayerMock: vi.fn(),
  registerPlayerMock: vi.fn(),
  setAuthTokenMock: vi.fn(),
}));

vi.mock('../../src/lib/api-client', () => ({
  apiClient: {
    getPlayer: (...args: unknown[]) => getPlayerMock(...args),
    registerPlayer: (...args: unknown[]) => registerPlayerMock(...args),
  },
  setAuthToken: (...args: unknown[]) => setAuthTokenMock(...args),
}));

const STORAGE_KEY = 'atSevdalisi.playerId';
const TOKEN_STORAGE_KEY = 'atSevdalisi.authToken';

function samplePlayer(overrides: Partial<PlayerSummary> = {}): PlayerSummary {
  return {
    id: 'p1',
    displayName: 'Test Oyuncu',
    avatarId: null,
    level: 1,
    xp: 0,
    money: 1000,
    gems: 0,
    ...overrides,
  };
}

function TestConsumer(): React.ReactElement {
  const { player, isLoading, error, createPlayer } = usePlayer();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="player-name">{player?.displayName ?? 'yok'}</span>
      <span data-testid="error">{error ?? 'yok'}</span>
      <button type="button" onClick={() => void createPlayer()}>
        Oyuncu Oluştur
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
  });

  it('kayıtlı token artık geçersizse (backend 401/403 fırlatır) localStorage temizlenir ve "oyuncu oluştur" durumuna döner', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'p1');
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'eski-token');
    getPlayerMock.mockRejectedValueOnce(new Error('401 Unauthorized'));

    render(
      <PlayerProvider>
        <TestConsumer />
      </PlayerProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(setAuthTokenMock).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('player-name').textContent).toBe('yok');
  });

  it('createPlayer() yeni bir oturum açar, token\'ı etkinleştirir ve id+token\'ı localStorage\'a yazar', async () => {
    const session: AuthSession = {
      token: 'yeni-token',
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
