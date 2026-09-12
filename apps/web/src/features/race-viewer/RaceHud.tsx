'use client';

/**
 * Yarış ekranı HUD (heads-up display) — `docs/GAME_DESIGN.md` §6: sıralama
 * paneli, hız/zaman göstergesi, kamera seçim butonları, mini harita.
 *
 * KASITLI OLARAK Three.js/`@react-three/fiber` içermez (sadece düz React +
 * CSS) — bu yüzden `RaceScene3D.tsx`'in aksine bu dosya, bu geliştirme
 * ortamında yerel `tsc` ile tip kontrolünden geçirilebilir OLABİLİRDİ;
 * ancak bu ortamda `@types/react` de kurulu olmadığından (bkz.
 * `docs/ARCHITECTURE.md` §9), JSX içeren HİÇBİR dosya (three.js'e ihtiyacı
 * olsun olmasın) burada derlenerek doğrulanamaz — bu, projenin zaten var
 * olan, belgelenmiş kısıtıdır. Doğrulama GitHub Actions CI'da olur.
 */

import type { CameraMode } from './camera-presets';
import { CAMERA_MODE_LABELS, CAMERA_MODE_ORDER } from './camera-presets';
import type { LiveLeaderboardEntry } from './timeline-playback';

export interface MiniMapMarker {
  horseId: string;
  xPercent: number;
  yPercent: number;
  isLeader: boolean;
}

export interface RaceHudProps {
  horseNamesById: Record<string, string>;
  leaderboard: LiveLeaderboardEntry[];
  miniMapMarkers: MiniMapMarker[];
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  speedMultiplier: number;
  cameraMode: CameraMode;
  onTogglePlay: () => void;
  onChangeSpeedMultiplier: (multiplier: number) => void;
  onChangeCameraMode: (mode: CameraMode) => void;
  onSeek: (timeMs: number) => void;
}

const SPEED_OPTIONS = [1, 2, 4] as const;

export function RaceHud(props: RaceHudProps): React.ReactElement {
  const {
    horseNamesById,
    leaderboard,
    miniMapMarkers,
    currentTimeMs,
    durationMs,
    isPlaying,
    speedMultiplier,
    cameraMode,
    onTogglePlay,
    onChangeSpeedMultiplier,
    onChangeCameraMode,
    onSeek,
  } = props;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gridTemplateRows: 'auto 1fr auto',
        padding: 'var(--space-md)',
        gap: 'var(--space-md)',
        fontFamily: 'var(--font-family)',
      }}
    >
      <div
        style={{
          gridColumn: '1 / -1',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'auto',
        }}
      >
        <RaceTimeDisplay currentTimeMs={currentTimeMs} durationMs={durationMs} />
        <CameraSwitcher cameraMode={cameraMode} onChangeCameraMode={onChangeCameraMode} />
      </div>

      <LeaderboardPanel horseNamesById={horseNamesById} leaderboard={leaderboard} />

      <MiniMap markers={miniMapMarkers} />

      <div style={{ gridColumn: '1 / -1', pointerEvents: 'auto' }}>
        <PlaybackControls
          currentTimeMs={currentTimeMs}
          durationMs={durationMs}
          isPlaying={isPlaying}
          speedMultiplier={speedMultiplier}
          onTogglePlay={onTogglePlay}
          onChangeSpeedMultiplier={onChangeSpeedMultiplier}
          onSeek={onSeek}
        />
      </div>
    </div>
  );
}

function panelStyle(): React.CSSProperties {
  return {
    background: 'rgba(18, 27, 46, 0.82)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-sm) var(--space-md)',
    backdropFilter: 'blur(4px)',
  };
}

