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

/**
 * `StatBar`'ın DOLDURULMUŞ kısmının genişliği (ör. `'58%'`). `label`
 * metnini taşıyan `<span>`'in kardeşi olan iz (track) `<div>`'inin ilk
 * `<div>` çocuğu. Değeri okumanın başka yolu yok — çubuk bir metin değil,
 * bir `width` yüzdesi.
 */
function barWidthFor(container: HTMLElement, label: string): string | undefined {
  const labelSpan = [...container.querySelectorAll('span')].find((span) => span.textContent === label);
  const inner = labelSpan?.parentElement?.querySelector('div')?.querySelector('div');
  return (inner as HTMLElement | undefined)?.style.width;
}

describe('RaceHud', () => {
  /** Sıralama satırı: renkli numara rozeti + isim (01.10.2026 yayın tarzı). */
  function standingsRows(container: HTMLElement): Array<{ rank: string; name: string; color: string }> {
    return [...container.querySelectorAll('.hud-standings-line')].map((line) => {
      const badge = line.querySelector('.hud-rank-badge') as HTMLElement | null;
      return {
        rank: badge?.textContent ?? '',
        name: line.querySelector('.hud-standings-name > span')?.textContent ?? '',
        color: badge?.style.background ?? '',
      };
    });
  }

  it('sıralama panelinde sıra rozeti, at isimleri ve lidere farkı gösterir', () => {
    const { container } = render(<RaceHud {...buildProps()} />);

    expect(standingsRows(container).map(({ rank, name }) => `${rank}. ${name}`)).toEqual(['1. Yıldırım', '2. Rüzgar']);
    expect(screen.getByText('-20.0m')).toBeTruthy();
  });

  it('sıra rozeti atın forma rengini taşır (3D sahnedeki jokey rengiyle aynı)', () => {
    const { container } = render(
      <RaceHud {...buildProps({ horseColorsById: { h1: 'rgb(29, 111, 224)', h2: 'rgb(214, 47, 47)' } })} />,
    );
    expect(standingsRows(container).map(({ color }) => color)).toEqual(['rgb(29, 111, 224)', 'rgb(214, 47, 47)']);
  });

  it('odak at kartı gerçek hızı (km/s) ve kalan mesafeyi gösterir; mesafe yoksa ilerleme şeridi çizilmez', () => {
    const withDistance = render(<RaceHud {...buildProps({ focusHorseId: 'h2', raceDistanceMeters: 1000 })} />);
    expect(screen.getByText('55 km/s')).toBeTruthy(); // 15.4 m/s × 3.6
    expect(screen.getByText('220 m')).toBeTruthy(); // 1000 − 780
    expect(screen.getByLabelText('Yarış ilerlemesi')).toBeTruthy();
    withDistance.unmount();

    render(<RaceHud {...buildProps({ focusHorseId: 'h2' })} />);
    expect(screen.queryByLabelText('Yarış ilerlemesi')).toBeNull();
    expect(screen.queryByText(/ m$/)).toBeNull();
  });

  it('lider satırında mesafe farkı yerine "—" gösterir', () => {
    render(<RaceHud {...buildProps()} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('horseNamesById içinde ismi olmayan bir at için horseId\'ye geri döner (fallback)', () => {
    const { container } = render(<RaceHud {...buildProps({ horseNamesById: {} })} />);
    expect(standingsRows(container).map(({ rank, name }) => `${rank}. ${name}`)).toEqual(['1. h1', '2. h2']);
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

  /**
   * Bu iki test, HUD'un "Yor" çubuğunun yarış boyunca DÜZ bir çizgi olması
   * hatasını (bkz. `RaceSegmentSnapshot.fatigueLevel` doc yorumu) kilitler.
   */
  it('"Yor" çubuğu CANLI yorgunluğu (fatigueLevel) gösterir — statik `fatigue`ı DEĞİL', () => {
    const leaderboard: LiveLeaderboardEntry[] = [
      { horseId: 'h1', rank: 1, positionMeters: 800, speedMps: 16, gapToLeaderMeters: 0, stamina: 70, fatigue: 12, fatigueLevel: 58 },
    ];
    const { container } = render(<RaceHud {...buildProps({ leaderboard, horseNamesById: { h1: 'Yıldırım' } })} />);

    expect(screen.getByText('Yor')).toBeTruthy();
    expect(barWidthFor(container, 'Yor')).toBe('58%'); // statik 12 DEĞİL
  });

  it('fatigueLevel taşımayan ESKİ kayıtta "Yor" çubuğu statik `fatigue`a düşer — çubuk kaybolmaz', () => {
    const leaderboard: LiveLeaderboardEntry[] = [
      { horseId: 'h1', rank: 1, positionMeters: 800, speedMps: 16, gapToLeaderMeters: 0, stamina: 70, fatigue: 12 },
    ];
    const { container } = render(<RaceHud {...buildProps({ leaderboard, horseNamesById: { h1: 'Yıldırım' } })} />);

    expect(barWidthFor(container, 'Yor')).toBe('12%');
  });

  it('paceScore varsa "Tempo N" etiketi gösterilir, yoksa (eski kayıt) hiç gösterilmez', () => {
    const withPace: LiveLeaderboardEntry[] = [
      { horseId: 'h1', rank: 1, positionMeters: 800, speedMps: 16, gapToLeaderMeters: 0, tacticalState: 'front_runner', paceScore: 65 },
    ];
    const first = render(<RaceHud {...buildProps({ leaderboard: withPace, horseNamesById: { h1: 'Yıldırım' } })} />);
    expect(screen.getByText(/Tempo 65/)).toBeTruthy();
    first.unmount();

    const withoutPace: LiveLeaderboardEntry[] = [
      { horseId: 'h1', rank: 1, positionMeters: 800, speedMps: 16, gapToLeaderMeters: 0, tacticalState: 'front_runner' },
    ];
    render(<RaceHud {...buildProps({ leaderboard: withoutPace, horseNamesById: { h1: 'Yıldırım' } })} />);
    expect(screen.queryByText(/Tempo/)).toBeNull();
  });
});
