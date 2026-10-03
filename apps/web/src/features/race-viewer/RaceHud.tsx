'use client';

/**
 * Yarış ekranı HUD (heads-up display) — `docs/GAME_DESIGN.md` §6: sıralama
 * paneli, hız/zaman göstergesi, kamera seçim butonları, mini harita.
 *
 * 01.10.2026 TASARIM YENİLEMESİ (sahibin paylaştığı yarış ekranı konsepti):
 * sol üstte koşu bilgisi + saat, sağ üstte kamera, sağda renkli numara
 * rozetli sıralama, sol altta odak atın kartı (hız, tempo, kalan mesafe),
 * altta renkli at işaretli ilerleme şeridi, sağ altta pist çizgili mini
 * harita. Yalnızca GERÇEK veri gösterilir — konseptteki sıcaklık/rüzgâr
 * gibi sunucuda karşılığı olmayan bilgiler EKLENMEDİ. Yeni bilgiler
 * opsiyonel prop'lardır; verilmezse ilgili parça çizilmez.
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

import { memo } from 'react';
import { Flag, Gauge, Route, Timer } from 'lucide-react';
import type { CameraMode } from './camera-presets';
import { CAMERA_MODE_LABELS, CAMERA_MODE_ORDER } from './camera-presets';
import type { LiveLeaderboardEntry } from './timeline-playback';
import { formatFinishGap, isCloseFinish, type PhotoFinishRow } from './photo-finish';
import { loadCameraConfig } from '@at-sevdalisi/game-config';
import { HorseHeadIcon } from '../../components/ui/HorseHeadIcon';

/** `isCloseFinish` eşiği config'ten (modül seviyesinde tek yükleme). */
const cameraConfig = loadCameraConfig();

const MPS_TO_KMH = 3.6;
const FALLBACK_BADGE_COLOR = '#64748b';

export interface MiniMapMarker {
  horseId: string;
  xPercent: number;
  yPercent: number;
  isLeader: boolean;
}

export interface MiniMapPoint {
  xPercent: number;
  yPercent: number;
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
  /** Canlı yayında oynatma kontrolleri yerine durum rozeti gösterilir. */
  liveStatus?: RaceLiveStatus;
  /** Yarış bittiğinde doldurulur (§23 Photo Finish); devam ederken VERİLMEZ. */
  finishResult?: PhotoFinishRow[];
  /** Atın forma rengi (3D sahnedeki jokey rengiyle aynı) — rozetler/ilerleme şeridi. */
  horseColorsById?: Record<string, string>;
  /** Sol alttaki kartta gösterilecek at (oyuncunun atı ya da odak at). */
  focusHorseId?: string;
  /** Yarış mesafesi — ilerleme şeridi ve "kalan mesafe" için. */
  raceDistanceMeters?: number;
  /** Sol üst bilgi paneli: başlık + alt satır (ör. "2000 m · Çim · Güneşli"). */
  raceTitle?: string;
  raceSubtitle?: string;
  /** Mini haritada çizilecek pist çizgisi (kapalı çokgen). */
  miniMapTrack?: MiniMapPoint[];
}

/** Brief §22: PLAY/PAUSE/0.5X/1X/2X/4X. */
const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