function RaceTimeDisplay({ currentTimeMs, durationMs }: { currentTimeMs: number; durationMs: number }): React.ReactElement {
  return (
    <div style={panelStyle()}>
      <span style={{ color: 'var(--color-accent-gold)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {formatRaceClock(currentTimeMs)}
      </span>
      <span style={{ color: 'var(--color-text-muted)' }}> / {formatRaceClock(durationMs)}</span>
    </div>
  );
}

function CameraSwitcher({
  cameraMode,
  onChangeCameraMode,
}: {
  cameraMode: CameraMode;
  onChangeCameraMode: (mode: CameraMode) => void;
}): React.ReactElement {
  return (
    <div style={{ ...panelStyle(), display: 'flex', gap: 'var(--space-xs)' }}>
      {CAMERA_MODE_ORDER.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChangeCameraMode(mode)}
          style={{
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: 'var(--radius-sm)',
            border: mode === cameraMode ? '1px solid var(--color-accent-gold)' : '1px solid transparent',
            background: mode === cameraMode ? 'rgba(227, 179, 65, 0.15)' : 'transparent',
            color: mode === cameraMode ? 'var(--color-accent-gold)' : 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          {CAMERA_MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}

function LeaderboardPanel({
  horseNamesById,
  leaderboard,
}: {
  horseNamesById: Record<string, string>;
  leaderboard: LiveLeaderboardEntry[];
}): React.ReactElement {
  return (
    <div style={{ ...panelStyle(), pointerEvents: 'auto', alignSelf: 'start', minWidth: '200px' }}>
      <div
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--space-xs)',
        }}
      >
        Sıralama
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '4px' }}>
        {leaderboard.map((entry) => (
          <li
            key={entry.horseId}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 'var(--space-sm)',
              fontSize: '13px',
            }}
          >
            <span style={{ color: 'var(--color-text-primary)' }}>
              {entry.rank}. {horseNamesById[entry.horseId] ?? entry.horseId}
            </span>
            <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {entry.rank === 1 ? '—' : `-${entry.gapToLeaderMeters.toFixed(1)}m`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MiniMap({ markers }: { markers: MiniMapMarker[] }): React.ReactElement {
  return (
    <div
      style={{
        ...panelStyle(),
        gridColumn: 2,
        alignSelf: 'end',
        justifySelf: 'end',
        width: '160px',
        height: '96px',
        position: 'relative',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        <rect x={2} y={2} width={96} height={96} rx={8} fill="rgba(255,255,255,0.03)" />
        {markers.map((marker) => (
          <circle
            key={marker.horseId}
            cx={marker.xPercent}
            cy={marker.yPercent}
            r={marker.isLeader ? 3.2 : 2.4}
            fill={marker.isLeader ? 'var(--color-accent-gold)' : 'var(--color-accent-focus)'}
          />
        ))}
      </svg>
    </div>
  );
}

function PlaybackControls({
  currentTimeMs,
  durationMs,
  isPlaying,
  speedMultiplier,
  onTogglePlay,
  onChangeSpeedMultiplier,
  onSeek,
}: {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  speedMultiplier: number;
  onTogglePlay: () => void;
  onChangeSpeedMultiplier: (multiplier: number) => void;
  onSeek: (timeMs: number) => void;
}): React.ReactElement {
  return (
    <div style={{ ...panelStyle(), display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
      <button
        type="button"
        onClick={onTogglePlay}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-surface-elevated)',
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
        }}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>

      <input
        type="range"
        min={0}
        max={durationMs}
        value={currentTimeMs}
        onChange={(event) => onSeek(Number(event.target.value))}
        style={{ flex: 1 }}
      />

      <div style={{ display: 'flex', gap: '4px' }}>
        {SPEED_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChangeSpeedMultiplier(option)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: 'var(--radius-sm)',
              border: option === speedMultiplier ? '1px solid var(--color-accent-gold)' : '1px solid var(--color-border)',
              background: option === speedMultiplier ? 'rgba(227, 179, 65, 0.15)' : 'transparent',
              color: option === speedMultiplier ? 'var(--color-accent-gold)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            {option}×
          </button>
        ))}
      </div>
    </div>
  );
}

function formatRaceClock(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, '0');
  return `${minutes}:${seconds}`;
}
