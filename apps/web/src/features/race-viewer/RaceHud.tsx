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
 *
 * AUDIT_REPORT.md Bulgu F1 (Medium) hardening (bu oturum): bu dosya üç
 * somut mobil sorunla anılıyordu — (1) sıralama paneli (`minWidth: 200px`)
 * + mini harita (`width: 160px`) yan yana sabit genişlikte, 360px'lik bir
 * telefonda (gutter düşüldükten sonra ~328px kullanılabilir alan) ikisi
 * TOPLAMDA 360px gerektirdiğinden GERÇEKTEN taşıyordu; (2) oynat/duraklat
 * düğmesi 32×32px, kamera/hız düğmeleri ~28px yükseklik/12px font — hepsi
 * 44px dokunma hedefi kuralının ALTINDA; (3) kamera seçim satırı (4 uzun
 * Türkçe etiket) dar ekranda sarma DAVRANIŞI yoktu, taşabilirdi. Üçü de
 * aşağıda düzeltildi: (1) `min()`/`clamp()` CSS fonksiyonlarıyla panel
 * genişlikleri viewport'a göre KÜÇÜLÜR (media query'ye gerek YOK — bu
 * ortamda gerçek bir tarayıcıda görsel doğrulama yapılamadığından, CSS'in
 * kendi içinde matematiksel olarak DOĞRU olan bu yaklaşım tercih edildi);
 * (2) TÜM etkileşimli düğmeler artık en az 44px yükseklik/genişlikte;
 * (3) `flexWrap: 'wrap'` ile düğme satırları taşmak yerine ikinci satıra
 * SARAR.
 *
 * F2 canlı yayın entegrasyonu (bu turda EKLENDİ): opsiyonel `liveStatus`
 * prop'u — CANLI bir WebSocket yayınında oynat/duraklat/hız/seek
 * kontrolleri ANLAMSIZDIR (geçmişe gidilemez, hızlandırılamaz, "duraklat"
 * yayını DURDURMAZ, yalnızca yerel görüntüyü dondurur ki bu YANILTICI
 * olurdu) — bu yüzden `liveStatus` VERİLDİĞİNDE bu kontroller bir CANLI
 * durum rozetiyle DEĞİŞTİRİLİR. `liveStatus` BELİRTİLMEZSE (mevcut TÜM
 * çağrı yerleri — `RaceViewer.tsx`/demo sayfası) davranış birebir AYNI
 * kalır, bu yüzden geriye dönük UYUMLUDUR.
 *
 * F2 reconnection dilimi (bu turda EKLENDİ): `'reconnecting'` durumu —
 * `live-race-socket.ts`'in yeni `onDisconnected` handler'ı tetiklendiğinde
 * (bağlantı koptu, socket.io otomatik olarak yeniden bağlanmayı deniyor)
 * kullanıcıya bunu GÖSTERMEK için. `'connecting'`'ten (ilk bağlantı, roster
 * HENÜZ hiç alınmadı) KASITLI olarak AYRI bir durum — ikisi de "henüz
 * canlı veri yok" anlamına gelse de, `'reconnecting'`de kullanıcı DAHA
 * ÖNCE bir yarış görmüştü (ekranda son bilinen kare/HUD hâlâ görünür
 * kalır, yalnızca rozet değişir), `'connecting'`de ekran TAMAMEN boş bir
 * placeholder'dır (bkz. `LiveRaceViewer.tsx`'in `!roster` dalı).
 */
