import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { lobbyRefreshIntervalMs, shouldRunLobbyRefresh } from '../../../src/features/race-lobby/lobby-refresh';

describe('lobi listesi kendiliğinden yenilenir (16.10.2026)', () => {
  it('aralık config\'ten gelir ve açıktır; 0/geçersiz değer kapatır', () => {
    const seconds = loadRaceLobbyConfig().lobbyListRefreshSeconds;
    expect(seconds).toBeGreaterThan(0);
    expect(lobbyRefreshIntervalMs(seconds)).toBe(seconds * 1000);
    expect(lobbyRefreshIntervalMs(0)).toBeNull();
    expect(lobbyRefreshIntervalMs(-5)).toBeNull();
    expect(lobbyRefreshIntervalMs(Number.NaN)).toBeNull();
  });

  it('sekme gizliyken ya da önceki istek sürerken yenilemez', () => {
    expect(shouldRunLobbyRefresh('visible', false)).toBe(true);
    expect(shouldRunLobbyRefresh('hidden', false)).toBe(false);
    expect(shouldRunLobbyRefresh('visible', true)).toBe(false);
  });

  it('LobbyPanel yenilemeyi config aralığıyla bağlar', () => {
    const source = readFileSync(join(__dirname, '../../../src/features/race-lobby/LobbyPanel.tsx'), 'utf8');
    expect(source).toContain('usePeriodicLobbyRefresh(refresh, LOBBY_CONFIG.lobbyListRefreshSeconds)');
  });
});
