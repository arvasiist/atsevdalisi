'use client';

/**
 * OYUNCU KONTROLLÜ YARIŞ EKRANI (01.10.2026). Yarış sunucuda akar; ekran
 * gösterilmiş segmentleri sunucu saatine göre oynatır ve düğmeler/klavye
 * komutları sunucuya iletir. Komut, bir sonraki gösterilmemiş segmentte
 * etki eder — ekranda "sıradaki bölüm" sayacı bunu gösterir.
 *
 * Hiçbir sonuç burada hesaplanmaz: sıra, para ve XP sunucudan gelir.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Zap } from 'lucide-react';
import type { InteractiveRaceView, PlayerControlInput } from '@at-sevdalisi/shared-types';
import { loadAtmosphereConfig, loadCameraConfig } from '@at-sevdalisi/game-config';
import { apiClient } from '../../lib/api-client';
import {
  DEFAULT_LAP_LENGTH_METERS,
  DEFAULT_TURN_RADIUS_METERS,
  createStadiumTrackGeometry,
  getHorseTrackPosition,
} from '../race-viewer/track-path';
import { computeCameraPose, type CameraMode } from '../race-viewer/camera-presets';
import { getLiveLeaderboard } from '../race-viewer/timeline-playback';
import { computeCrowdExcitement, useSecondsSinceFinish } from '../race-viewer/race-atmosphere';
import { AudioToggle } from '../race-viewer/audio-vfx/AudioToggle';
import { QualitySelect } from '../race-viewer/QualitySelect';
import { useAudioMuted, useRaceAudio } from '../race-viewer/audio-vfx/use-race-audio';
import { HORSE_VISUAL_HEIGHT_METERS, computeHorseVisualsAt } from '../race-viewer/RaceViewer';
import {
  controlForKey,
  latestStamina,
  pendingCommand,
  raceClockMs,
  serverClockOffsetMs,
} from './ride-logic';

const RaceScene3D = dynamic(
  () => import('../race-viewer/RaceScene3D').then((mod) => mod.RaceScene3D),
  {
    ssr: false,
    loading: () => <div className="ride-loading">Sahne yükleniyor…</div>,
  },
);

const cameraConfig = loadCameraConfig();
const ATMOSPHERE = loadAtmosphereConfig();
const POLL_INTERVAL_MS = 1000;
const CAMERA_LABELS: Record<CameraMode, string> = {
  jockey: 'Jokey',
  track: 'Pist',
  final_straight: 'Son Düzlük',
  photo_finish: 'Fotofiniş',
};

export interface InteractiveRaceViewerProps {
  initialView: InteractiveRaceView;
  horseName: string;
  onClose: () => void;
}

export function InteractiveRaceViewer({
  initialView,
  horseName,
  onClose,
}: InteractiveRaceViewerProps): React.ReactElement {
  const [view, setView] = useState(initialView);
  const offsetRef = useRef(serverClockOffsetMs(initialView.serverNow, Date.now()));
  const [raceTimeMs, setRaceTimeMs] = useState(() =>
    raceClockMs(Date.now(), offsetRef.current, initialView.startsAt, initialView.timeScale),
  );
  const [cameraMode, setCameraMode] = useState<CameraMode>('jockey');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<PlayerControlInput | null>(null);
  const finishingRef = useRef(false);
  const raceId = view.raceId;
  const running = view.status === 'running';

  const accept = useCallback((next: InteractiveRaceView) => {
    offsetRef.current = serverClockOffsetMs(next.serverNow, Date.now());
    setView(next);
  }, []);

  // Sunucu yoklaması (gösterim sınırı + kesinleşme durumu).
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      void apiClient
        .getInteractiveRace(raceId)
        .then(accept)
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [raceId, running, accept]);

  // Yarış saati — her karede.
  useEffect(() => {
    let frame = 0;
    const tick = (): void => {
      setRaceTimeMs(raceClockMs(Date.now(), offsetRef.current, view.startsAt, view.timeScale));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [view.startsAt, view.timeScale]);

  // Bitti → kesinleştir (bir kez).
  useEffect(() => {
    if (!view.canFinish || !running || finishingRef.current) return;
    finishingRef.current = true;
    void apiClient
      .finishInteractiveRace(raceId)
      .then(accept)
      .catch((cause: unknown) => {
        finishingRef.current = false;
        setError(cause instanceof Error ? cause.message : 'Yarış kesinleşemedi.');
      });
  }, [view.canFinish, running, raceId, accept]);

  const send = useCallback(
    (control: PlayerControlInput) => {
      if (!running || view.nextCommandSegment === null) return;
      setFlash(control);
      window.setTimeout(() => setFlash((current) => (current === control ? null : current)), 150);
      void apiClient
        .sendRaceControl(raceId, control)
        .then(accept)
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : 'Komut iletilemedi.'),
        );
    },
    [raceId, running, view.nextCommandSegment, accept],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const control = controlForKey(event.key);
      if (control === null) return;
      event.preventDefault();
      send(control);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send]);

  // ---- 3D sahne verisi ----
  const trackGeometry = useMemo(
    () => createStadiumTrackGeometry(DEFAULT_LAP_LENGTH_METERS, DEFAULT_TURN_RADIUS_METERS),
    [],
  );
  const turnCount = 2;
  const entryIds = useMemo(() => view.entrants.map((entrant) => entrant.label), [view.entrants]);
  const clampedTime = Math.max(0, raceTimeMs);
  const horses = useMemo(
    () => computeHorseVisualsAt(entryIds, view.segments, clampedTime, turnCount, trackGeometry),
    [entryIds, view.segments, clampedTime, trackGeometry],
  );
  const leaderboard = useMemo(
    () => getLiveLeaderboard(view.segments, entryIds, clampedTime),
    [view.segments, entryIds, clampedTime],
  );
  const myRow = leaderboard.find((row) => row.horseId === view.playerLabel);
  // Bitişte herkes aynı mesafededir; kesin sıra sunucunun sonucundan gelir.
  const finalPosition =
    view.result?.finalResult.find((entry) => entry.horseId === view.result?.horseId)
      ?.finishPosition ?? null;
  const myRank = finalPosition ?? myRow?.rank ?? null;
  const myPositionMeters = Math.min(view.distanceMeters, myRow?.positionMeters ?? 0);
  const mine = horses.find((horse) => horse.horseId === view.playerLabel);
  const leader = horses.find((horse) => horse.isLeader) ?? horses[0];
  const finishPoint = useMemo(
    () => getHorseTrackPosition(view.distanceMeters, turnCount, trackGeometry),
    [view.distanceMeters, trackGeometry],
  );
  const startPoint = useMemo(
    () => getHorseTrackPosition(0, turnCount, trackGeometry),
    [trackGeometry],
  );
  const cameraPose = useMemo(() => {
    const at = (horse: typeof mine) =>
      horse
        ? { x: horse.x, y: HORSE_VISUAL_HEIGHT_METERS, z: horse.z }
        : { x: 0, y: HORSE_VISUAL_HEIGHT_METERS, z: 0 };
    return computeCameraPose(cameraMode, {
      leaderPosition: at(leader),
      focusHorsePosition: at(mine ?? leader),
      trackCenter: { x: 0, y: 0, z: 0 },
      finishLinePosition: { x: finishPoint.x, y: 0, z: finishPoint.z },
      leaderHeadingRadians: leader?.headingRadians ?? 0,
      focusHeadingRadians: (mine ?? leader)?.headingRadians ?? 0,
    });
  }, [cameraMode, leader, mine, finishPoint]);

  const finished = view.status === 'finished';
  const leaderPositionMeters = leaderboard[0]?.positionMeters ?? 0;
  const secondsSinceFinish = useSecondsSinceFinish(
    finished,
    ATMOSPHERE.crowd.finishCelebrationSeconds,
  );
  const crowdExcitement = computeCrowdExcitement(
    {
      leaderPositionMeters,
      raceDistanceMeters: view.distanceMeters,
      finalStretchRemainingMeters: cameraConfig.finalStretchRemainingMeters,
      isRaceFinished: finished,
      secondsSinceFinish,
    },
    ATMOSPHERE,
  );
  const [audioMuted, setAudioMuted] = useAudioMuted();
  useRaceAudio({
    muted: audioMuted,
    isPlaying: true,
    surface: view.surface,
    timeMs: clampedTime,
    started: raceTimeMs > 0,
    leaderHorseId: leaderboard[0]?.horseId,
    inFinalStretch:
      view.distanceMeters - leaderPositionMeters <= cameraConfig.finalStretchRemainingMeters,
    isFinished: finished,
    crowdExcitement,
    leaderSpeedMps: leaderboard[0]?.speedMps ?? 0,
  });

  const pending = pendingCommand(view);
  const stamina = latestStamina(view, clampedTime);
  const countdown = raceTimeMs < 0 ? Math.ceil(-raceTimeMs / view.timeScale / 1000) : null;
  const canCommand = running && view.nextCommandSegment !== null;
  const result = view.result;
  const myFinish = result?.finalResult.find((entry) => entry.horseId === result.horseId) ?? null;

  return (
    <div className="ride">
      <RaceScene3D
        horses={horses}
        crowdExcitement={crowdExcitement}
        surface={view.surface}
        startPoint={startPoint}
        gateOpen={raceTimeMs > 0}
        cameraPose={cameraPose}
        trackGeometry={trackGeometry}
      />

      <div className="ride-top">
        <div className="ride-badge">
          <strong>{horseName}</strong>
          <span>
            {myRank !== null ? `${myRank}. sıra` : 'Kapıda'} · {Math.round(myPositionMeters)} /{' '}
            {view.distanceMeters} m
          </span>
          {stamina !== null ? (
            <div className="ride-stamina" aria-label={`Dayanıklılık ${Math.round(stamina)}`}>
              <div style={{ width: `${Math.max(0, Math.min(100, stamina))}%` }} />
            </div>
          ) : null}
        </div>
        <div className="scene-controls" style={{ position: 'static' }}>
          {(Object.keys(CAMERA_LABELS) as CameraMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className="ride-cam"
              aria-pressed={cameraMode === mode}
              onClick={() => setCameraMode(mode)}
            >
              {CAMERA_LABELS[mode]}
            </button>
          ))}
          <AudioToggle muted={audioMuted} onChange={setAudioMuted} />
          <QualitySelect />
        </div>
      </div>

      {countdown !== null ? <div className="ride-countdown">{countdown}</div> : null}

      {!finished ? (
        <div className="ride-controls" role="group" aria-label="At kontrolleri">
          <button
            type="button"
            className="ride-btn"
            data-active={flash === 'left'}
            disabled={!canCommand}
            onClick={() => send('left')}
          >
            <ArrowLeft size={22} aria-hidden="true" />
            <span>Sol</span>
            {pending?.laneShift === -1 ? <em>✓</em> : null}
          </button>
          <button
            type="button"
            className="ride-btn"
            data-active={flash === 'ease'}
            disabled={!canCommand}
            onClick={() => send('ease')}
          >
            <ArrowDown size={22} aria-hidden="true" />
            <span>Sakin</span>
            {pending?.ease ? <em>✓</em> : null}
          </button>
          <button
            type="button"
            className="ride-btn ride-btn-whip"
            data-active={flash === 'whip'}
            disabled={!canCommand}
            onClick={() => send('whip')}
          >
            <Zap size={26} aria-hidden="true" />
            <span>Kırbaç</span>
            {pending && pending.whips > 0 ? <em>×{pending.whips}</em> : null}
          </button>
          <button
            type="button"
            className="ride-btn"
            data-active={flash === 'right'}
            disabled={!canCommand}
            onClick={() => send('right')}
          >
            <ArrowRight size={22} aria-hidden="true" />
            <span>Sağ</span>
            {pending?.laneShift === 1 ? <em>✓</em> : null}
          </button>
          <p className="ride-hint">
            Klavye: Boşluk kırbaç · ← → yön · ↓ sakin. Komut bir sonraki bölümde etki eder; her
            kırbaç dayanıklılık yakar.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="ride-error" role="alert">
          {error}
        </div>
      ) : null}

      {result && myFinish ? (
        <div className="ride-result">
          <h2>{myFinish.finishPosition}. oldun</h2>
          <p>
            Ödül: <strong>{result.prizeWon.toLocaleString('tr-TR')}</strong> · Giriş:{' '}
            {result.entryFee.toLocaleString('tr-TR')} · XP +{result.xpGained.player}
          </p>
          <button type="button" className="btn-gold" onClick={onClose}>
            Tamam
          </button>
        </div>
      ) : finished ? null : view.canFinish ? (
        <div className="ride-result">
          <p>Sonuç hesaplanıyor…</p>
        </div>
      ) : null}
    </div>
  );
}