function RaceHudComponent(props: RaceHudProps): React.ReactElement {
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
    finishResult,
    horseColorsById = {},
    focusHorseId,
    raceDistanceMeters,
    raceTitle,
    raceSubtitle,
    miniMapTrack,
  } = props;

  const focusEntry = focusHorseId
    ? leaderboard.find((entry) => entry.horseId === focusHorseId)
    : undefined;

  return (
    <div className="hud">
      <div className="hud-top">
        <RaceInfoPanel
          title={raceTitle}
          subtitle={raceSubtitle}
          currentTimeMs={currentTimeMs}
          durationMs={durationMs}
          liveStatus={liveStatus}
        />
        <div className="hud-top-right">
          {liveStatus ? <LiveStatusBadge status={liveStatus} /> : null}
          <CameraSwitcher cameraMode={cameraMode} onChangeCameraMode={onChangeCameraMode} />
        </div>
      </div>

      <LeaderboardPanel
        horseNamesById={horseNamesById}
        leaderboard={leaderboard}
        horseColorsById={horseColorsById}
      />

      {finishResult && finishResult.length > 0 ? <FinishResultOverlay rows={finishResult} /> : null}

      <div className="hud-bottom">
        {focusEntry ? (
          <FocusHorseCard
            entry={focusEntry}
            name={horseNamesById[focusEntry.horseId] ?? focusEntry.horseId}
            color={horseColorsById[focusEntry.horseId] ?? FALLBACK_BADGE_COLOR}
            raceDistanceMeters={raceDistanceMeters}
          />
        ) : (
          <span />
        )}
        <div className="hud-bottom-center">
          {raceDistanceMeters !== undefined && raceDistanceMeters > 0 ? (
            <ProgressStrip
              leaderboard={leaderboard}
              horseColorsById={horseColorsById}
              raceDistanceMeters={raceDistanceMeters}
            />
          ) : null}
          {liveStatus ? null : (
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
        <MiniMap markers={miniMapMarkers} track={miniMapTrack} horseColorsById={horseColorsById} />
      </div>
    </div>
  );
}

/**
 * `memo()`: üst bileşen her rAF karesinde render olur (3D sahne); HUD ise
 * throttle'lı `hudTimeMs` ile beslenir — prop'lar değişmedikçe HUD gövdesi
 * hiç çalışmaz.
 */
export const RaceHud = memo(RaceHudComponent);

function RaceInfoPanel({
  title,
  subtitle,
  currentTimeMs,
  durationMs,
  liveStatus,
}: {
  title?: string;
  subtitle?: string;
  currentTimeMs: number;
  durationMs: number;
  liveStatus?: RaceLiveStatus;
}): React.ReactElement {
  return (
    <div className="hud-panel hud-info">
      <span className="hud-info-icon">
        <HorseHeadIcon size={34} gradient withMane />
      </span>
      {title ? (
        <span className="hud-info-text">
          <strong className="hud-info-title">{title}</strong>
          {subtitle ? <span className="hud-info-subtitle">{subtitle}</span> : null}
        </span>
      ) : null}
      <span className="hud-clock">
        <Timer size={16} aria-hidden="true" />
        <span className="hud-clock-now">{formatRaceClock(currentTimeMs)}</span>
        {liveStatus ? null : (
          <span className="hud-clock-total"> / {formatRaceClock(durationMs)}</span>
        )}
      </span>
    </div>
  );
}

/** Canlı yayında oynatma kontrollerinin yerini alır — yalnızca durum gösterir. */
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
    <div className="hud-panel hud-live">
      <span
        aria-hidden="true"
        className="hud-live-dot"
        style={{ background: DOT_COLORS[status] }}
      />
      <span>{LABELS[status]}</span>
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
    <div className="hud-panel hud-cameras">
      {CAMERA_MODE_ORDER.map((mode) => (
        <button
          key={mode}
          type="button"
          className="hud-camera-button"
          aria-pressed={mode === cameraMode}
          onClick={() => onChangeCameraMode(mode)}
        >
          {CAMERA_MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}

/** `RacingStyle` değerlerinin kısa Türkçe etiketleri. */
const TACTICAL_STATE_LABELS: Record<string, string> = {
  front_runner: 'Öncü',
  tracker: 'Takipçi',
  mid_pack: 'Orta',
  closer: 'Bitirici',
};

/**
 * Stamina/yorgunluk çubuğu (brief §20). Veri Race Engine'den gelir; burada
 * yalnızca görselleştirilir. DOM yapısı (etiket `span` + iz `div` > dolgu
 * `div`) testlerin okuduğu sözleşmedir.
 */
function StatBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="hud-statbar">
      <span>{label}</span>
      <div className="hud-statbar-track">
        <div style={{ width: `${clamped}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
}

function RankBadge({ rank, color }: { rank: number; color: string }): React.ReactElement {
  return (
    <span className="hud-rank-badge" style={{ background: color }}>
      {rank}
    </span>
  );
}

function LeaderboardPanel({
  horseNamesById,
  leaderboard,
  horseColorsById,
}: {
  horseNamesById: Record<string, string>;
  leaderboard: LiveLeaderboardEntry[];
  horseColorsById: Record<string, string>;
}): React.ReactElement {
  return (
    <div className="hud-panel hud-standings">
      <div className="hud-panel-title">Sıralama</div>
      <ol className="hud-standings-list">
        {leaderboard.map((entry) => {
          // `Yor`: CANLI (yarış içinde biriken) yorgunluk; eski kayıtlarda
          // `fatigueLevel` yoksa statik `fatigue`a düşülür.
          const liveFatigue = entry.fatigueLevel ?? entry.fatigue;
          return (
            <li
              key={entry.horseId}
              className="hud-standings-row"
              data-leader={entry.rank === 1 || undefined}
            >
              <div className="hud-standings-line">
                <RankBadge
                  rank={entry.rank}
                  color={horseColorsById[entry.horseId] ?? FALLBACK_BADGE_COLOR}
                />
                <span className="hud-standings-name">
                  <span>{horseNamesById[entry.horseId] ?? entry.horseId}</span>
                  {entry.tacticalState || entry.paceScore !== undefined ? (
                    <span className="hud-standings-meta">
                      {entry.tacticalState
                        ? (TACTICAL_STATE_LABELS[entry.tacticalState] ?? entry.tacticalState)
                        : null}
                      {entry.tacticalState && entry.paceScore !== undefined ? ' · ' : null}
                      {entry.paceScore !== undefined
                        ? `Tempo ${Math.round(entry.paceScore)}`
                        : null}
                    </span>
                  ) : null}
                </span>
                <span className="hud-standings-gap">
                  {entry.rank === 1 ? '—' : `-${entry.gapToLeaderMeters.toFixed(1)}m`}
                </span>
              </div>
              {entry.stamina !== undefined ? (
                <StatBar label="Kon" value={entry.stamina} color="var(--color-status-positive)" />
              ) : null}
              {liveFatigue !== undefined ? (
                <StatBar label="Yor" value={liveFatigue} color="var(--color-status-warning)" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FocusHorseCard({
  entry,
  name,
  color,
  raceDistanceMeters,
}: {
  entry: LiveLeaderboardEntry;
  name: string;
  color: string;
  raceDistanceMeters?: number;
}): React.ReactElement {
  const remaining =
    raceDistanceMeters !== undefined
      ? Math.max(0, Math.round(raceDistanceMeters - entry.positionMeters))
      : null;
  return (
    <div className="hud-panel hud-focus">
      <div className="hud-focus-portrait" style={{ borderColor: color }}>
        <HorseHeadIcon size={46} gradient withMane />
      </div>
      <div className="hud-focus-body">
        <div className="hud-focus-name">
          <RankBadge rank={entry.rank} color={color} />
          <strong>{name}</strong>
        </div>
        <div className="hud-focus-stats">
          <span className="hud-focus-stat">
            <Gauge size={15} aria-hidden="true" />
            <span className="hud-focus-stat-label">Hız</span>
            <strong>{Math.round(entry.speedMps * MPS_TO_KMH)} km/s</strong>
          </span>
          {entry.paceScore !== undefined ? (
            <span className="hud-focus-stat">
              <Route size={15} aria-hidden="true" />
              <span className="hud-focus-stat-label">Tempo</span>
              <strong>{Math.round(entry.paceScore)}</strong>
            </span>
          ) : null}
          {remaining !== null ? (
            <span className="hud-focus-stat">
              <Flag size={15} aria-hidden="true" />
              <span className="hud-focus-stat-label">Kalan</span>
              <strong>{remaining} m</strong>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Yarışın ilerleme şeridi: her at, katettiği mesafe oranında renkli rozetle. */
function ProgressStrip({
  leaderboard,
  horseColorsById,
  raceDistanceMeters,
}: {
  leaderboard: LiveLeaderboardEntry[];
  horseColorsById: Record<string, string>;
  raceDistanceMeters: number;
}): React.ReactElement {
  return (
    <div className="hud-panel hud-progress" aria-label="Yarış ilerlemesi">
      <div className="hud-progress-track">
        <Flag size={14} className="hud-progress-finish" aria-hidden="true" />
        {[...leaderboard].reverse().map((entry) => {
          const ratio = Math.max(0, Math.min(1, entry.positionMeters / raceDistanceMeters));
          return (
            <span
              key={entry.horseId}
              className="hud-progress-marker"
              style={{
                left: `${ratio * 100}%`,
                background: horseColorsById[entry.horseId] ?? FALLBACK_BADGE_COLOR,
              }}
              title={`${entry.rank}.`}
            >
              {entry.rank}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** §23 Photo Finish sonuç kartı — yalnızca hesaplanmış satırları gösterir. */
function FinishResultOverlay({ rows }: { rows: PhotoFinishRow[] }): React.ReactElement {
  const closeFinish = isCloseFinish(rows, cameraConfig);
  return (
    <div className="hud-finish-backdrop">
      <div className="hud-panel hud-finish">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-sm)' }}>
          {closeFinish ? <div className="hud-finish-photo">Foto Finiş!</div> : null}
          <div className="hud-finish-title">Yarış Sonucu</div>
        </div>
        <ol className="hud-finish-list">
          {rows.map((row) => (
            <li
              key={`${row.finishPosition}-${row.horseId ?? row.displayName}`}
              data-winner={row.isWinner || undefined}
            >
              <span>
                {row.finishPosition}. {row.displayName}
              </span>
              <span className="hud-finish-gap">{formatFinishGap(row.gapToWinnerMs)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function MiniMap({
  markers,
  track,
  horseColorsById,
}: {
  markers: MiniMapMarker[];
  track?: MiniMapPoint[];
  horseColorsById: Record<string, string>;
}): React.ReactElement {
  const trackPath =
    track && track.length > 1
      ? `${track.map((point) => `${point.xPercent},${point.yPercent}`).join(' ')}`
      : null;
  return (
    <div className="hud-panel hud-minimap">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%' }}
      >
        {trackPath ? (
          <>
            <polygon
              points={trackPath}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={9}
              strokeLinejoin="round"
            />
            <polygon
              points={trackPath}
              fill="none"
              stroke="rgba(214,180,130,0.9)"
              strokeWidth={5}
              strokeLinejoin="round"
            />
          </>
        ) : (
          <rect x={2} y={2} width={96} height={96} rx={8} fill="rgba(255,255,255,0.03)" />
        )}
        {markers.map((marker) => (
          <circle
            key={marker.horseId}
            cx={marker.xPercent}
            cy={marker.yPercent}
            r={marker.isLeader ? 3.6 : 2.8}
            fill={
              horseColorsById[marker.horseId] ??
              (marker.isLeader ? 'var(--color-accent-gold)' : 'var(--color-accent-focus)')
            }
            stroke="#0b1220"
            strokeWidth={0.8}
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
    <div className="hud-panel hud-playback">
      <button type="button" onClick={onTogglePlay} className="hud-play-button">
        {isPlaying ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={durationMs}
        value={currentTimeMs}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="hud-seek"
      />
      <div className="hud-speeds">
        {SPEED_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className="hud-speed-button"
            aria-pressed={option === speedMultiplier}
            onClick={() => onChangeSpeedMultiplier(option)}
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