export type RaceLiveStatus = 'connecting' | 'live' | 'reconnecting' | 'finished';

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
  /** Bkz. dosya başı doc yorumu "F2 canlı yayın entegrasyonu". */
  liveStatus?: RaceLiveStatus;
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
    liveStatus,
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
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          pointerEvents: 'auto',
        }}
      >
        <RaceTimeDisplay currentTimeMs={currentTimeMs} durationMs={durationMs} liveStatus={liveStatus} />
        <CameraSwitcher cameraMode={cameraMode} onChangeCameraMode={onChangeCameraMode} />
      </div>

      <LeaderboardPanel horseNamesById={horseNamesById} leaderboard={leaderboard} />

      <MiniMap markers={miniMapMarkers} />

      <div style={{ gridColumn: '1 / -1', pointerEvents: 'auto' }}>
        {liveStatus ? (
          <LiveStatusBadge status={liveStatus} />
        ) : (
          <PlaybackControls
            currentTimeMs={currentTimeMs}
            durationMs={durationMs}
            isPlaying={isPlaying}
            speedMultiplier={speedMultiplier}
            onTogglePlay={onTogglePlay}
            onChangeSpeedMultiplier={onChangeSpeedMultiplier}
            onSeek={onSeek}
          />
        )}
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

function RaceTimeDisplay({
  currentTimeMs,
  durationMs,
  liveStatus,
}: {
  currentTimeMs: number;
  durationMs: number;
  liveStatus?: RaceLiveStatus;
}): React.ReactElement {
  return (
    <div style={panelStyle()}>
      <span style={{ color: 'var(--color-accent-gold)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {formatRaceClock(currentTimeMs)}
      </span>
      {liveStatus ? null : <span style={{ color: 'var(--color-text-muted)' }}> / {formatRaceClock(durationMs)}</span>}
    </div>
  );
}

/**
 * F2 canlı yayın entegrasyonu (bu turda EKLENDİ) — `PlaybackControls`'un
 * (oynat/duraklat/hız/seek) CANLI bir yayında yerini alır (bkz. dosya
 * başı doc yorumu). Yalnızca DURUM gösterir, hiçbir etkileşim SUNMAZ —
 * canlı bir yayında "duraklat" gibi bir kavram YOKTUR.
 */
function LiveStatusBadge({ status }: { status: RaceLiveStatus }): React.ReactElement {
  const LABELS: Record<RaceLiveStatus, string> = {
    connecting: 'Bağlanıyor…',
    live: 'CANLI',
    reconnecting: 'Yeniden bağlanılıyor…',
    finished: 'Yarış bitti',
  };
  const DOT_COLORS: Record<RaceLiveStatus, string> = {
    connecting: 'var(--color-text-muted)',
    live: 'var(--color-status-critical)',
    reconnecting: 'var(--color-status-warning)',
    finished: 'var(--color-status-positive)',
  };
  return (
    <div style={{ ...panelStyle(), display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span
        aria-hidden="true"
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: DOT_COLORS[status],
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{LABELS[status]}</span>
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
    <div style={{ ...panelStyle(), display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
      {CAMERA_MODE_ORDER.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChangeCameraMode(mode)}
          style={{
            minHeight: '44px',
            padding: '6px 12px',
            fontSize: '13px',
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
    <div style={{ ...panelStyle(), pointerEvents: 'auto', alignSelf: 'start', minWidth: 'min(200px, 42vw)', maxWidth: '260px' }}>
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
        // AUDIT_REPORT.md F1: sabit 160px genişlik, dar telefonlarda
        // sıralama paneliyle (bkz. `LeaderboardPanel`) toplamda taşıyordu.
        // `min()` ile viewport'un %38'ini aşmayacak şekilde küçülür;
        // `aspectRatio` sabit 96px yüksekliğin yerine oranı KORUR, böylece
        // panel küçülse de orantısız/basık görünmez.
        width: 'min(160px, 38vw)',
        aspectRatio: '5 / 3',
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
    <div style={{ ...panelStyle(), display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-sm)' }}>
      <button
        type="button"
        onClick={onTogglePlay}
        style={{
          width: '44px',
          height: '44px',
          flexShrink: 0,
          borderRadius: '50%',
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-surface-elevated)',
          color: 'var(--color-text-primary)',
          fontSize: '16px',
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
        style={{ flex: '1 1 120px', minHeight: '44px' }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {SPEED_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChangeSpeedMultiplier(option)}
            style={{
              minWidth: '44px',
              minHeight: '44px',
              padding: '4px 10px',
              fontSize: '13px',
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
