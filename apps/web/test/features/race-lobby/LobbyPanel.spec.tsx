// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PublicHorse, RaceLobbyListItem } from '@at-sevdalisi/shared-types';
import { LobbyPanel } from '../../../src/features/race-lobby/LobbyPanel';

/**
 * `LobbyPanel` — ücretli lobi yarışının ilk istemci yüzeyi (30.09.2026).
 *
 * ASIL konu **`Idempotency-Key` yaşam döngüsüdür** (`BreedingPanel.spec`
 * ile AYNI gerekçe): katılma ve ayrılma para yoludur. Sabitlenenler:
 *   1. Başarısız katılımda anahtar YAŞAR — yeniden deneme AYNI anahtarla gider.
 *   2. Başarıda anahtar TÜKENİR.
 *   3. "Hazırım" para yolu değildir — anahtar üretmez.
 *   4. Düğmeler yalnızca sunucunun `myEntry` alanından türer ve her işlemden
 *      sonra liste sunucudan yeniden çekilir.
 */

const mocks = vi.hoisted(() => ({
  listLobbyRaces: vi.fn(),
  joinLobbyRace: vi.fn(),
  leaveLobbyRace: vi.fn(),
  setLobbyEntryReady: vi.fn(),
  createLobbyRace: vi.fn(),
}));

vi.mock('../../../src/lib/api-client', () => ({
  apiClient: {
    listLobbyRaces: (...args: unknown[]) => mocks.listLobbyRaces(...args),
    joinLobbyRace: (...args: unknown[]) => mocks.joinLobbyRace(...args),
    leaveLobbyRace: (...args: unknown[]) => mocks.leaveLobbyRace(...args),
    setLobbyEntryReady: (...args: unknown[]) => mocks.setLobbyEntryReady(...args),
    createLobbyRace: (...args: unknown[]) => mocks.createLobbyRace(...args),
  },
}));

const horse = { id: 'horse-1', name: 'Rüzgar', level: 3 } as PublicHorse;

function lobbyRace(overrides: Partial<RaceLobbyListItem> = {}): RaceLobbyListItem {
  return {
    id: 'race-1',
    name: 'Akşam Kupası',
    fieldSize: 12,
    maxPlayers: 8,
    joinedPlayers: 1,
    entryFee: 100,
    prizePool: 100,
    startTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    status: 'scheduled',
    raceType: 'paid',
    surface: 'grass',
    weather: 'sunny',
    distanceMeters: 1600,
    tribuneFee: 0,
    spectatorCapacity: 500,
    createdBy: null,
    createdAt: new Date().toISOString(),
    prizeMultiplier: null,
    myEntry: null,
    tournament: null,
    ...overrides,
  } as RaceLobbyListItem;
}

let keyCounter = 0;
const onBalanceChanged = vi.fn(async () => undefined);

beforeEach(() => {
  keyCounter = 0;
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  onBalanceChanged.mockClear();
  vi.stubGlobal('crypto', { randomUUID: () => `key-${++keyCounter}` });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LobbyPanel', () => {
  it('katılım yokken yalnızca "Katıl" görünür', async () => {
    mocks.listLobbyRaces.mockResolvedValue([lobbyRace()]);
    render(<LobbyPanel horses={[horse]} onBalanceChanged={onBalanceChanged} />);
    expect(await screen.findByRole('button', { name: 'Katıl' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hazırım' })).toBeNull();
  });

  it('başarısız katılımda anahtar YAŞAR, başarıda tükenir; bakiye tazelenir', async () => {
    mocks.listLobbyRaces.mockResolvedValue([lobbyRace()]);
    mocks.joinLobbyRace.mockRejectedValueOnce(new Error('Ağ hatası')).mockResolvedValueOnce({});
    render(<LobbyPanel horses={[horse]} onBalanceChanged={onBalanceChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Katıl' }));
    expect(await screen.findByText('Ağ hatası')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Katıl' }));
    await waitFor(() => expect(mocks.joinLobbyRace).toHaveBeenCalledTimes(2));

    expect(mocks.joinLobbyRace.mock.calls[0]).toEqual(['race-1', { horseId: 'horse-1' }, 'key-1']);
    expect(mocks.joinLobbyRace.mock.calls[1][2]).toBe('key-1');
    await waitFor(() => expect(onBalanceChanged).toHaveBeenCalledTimes(1));
  });

  it('katıldıysa "Hazırım" + "Ayrıl"; Hazırım anahtar ÜRETMEZ ve listeyi yeniler', async () => {
    mocks.listLobbyRaces.mockResolvedValue([lobbyRace({ myEntry: { status: 'waiting', horseId: 'horse-1' } })]);
    mocks.setLobbyEntryReady.mockResolvedValue({});
    render(<LobbyPanel horses={[horse]} onBalanceChanged={onBalanceChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Hazırım' }));
    await waitFor(() => expect(mocks.setLobbyEntryReady).toHaveBeenCalledWith('race-1', 'ready'));
    expect(keyCounter).toBe(0);
    await waitFor(() => expect(mocks.listLobbyRaces).toHaveBeenCalledTimes(2));
    expect(onBalanceChanged).not.toHaveBeenCalled();
  });

  it('ayrılma anahtarla gider ve bakiye tazelenir', async () => {
    mocks.listLobbyRaces.mockResolvedValue([lobbyRace({ myEntry: { status: 'ready', horseId: 'horse-1' } })]);
    mocks.leaveLobbyRace.mockResolvedValue({});
    render(<LobbyPanel horses={[horse]} onBalanceChanged={onBalanceChanged} />);

    expect(await screen.findByRole('button', { name: 'Hazır değilim' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ayrıl (ücret iade)' }));
    await waitFor(() => expect(mocks.leaveLobbyRace).toHaveBeenCalledWith('race-1', 'key-1'));
    await waitFor(() => expect(onBalanceChanged).toHaveBeenCalledTimes(1));
  });

  it('ayrılmış (cancelled) katılımda hiçbir işlem düğmesi yoktur', async () => {
    mocks.listLobbyRaces.mockResolvedValue([lobbyRace({ myEntry: { status: 'cancelled', horseId: 'horse-1' } })]);
    render(<LobbyPanel horses={[horse]} onBalanceChanged={onBalanceChanged} />);
    expect(await screen.findByText('Ayrıldın')).toBeTruthy();
    for (const name of ['Katıl', 'Hazırım', 'Hazır değilim', 'Ayrıl (ücret iade)']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('yarış açma formu geçerli bir gövdeyle POST eder; kısa ad sunucuya GİTMEZ', async () => {
    mocks.listLobbyRaces.mockResolvedValue([]);
    mocks.createLobbyRace.mockResolvedValue(lobbyRace({ name: 'Yeni Kupa' }));
    render(<LobbyPanel horses={[horse]} onBalanceChanged={onBalanceChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Yarış Aç' }));
    fireEvent.change(screen.getByLabelText('Yarış adı'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yarışı Aç' }));
    expect(await screen.findByText(/karakter olmalıdır/)).toBeTruthy();
    expect(mocks.createLobbyRace).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Yarış adı'), { target: { value: 'Yeni Kupa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yarışı Aç' }));
    await waitFor(() => expect(mocks.createLobbyRace).toHaveBeenCalledTimes(1));
    expect(mocks.createLobbyRace.mock.calls[0][0]).toMatchObject({ name: 'Yeni Kupa' });
  });
});
