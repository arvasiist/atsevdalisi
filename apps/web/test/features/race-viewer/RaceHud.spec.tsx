// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CAMERA_MODE_LABELS } from '../../../src/features/race-viewer/camera-presets';
import { RaceHud, type MiniMapMarker, type RaceHudProps } from '../../../src/features/race-viewer/RaceHud';
import type { LiveLeaderboardEntry } from '../../../src/features/race-viewer/timeline-playback';

/**
 * AUDIT_REPORT.md T2 (Medium) — bu depodaki İLK gerçek `.tsx` component
 * testi. `RaceHud.tsx`'in kendi doc yorumunda belirttiği gibi bu dosya
 * KASITLI OLARAK Three.js içermez (saf React + DOM), bu yüzden
 * `@testing-library/react` + jsdom ile gerçekten render edilip
 * etkileşime sokulabilir — `RaceScene3D.tsx` gibi Three.js'e bağımlı
 * dosyalar hâlâ yalnızca CI'da (gerçek tarayıcı/WebGL olmadan da olsa,
 * en azından syntax/type seviyesinde) doğrulanabilir, o kapsam dışıdır.
 *
 * jsdom, bu test dosyasının başındaki `@vitest-environment` pragma'sıyla
 * SADECE bu dosya için etkinleştirilir (kök `vitest.config.ts`'in
 * `environment: 'node'` varsayılanı diğer TÜM testler için — özellikle
 * `apps/api`'nin gerçek Postgres/Redis'e bağlanan e2e testleri için —
 * DEĞİŞMEDEN kalır).
 */

afterEach(() => {
  cleanup();
});

function buildProps(overrides: Partial<RaceHudProps> = {}): RaceHudProps {
  const leaderboard: LiveLeaderboardEntry[] = [
    { horseId: 'h1', rank: 1, positionMeters: 800, speedMps: 16, gapToLeaderMeters: 0 },
    { horseId: 'h2', rank: 2, positionMeters: 780, speedMps: 15.4, gapToLeaderMeters: 20 },
  ];
  const miniMapMarkers: MiniMapMarker[] = [{ horseId: 'h1', xPercent: 50, yPercent: 50, isLeader: true }];

  return {
    horseNamesById: { h1: 'Yıldırım', h2: 'Rüzgar' },
    leaderboard,
    miniMapMarkers,
    currentTimeMs: 12000,
    durationMs: 60000,
    isPlaying: false,
    speedMultiplier: 1,
    cameraMode: 'track',
    onTogglePlay: vi.fn(),
    onChangeSpeedMultiplier: vi.fn(),
    onChangeCameraMode: vi.fn(),
    onSeek: vi.fn(),
    ...overrides,
  };
}

describe('RaceHud', () => {
  it('sıralama panelinde at isimlerini ve lidere farkı gösterir', () => {
    render(<RaceHud {...buildProps()} />);

    expect(screen.getByText('1. Yıldırım')).toBeTruthy();
    expect(screen.getByText('2. Rüzgar')).toBeTruthy();
    expect(screen.getByText('-20.0m')).toBeTruthy();
  });

  it('lider satırında mesafe farkı yerine "—" gösterir', () => {
    render(<RaceHud {...buildProps()} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('horseNamesById içinde ismi olmayan bir at için horseId\'ye geri döner (fallback)', () => {
    render(<RaceHud {...buildProps({ horseNamesById: {} })} />);
    expect(screen.getByText('1. h1')).toBeTruthy();
    expect(screen.getByText('2. h2')).toBeTruthy();
  });

  it('oynat/duraklat düğmesine tıklanınca onTogglePlay tam olarak bir kez çağrılır', () => {
    const onTogglePlay = vi.fn();
    render(<RaceHud {...buildProps({ onTogglePlay, isPlaying: false })} />);

    fireEvent.click(screen.getByText('▶'));

    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('isPlaying=true iken duraklat ikonunu gösterir', () => {
    render(<RaceHud {...buildProps({ isPlaying: true })} />);
    expect(screen.getByText('❚❚')).toBeTruthy();
    expect(screen.queryByText('▶')).toBeNull();
  });

  it('bir hız düğmesine tıklanınca onChangeSpeedMultiplier doğru sayısal değerle çağrılır', () => {
    const onChangeSpeedMultiplier = vi.fn();
    render(<RaceHud {...buildProps({ onChangeSpeedMultiplier })} />);

    fireEvent.click(screen.getByText('4×'));

    expect(onChangeSpeedMultiplier).toHaveBeenCalledTimes(1);
    expect(onChangeSpeedMultiplier).toHaveBeenCalledWith(4);
  });

  it('bir kamera modu düğmesine tıklanınca onChangeCameraMode doğru mod ile çağrılır', () => {
    const onChangeCameraMode = vi.fn();
    render(<RaceHud {...buildProps({ onChangeCameraMode })} />);

    fireEvent.click(screen.getByText(CAMERA_MODE_LABELS.jockey));

    expect(onChangeCameraMode).toHaveBeenCalledWith('jockey');
  });

  it('zaman çubuğu (range input) değiştirildiğinde onSeek milisaniye cinsinden çağrılır', () => {
    const onSeek = vi.fn();
    const { container } = render(<RaceHud {...buildProps({ onSeek })} />);

    const rangeInput = container.querySelector('input[type="range"]');
    expect(rangeInput).not.toBeNull();
    fireEvent.change(rangeInput as HTMLInputElement, { target: { value: '30000' } });

    expect(onSeek).toHaveBeenCalledWith(30000);
  });

  it('geçen süre / toplam süreyi dakika:saniye.yüzde formatında gösterir', () => {
    render(<RaceHud {...buildProps({ currentTimeMs: 65000, durationMs: 125000 })} />);

    expect(screen.getByText('1:05.00')).toBeTruthy();
    expect(screen.getByText(/2:05\.00/)).toBeTruthy();
  });
});
