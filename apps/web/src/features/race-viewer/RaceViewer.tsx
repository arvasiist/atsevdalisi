'use client';

/**
 * Yarış izleyici — Three.js sahnesini (`RaceScene3D`, dynamic import) ve
 * HUD'u (`RaceHud`) birleştiren, oynatma saatini yöneten üst bileşen.
 *
 * `docs/ARCHITECTURE.md` §7: Three.js sahnesi sadece bu bileşen mount
 * edildiğinde (yani sadece yarış ekranına girildiğinde) `next/dynamic`
 * ile `ssr:false` olarak yüklenir — bu dosyanın kendisi `three`'ye
 * DOĞRUDAN bağımlı DEĞİLDİR (sadece tip importu, derleme zamanında
 * silinir), bu yüzden ilk sayfa yükünü artırmaz.
 */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RaceTimeline } from '@at-sevdalisi/shared-types';
import {
  DEFAULT_LAP_LENGTH_METERS,
  DEFAULT_TURN_RADIUS_METERS,
  createStadiumTrackGeometry,
  getHorseTrackPosition,
} from './track-path';
import { computeCameraPose, type CameraMode } from './camera-presets';
import { selectAutomaticCameraMode, type RaceCameraEvent, classifyRaceCameraEvent } from './camera-director';
import { buildPhotoFinishRows, getFinishSlowMotionFactor } from './photo-finish';
import { projectToMiniMap } from './minimap-projection';
import {
  advancePlaybackTimeMs,
  getHorseIdsFromTimeline,
  getLiveLeaderboard,
  getRaceDurationMs,
  interpolateHorseStateAtTime,
  isAnyHorseBlockedAtTime,
} from './timeline-playback';
import { RaceHud, type MiniMapMarker } from './RaceHud';
import type { HorseVisual } from './RaceScene3D';

const RaceScene3D = dynamic(() => import('./RaceScene3D').then((imported) => imported.RaceScene3D), {
  ssr: false,
  loading: () => <ScenePlaceholder />,
});

export interface RaceViewerProps {
  timeline: RaceTimeline;
  horseNamesById: Record<string, string>;
  /** brief §7 `Track.turnCount` — pist virajlı mı, düz mü. Varsayılan: virajlı (2). */
  turnCount?: number;
}

/**
 * F2 canlı yayın entegrasyonu (bu turda EKLENDİ) — `export` edildi çünkü
 * `LiveRaceViewer.tsx` AYNI paleti kullanır (iki ayrı renk listesi İCAT
 * ETMEK yerine tek bir kaynak — bkz. o dosyanın importu).
 */
export const HORSE_COLORS = ['#e3b341', '#38bdf8', '#4ade80', '#f87171', '#a78bfa', '#fb923c'];
export const HORSE_VISUAL_HEIGHT_METERS = 1;

