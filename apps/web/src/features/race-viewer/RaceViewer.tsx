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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RaceSegmentSnapshot, RaceTimeline } from '@at-sevdalisi/shared-types';
import { loadCameraConfig } from '@at-sevdalisi/game-config';
import {
  DEFAULT_LAP_LENGTH_METERS,
  DEFAULT_TURN_RADIUS_METERS,
  createStadiumTrackGeometry,
  getHorseTrackPosition,
  type StadiumTrackGeometry,
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

/**
 * Faz 6 "Config ayrımı" (bu turda EKLENDİ) — modül kapsamında BİR KEZ
 * yüklenir (`apps/api`'nin `ConfigService`'inin `readonly race = loadRaceConfig()`
 * deseniyle AYNI fikir — config, derleme zamanında bundle'a gömülü statik
 * bir JSON olduğundan tekrar tekrar çağırmanın bir MALİYETİ yoktur, ama
 * component her render'da YENİDEN YÜKLEMEK yerine tek bir modül-seviyesi
 * sabit render döngüsünün DIŞINDA tutulur).
 */
const cameraConfig = loadCameraConfig();

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

/**
 * `HORSE_COLORS[index % HORSE_COLORS.length]` matematiksel olarak HER ZAMAN
 * dizinin sınırları içindedir (`%` operatörü bunu garanti eder), ama
 * `noUncheckedIndexedAccess` bunu `string | undefined` olarak tipler.
 * `LiveRaceViewer.tsx`'in kendi `pickHorseColor`'ı (bu turda BURAYA
 * TAŞINDI — ikisi BİREBİR AYNI mantığı taşıyordu, tek bir kopya kalsın
 * diye) ile AYNI prensip: `!` tip zorlaması KULLANILMADAN gerçek bir
 * çalışma zamanı guard'ı.
 */
export function pickHorseColor(index: number): string {
  const color = HORSE_COLORS[index % HORSE_COLORS.length];
  if (color === undefined) {
    throw new Error('pickHorseColor: HORSE_COLORS boş olmamalıydı.');
  }
  return color;
}

/**
 * Faz 2 "HUD Telemetri" düzeltmesi (bu turda EKLENDİ) — `RaceViewer.tsx`
 * VE `LiveRaceViewer.tsx`'in AYNI at-görseli hesaplama mantığını (kimlik
 * listesi × index → renk, ara değerlenmiş konum, kim lider) TEK bir yerde
 * tutar; `LiveRaceViewer.tsx` daha önce bunun neredeyse BİREBİR AYNI bir
 * kopyasını (yalnızca değişken adı "entryId") kendi `horseVisuals`
 * useMemo'sunda tutuyordu. İkinci parametrenin adı "horseId" olsa da
 * `interpolateHorseStateAtTime` bunu OPAK bir anahtar olarak kullanır
 * (bkz. `timeline-playback.ts` imzası) — `LiveRaceViewer.tsx` kendi
 * `raceEntryId` değerlerini buraya geçirebilir (kendi dosya başı doc
 * yorumu madde 3'te zaten belgelendiği gibi doğru kullanımdır).
 *
 * Bu fonksiyon HEM 60Hz "sahne" saatiyle (3D at hareketi için) HEM
 * throttle'lı "HUD" saatiyle (bkz. aşağıdaki `HUD_SYNC_INTERVAL_MS` doc
 * yorumu) çağrılabilecek şekilde SAF tutulur — hangi zaman değerinin
 * geçirildiğine karar vermek çağıranın işidir.
 */
export function computeHorseVisualsAt(
  ids: string[],
  segments: RaceSegmentSnapshot[],
  timeMs: number,
  turnCount: number,
  trackGeometry: StadiumTrackGeometry,
): HorseVisual[] {
  const states = ids.map((id, index) => {
    const state = interpolateHorseStateAtTime(segments, id, timeMs);
    const point = getHorseTrackPosition(state.positionMeters, turnCount, trackGeometry);
    return {
      horseId: id,
      x: point.x,
      z: point.z,
      headingRadians: point.headingRadians,
      color: pickHorseColor(index),
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
}

/**
 * Faz 2 "HUD Telemetri" düzeltmesi (bu turda EKLENDİ) — brief'in kendi
 * uyarısı: "HUD performansını bozacak şekilde React state'i her frame
 * güncelleme. Render loop / uygun reactive architecture kullan." Daha
 * önce TEK bir `currentTimeMs` state'i HEM 3D sahneyi HEM DOM tabanlı
 * `RaceHud`'u besliyordu — ikisi de her rAF karesinde (60Hz) `setState`
 * ile güncelleniyordu. 3D sahne tarafı bu ZARARSIZDIR: `RaceScene3D`
 * React-Three-Fiber'ın KENDİ reconciler'ı üzerinden akar, gerçek tarayıcı
 * DOM'una hiç DOKUNMAZ (bkz. `docs/ARCHITECTURE.md` §5). Ama `RaceHud`
 * DÜZ DOM/CSS'tir (bkz. o dosyanın "KASITLI OLARAK Three.js içermez" doc
 * yorumu) — onu 60Hz'de yeniden render etmek GERÇEK bir DOM diff'i
 * tetikler, bu da brief'in ihlal olarak işaret ettiği tam olarak budur.
 *
 * Çözüm: `RaceHud`'un tükettiği TÜM türetilmiş veri (leaderboard, minimap,
 * kamera yönetmeni girdisi, zaman göstergesi) AYRI ve daha düşük
 * frekanslı bir `hudTimeMs` state'inden türetilir; `RaceHud`'un kendisi
 * `memo()` ile sarılmıştır (bkz. `RaceHud.tsx`) — böylece `hudTimeMs`
 * (ve ondan türeyen referanslar) değişmediği sürece gerçek bir render/DOM
 * diff hiç ÇALIŞMAZ. `currentTimeMs` (3D sahne saati) HÂLÂ her karede
 * güncellenir — atın hareketi (brief §51 "atın gerçekçi koştuğunu
 * görmeli") pürüzsüz kalır, YALNIZCA DOM tarafı yavaşlatılır.
 *
 * 100ms (10Hz) insan gözü için hâlâ "gerçek zamanlı" hissettirir (brief
 * §2: "Speed/Stamina/Fatigue/Distance/Position değerleri yarış sırasında
 * gerçek zamanlı güncellenmeli") ama DOM güncelleme sıklığını 60Hz'e göre
 * 6 kat azaltır.
 *
 * `export` edildi çünkü `LiveRaceViewer.tsx` AYNI throttle sabitini
 * kullanır (bkz. o dosyanın kendi `tick()` fonksiyonu) — iki ayrı sabit
 * İCAT ETMEK yerine tek bir kaynak.
 */
export const HUD_SYNC_INTERVAL_MS = 100;

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
  // Faz 2 düzeltmesi (bkz. `HUD_SYNC_INTERVAL_MS` doc yorumu) — HUD'un
  // (DOM) tükettiği throttle'lı zaman ekseni.
  const [hudTimeMs, setHudTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [cameraMode, setCameraMode] = useState<CameraMode>('track');

  const lastFrameTimestampRef = useRef<number | null>(null);
  // `setCurrentTimeMs`'in fonksiyonel güncelleme deseni yerine (aynı
  // `tick()` çağrısı içinde HEM 3D saatini HEM throttle kararını AYNI
  // "bir sonraki değer"e göre almak gerektiğinden) tek bir yetkili
  // referans — `onSeek` de bunu senkron tutar.
  const currentTimeMsRef = useRef(0);
  const lastHudSyncAtRef = useRef(0);

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
        // Photo Finish sunumu (Master Brief §23, bkz. `photo-finish.ts`
        // dosya başı doc yorumu) — bitişe yaklaşırken kullanıcının
        // seçtiği hız kademeli olarak YAVAŞLAR, ani bir kesme OLMAZ.
        const slowMotionFactor = getFinishSlowMotionFactor(currentTimeMsRef.current, durationMs, cameraConfig);
        const next = advancePlaybackTimeMs(currentTimeMsRef.current, deltaMs, speedMultiplier * slowMotionFactor, durationMs);
        currentTimeMsRef.current = next;
        setCurrentTimeMs(next);
        // Faz 2 düzeltmesi — HUD state'i HER karede DEĞİL, throttle
        // penceresinde bir güncellenir; yarış tam bu karede biterse
        // (`next >= durationMs`) throttle'ı BEKLEMEDEN anında senkronize
        // edilir (foto finiş/son sıralama gecikmeden görünsün diye).
        if (now - lastHudSyncAtRef.current >= HUD_SYNC_INTERVAL_MS || next >= durationMs) {
          lastHudSyncAtRef.current = now;
          setHudTimeMs(next);
        }
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

  // 3D sahne — HER rAF karesinde (60Hz) günceli kalır (bkz.
  // `HUD_SYNC_INTERVAL_MS` doc yorumu).
  const horseVisuals: HorseVisual[] = useMemo(
    () => computeHorseVisualsAt(horseIds, timeline.segments, currentTimeMs, turnCount, trackGeometry),
    [horseIds, timeline.segments, currentTimeMs, turnCount, trackGeometry],
  );

  // HUD (DOM) — throttle'lı `hudTimeMs`'ten türetilir; minimap DAHİL,
  // `RaceHud`'a giden HİÇBİR türetilmiş veri 60Hz'de YENİLENMEZ (bkz.
  // `HUD_SYNC_INTERVAL_MS` doc yorumu).
  const hudHorseVisuals: HorseVisual[] = useMemo(
    () => computeHorseVisualsAt(horseIds, timeline.segments, hudTimeMs, turnCount, trackGeometry),
    [horseIds, timeline.segments, hudTimeMs, turnCount, trackGeometry],
  );

  const leaderboard = useMemo(
    () => getLiveLeaderboard(timeline.segments, horseIds, hudTimeMs),
    [timeline.segments, horseIds, hudTimeMs],
  );

  // Camera Director (Master Development Brief §17, bkz. `camera-director.ts`
  // dosya başı doc yorumu) — `leaderboard` zaten rank'e göre sıralı
  // olduğundan `leaderboard[0]` her zaman lider attır, ayrı bir hesaplama
  // GEREKMEZ. Kamera olayları (FINAL_400 gibi) frame-hassasiyeti
  // GEREKTİRMEDİĞİNDEN throttle'lı `hudTimeMs`'e bağlı kalması ZARARSIZDIR
  // (bitiş tespiti için `isRaceFinished` ayrıca 60Hz `currentTimeMs`'ten
  // hesaplanır — bu tek seferlik bir geçiş olduğundan gecikmesiz olması
  // tercih edilir).
  const isRaceFinished = durationMs > 0 && currentTimeMs >= durationMs;
  const leaderPositionMeters = leaderboard[0]?.positionMeters ?? 0;
  const anyHorseBlocked = useMemo(
    () => isAnyHorseBlockedAtTime(timeline.segments, horseIds, hudTimeMs),
    [timeline.segments, horseIds, hudTimeMs],
  );
  const manualCameraOverrideRef = useRef(false);
  const lastAutoCameraEventRef = useRef<RaceCameraEvent | null>(null);

  useEffect(() => {
    const cameraDirectorInput = { leaderPositionMeters, raceDistanceMeters, anyHorseBlocked, isFinished: isRaceFinished };
    const currentEvent = classifyRaceCameraEvent(cameraDirectorInput, cameraConfig);
    if (currentEvent !== lastAutoCameraEventRef.current) {
      // Yeni bir race event'ine geçildi (brief §17) — kullanıcının bir
      // önceki event boyunca yaptığı manuel seçim burada sona erer,
      // otomatik yönetmen tekrar devreye girer.
      manualCameraOverrideRef.current = false;
      lastAutoCameraEventRef.current = currentEvent;
    }
    if (!manualCameraOverrideRef.current) {
      setCameraMode(selectAutomaticCameraMode(cameraDirectorInput, cameraConfig));
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
      hudHorseVisuals.map((horse) => ({
        horseId: horse.horseId,
        isLeader: horse.isLeader,
        ...projectToMiniMap({ x: horse.x, z: horse.z, headingRadians: horse.headingRadians }, trackGeometry),
      })),
    [hudHorseVisuals, trackGeometry],
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

  // Faz 2 düzeltmesi (bkz. `HUD_SYNC_INTERVAL_MS` doc yorumu) — bu
  // callback'ler `useCallback` ile SABİT kimlikte tutulur, aksi halde her
  // render'da YENİ bir fonksiyon referansı `RaceHud`'un (bkz. `memo()`
  // sarmalayıcısı) sığ prop karşılaştırmasını KIRAR ve throttle'ın tüm
  // amacını boşa çıkarır.
  const handleTogglePlay = useCallback(() => setIsPlaying((previous) => !previous), []);
  const handleChangeCameraMode = useCallback((mode: CameraMode) => {
    // Kullanıcı manuel seçti — Camera Director bir sonraki race
    // event'ine kadar bu seçime dokunmaz (bkz. yukarıdaki useEffect).
    manualCameraOverrideRef.current = true;
    setCameraMode(mode);
  }, []);
  const handleSeek = useCallback((timeMs: number) => {
    // Seek, throttle penceresini BEKLEMEDEN hem 3D saatini hem HUD
    // saatini ANINDA senkronize eder — aksi halde kullanıcı sürükleme
    // çubuğunu bıraktığında HUD'un (sıralama/minimap) en fazla
    // `HUD_SYNC_INTERVAL_MS` kadar ESKİ bir anı göstermesi riski olurdu.
    currentTimeMsRef.current = timeMs;
    setCurrentTimeMs(timeMs);
    setHudTimeMs(timeMs);
    lastHudSyncAtRef.current = performance.now();
    setIsPlaying(false);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '480px' }}>
      <RaceScene3D horses={horseVisuals} cameraPose={cameraPose} trackGeometry={trackGeometry} />
      <RaceHud
        horseNamesById={horseNamesById}
        leaderboard={leaderboard}
        miniMapMarkers={miniMapMarkers}
        currentTimeMs={hudTimeMs}
        durationMs={durationMs}
        isPlaying={isPlaying}
        speedMultiplier={speedMultiplier}
        cameraMode={cameraMode}
        finishResult={isRaceFinished ? finishRows : undefined}
        onTogglePlay={handleTogglePlay}
        onChangeSpeedMultiplier={setSpeedMultiplier}
        onChangeCameraMode={handleChangeCameraMode}
        onSeek={handleSeek}
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