export function RaceViewer({ timeline, horseNamesById, turnCount = 2 }: RaceViewerProps): React.ReactElement {
  const horseIds = useMemo(() => getHorseIdsFromTimeline(timeline), [timeline]);
  const durationMs = useMemo(() => getRaceDurationMs(timeline), [timeline]);
  const trackGeometry = useMemo(
    () => createStadiumTrackGeometry(DEFAULT_LAP_LENGTH_METERS, DEFAULT_TURN_RADIUS_METERS),
    [],
  );
  const raceDistanceMeters = useMemo(() => {
    let max = 0;
    for (const segment of timeline.segments) {
      if (segment.positionMeters > max) {
        max = segment.positionMeters;
      }
    }
    return max;
  }, [timeline.segments]);

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [cameraMode, setCameraMode] = useState<CameraMode>('track');

  const lastFrameTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      lastFrameTimestampRef.current = null;
      return undefined;
    }

    let frameId: number;
    const tick = (now: number): void => {
      const last = lastFrameTimestampRef.current;
      if (last !== null) {
        const deltaMs = now - last;
        setCurrentTimeMs((previous) => {
          // Photo Finish sunumu (Master Brief §23, bkz. `photo-finish.ts`
          // dosya başı doc yorumu) — bitişe yaklaşırken kullanıcının
          // seçtiği hız kademeli olarak YAVAŞLAR, ani bir kesme OLMAZ.
          const slowMotionFactor = getFinishSlowMotionFactor(previous, durationMs);
          return advancePlaybackTimeMs(previous, deltaMs, speedMultiplier * slowMotionFactor, durationMs);
        });
      }
      lastFrameTimestampRef.current = now;
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      lastFrameTimestampRef.current = null;
    };
  }, [isPlaying, speedMultiplier, durationMs]);

  useEffect(() => {
    if (durationMs > 0 && currentTimeMs >= durationMs) {
      setIsPlaying(false);
    }
  }, [currentTimeMs, durationMs]);

  const horseVisuals: HorseVisual[] = useMemo(() => {
    const states = horseIds.map((horseId, index) => {
      const state = interpolateHorseStateAtTime(timeline.segments, horseId, currentTimeMs);
      const point = getHorseTrackPosition(state.positionMeters, turnCount, trackGeometry);
      return {
        horseId,
        x: point.x,
        z: point.z,
        headingRadians: point.headingRadians,
        color: HORSE_COLORS[index % HORSE_COLORS.length]!,
        positionMeters: state.positionMeters,
      };
    });
    const leaderId = [...states].sort((a, b) => b.positionMeters - a.positionMeters)[0]?.horseId;
    return states.map((state) => ({
      horseId: state.horseId,
      x: state.x,
      z: state.z,
      headingRadians: state.headingRadians,
      color: state.color,
      isLeader: state.horseId === leaderId,
    }));
  }, [horseIds, timeline.segments, currentTimeMs, turnCount, trackGeometry]);

  const leaderboard = useMemo(
    () => getLiveLeaderboard(timeline.segments, horseIds, currentTimeMs),
    [timeline.segments, horseIds, currentTimeMs],
  );

  // Camera Director (Master Development Brief §17, bkz. `camera-director.ts`
  // dosya başı doc yorumu) — `leaderboard` zaten rank'e göre sıralı
  // olduğundan `leaderboard[0]` her zaman lider attır, ayrı bir hesaplama
  // GEREKMEZ.
  const isRaceFinished = durationMs > 0 && currentTimeMs >= durationMs;
  const leaderPositionMeters = leaderboard[0]?.positionMeters ?? 0;
  const anyHorseBlocked = useMemo(
    () => isAnyHorseBlockedAtTime(timeline.segments, horseIds, currentTimeMs),
    [timeline.segments, horseIds, currentTimeMs],
  );
  const manualCameraOverrideRef = useRef(false);
  const lastAutoCameraEventRef = useRef<RaceCameraEvent | null>(null);

  useEffect(() => {
    const cameraDirectorInput = { leaderPositionMeters, raceDistanceMeters, anyHorseBlocked, isFinished: isRaceFinished };
    const currentEvent = classifyRaceCameraEvent(cameraDirectorInput);
    if (currentEvent !== lastAutoCameraEventRef.current) {
      // Yeni bir race event'ine geçildi (brief §17) — kullanıcının bir
      // önceki event boyunca yaptığı manuel seçim burada sona erer,
      // otomatik yönetmen tekrar devreye girer.
      manualCameraOverrideRef.current = false;
      lastAutoCameraEventRef.current = currentEvent;
    }
    if (!manualCameraOverrideRef.current) {
      setCameraMode(selectAutomaticCameraMode(cameraDirectorInput));
    }
  }, [leaderPositionMeters, raceDistanceMeters, anyHorseBlocked, isRaceFinished]);

  // Photo Finish sunumu (Master Brief §23) — `timeline.finalResult` PEŞİNEN
  // var (fixture/practice race verisi hazır yüklenir, `LiveRaceViewer.tsx`
  // gibi sonradan gelen bir soket olayı BEKLEMEZ), bu yüzden burada
  // `isRaceFinished` yerine `timeline.finalResult`'un kendisi kaynak alınır
  // — satırlar HER ZAMAN hesaplanabilir, sadece `isRaceFinished` olduğunda
  // HUD'a geçirilir (bkz. aşağıdaki `finishResult` prop'u).
  const finishRows = useMemo(
    () =>
      buildPhotoFinishRows(
        timeline.finalResult.map((entry) => ({
          horseId: entry.horseId,
          displayName: horseNamesById[entry.horseId] ?? entry.horseId,
          finishPosition: entry.finishPosition,
          finishTimeMs: entry.finishTimeMs,
          performanceScore: entry.performanceScore,
        })),
      ),
    [timeline.finalResult, horseNamesById],
  );

  const miniMapMarkers: MiniMapMarker[] = useMemo(
    () =>
      horseVisuals.map((horse) => ({
        horseId: horse.horseId,
        isLeader: horse.isLeader,
        ...projectToMiniMap({ x: horse.x, z: horse.z, headingRadians: horse.headingRadians }, trackGeometry),
      })),
    [horseVisuals, trackGeometry],
  );

  const finishLinePoint = useMemo(
    () => getHorseTrackPosition(raceDistanceMeters, turnCount, trackGeometry),
    [raceDistanceMeters, turnCount, trackGeometry],
  );

  const leaderVisual = horseVisuals.find((horse) => horse.isLeader) ?? horseVisuals[0];
  const focusVisual = horseVisuals.find((horse) => horse.horseId === horseIds[0]) ?? horseVisuals[0];

  const cameraPose = useMemo(() => {
    const leaderPosition = leaderVisual
      ? { x: leaderVisual.x, y: HORSE_VISUAL_HEIGHT_METERS, z: leaderVisual.z }
      : { x: 0, y: HORSE_VISUAL_HEIGHT_METERS, z: 0 };
    const focusHorsePosition = focusVisual
      ? { x: focusVisual.x, y: HORSE_VISUAL_HEIGHT_METERS, z: focusVisual.z }
      : leaderPosition;

    return computeCameraPose(cameraMode, {
      leaderPosition,
      focusHorsePosition,
      trackCenter: { x: 0, y: 0, z: 0 },
      finishLinePosition: { x: finishLinePoint.x, y: 0, z: finishLinePoint.z },
    });
  }, [cameraMode, leaderVisual, focusVisual, finishLinePoint]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '480px' }}>
      <RaceScene3D horses={horseVisuals} cameraPose={cameraPose} trackGeometry={trackGeometry} />
      <RaceHud
        horseNamesById={horseNamesById}
        leaderboard={leaderboard}
        miniMapMarkers={miniMapMarkers}
        currentTimeMs={currentTimeMs}
        durationMs={durationMs}
        isPlaying={isPlaying}
        speedMultiplier={speedMultiplier}
        cameraMode={cameraMode}
        finishResult={isRaceFinished ? finishRows : undefined}
        onTogglePlay={() => setIsPlaying((previous) => !previous)}
        onChangeSpeedMultiplier={setSpeedMultiplier}
        onChangeCameraMode={(mode) => {
          // Kullanıcı manuel seçti — Camera Director bir sonraki race
          // event'ine kadar bu seçime dokunmaz (bkz. yukarıdaki useEffect).
          manualCameraOverrideRef.current = true;
          setCameraMode(mode);
        }}
        onSeek={(timeMs) => {
          setCurrentTimeMs(timeMs);
          setIsPlaying(false);
        }}
      />
    </div>
  );
}

function ScenePlaceholder(): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: '480px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        background: 'var(--color-bg-base)',
      }}
    >
      Sahne yükleniyor…
    </div>
  );
}
