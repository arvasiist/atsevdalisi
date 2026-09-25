'use client';

/**
 * F2 canlı yayın entegrasyonu (bu turda EKLENDİ) — AUDIT_REPORT.md'de
 * belgelenen boşluğun kapatılması: F2'nin TÜM `RaceGateway` WebSocket
 * altyapısı (bağlantı, senkronize çoklu-izleyici — CI #127/#133'te
 * doğrulandı) daha önce GERÇEK bir tüketiciye sahip DEĞİLDİ — gerçek
 * `/races` akışı `RaceViewer`'ı hiç mount etmiyordu, `RaceViewer`
 * yalnızca sabit bir JSON fixture'ıyla beslenen `/races/demo`
 * sayfasında çalışıyordu. Bu bileşen o boşluğu kapatır.
 *
 * `RaceViewer.tsx`'TEN KASITLI OLARAK AYRI bir bileşendir — ikisini TEK
 * bir bileşende birleştirmek YANLIŞ olurdu, çünkü temel varsayımları
 * ÇELİŞİR:
 *
 * 1. **Süre bilinmiyor:** `RaceViewer`'ın `durationMs`'i `timeline.
 *    finalResult`'tan (her atın `finishTimeMs`'i) hesaplanır — bu, TÜM
 *    yarışın ÖNCEDEN, TAMAMEN bilindiği bir REPLAY senaryosunda anlamlıdır.
 *    Canlı bir yayında `finalResult` yarış BİTENE kadar YOKTUR (`race.
 *    finished` gelene kadar). Bu yüzden `LiveRaceViewer` kendi saatini
 *    `requestAnimationFrame` + `speedMultiplier` ile İLERLETMEZ — bunun
 *    yerine, backend'in `PLAYBACK_DURATION_MS`'e ORANTILI olarak zaten
 *    GERÇEK ZAMANDA (wall-clock) segment yayınladığı gerçeğinden
 *    YARARLANIR: `currentTimeMs`, İLK segmentin alınmasından bu yana
 *    geçen GERÇEK süredir — bu, backend'in segment gönderme temposuyla
 *    doğal olarak ÖRTÜŞÜR (segment `timestampMs`'i `t` anında ateşleniyorsa,
 *    istemci de saat `t`'ye ulaştığında o segmenti ZATEN almıştır).
 * 2. **Seek/hız/duraklat ANLAMSIZ:** Canlı bir yayında geçmişe gidilemez,
 *    hızlandırılamaz, "duraklatmak" yayını DURDURMAZ (yalnızca yerel
 *    görüntüyü dondurur — bu YANILTICI olurdu). Bu yüzden `RaceHud`'a
 *    `liveStatus` prop'u (bkz. o dosyanın doc yorumu) verilir; bu kontroller
 *    bir CANLI durum rozetiyle DEĞİŞTİRİLİR.
 * 3. **Kimlik `entryId` üzerinden, `horseId` DEĞİL:** `race.telemetry`
 *    segmentleri `raceEntryId`'ye (`race_entries.id`) göre gruplanır — bu
 *    GERÇEK bir `horseId` DEĞİLDİR (bot satırlarında `horseId` zaten
 *    `null`dur). İsim/"bu benim atım mı" eşlemesi `race.roster`'dan gelir
 *    (bkz. `race.gateway.ts`'in "Roster" doc yorumu, `docs/API.md` §10).
 *    `timeline-playback.ts`'in saf fonksiyonları (`interpolateHorseStateAtTime`
 *    vb.) parametre adı "horseId" olsa da GERÇEKTE `segment.raceEntryId`
 *    ile eşleştirir (bkz. o dosyanın imzası) — bu yüzden buradan `entryId`
 *    geçirmek DOĞRU kullanımdır, `RaceViewer.tsx`'in demo-fixture-özel
 *    varsayımını (orada `horseId === raceEntryId` TESADÜFEN doğrudur)
 *    TEKRARLAMAZ.
 *
 * Sonuç para/ödül/açıklama gösterimi burada TEKRARLANMAZ — `/races`
 * sayfası bu bileşeni `PracticeRaceResult`'ın (REST'ten ZATEN anında
 * dönen) YANINDA, ek bir GÖRSEL katman olarak mount eder; mevcut
 * `RaceResultPanel` finansal sonucu göstermeye devam eder (bkz. `races/
 * page.tsx`).
 *
 * `socket.io-client`'a bağımlı olduğundan (`live-race-socket.ts`
 * üzerinden), bu dosya da `RaceScene3D.tsx`/`live-race-socket.ts` ile
 * AYNI kısıta tabidir: bu sandbox'ta yerel `tsc`/testle TAM doğrulanamaz,
 * yalnızca `ts.transpileModule` ile sözdizimi kontrolü yapılabilir —
 * gerçek doğrulama CI'dadır (bkz. `docs/ARCHITECTURE.md` §9).
 *
 * **Reconnection dilimi (bu turda EKLENDİ — bkz. `live-race-socket.ts`'in
 * "Reconnection dilimi" doc yorumu):** İki ayrı gerçek boşluk kapatıldı:
 * (1) `onDisconnected` handler'ı artık `liveStatus`'u `'reconnecting'`ye
 * çeviriyor — bağlantı koparsa kullanıcı bunu GÖRÜR (önceki davranış:
 * ekran donuk kalır, hiçbir geri bildirim YOKTU). (2) `onTelemetry`
 * artık `mergeSegments` (bkz. `segment-merge.ts`) KULLANIYOR — ESKİDEN
 * koşulsuz `[...segmentsRef.current, ...newSegments]` ile EKLİYORDU, bu
 * da her yeniden bağlanmanın backend'den getirdiği "yakalama" segmentlerini
 * (bkz. `race.gateway.ts`'in `joinSharedPlayback`'i) TEKRAR TEKRAR
 * biriktiriyordu (yanlış SONUÇ üretmiyordu ama sınırsız bellek büyümesi
 * GERÇEK bir hataydı). `mergeSegments`, `raceEntryId:timestampMs`
 * anahtarına göre tekilleştirerek bunu yapısal olarak İMKANSIZ kılar.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RaceRosterEntrant, RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';
import { loadCameraConfig } from '@at-sevdalisi/game-config';
import {
  DEFAULT_LAP_LENGTH_METERS,
  DEFAULT_TURN_RADIUS_METERS,
  createStadiumTrackGeometry,
  getHorseTrackPosition,
} from './track-path';
import { computeCameraPose, type CameraMode } from './camera-presets';
import { selectAutomaticCameraMode, classifyRaceCameraEvent, type RaceCameraEvent } from './camera-director';
import { buildPhotoFinishRows } from './photo-finish';
import { projectToMiniMap } from './minimap-projection';
import { getLiveLeaderboard, isAnyHorseBlockedAtTime } from './timeline-playback';
import { RaceHud, type MiniMapMarker } from './RaceHud';
import type { HorseVisual } from './RaceScene3D';
import { HORSE_VISUAL_HEIGHT_METERS, HUD_SYNC_INTERVAL_MS, computeHorseVisualsAt } from './RaceViewer';
import { connectRaceSocket, type LiveRaceFinishedEntrant } from './live-race-socket';
import { mergeSegments } from './segment-merge';

const RaceScene3D = dynamic(() => import('./RaceScene3D').then((imported) => imported.RaceScene3D), {
  ssr: false,
  loading: () => <ScenePlaceholder text="Sahne yükleniyor…" />,
});

/**
 * Faz 6 "Config ayrımı" (bu turda EKLENDİ) — `RaceViewer.tsx`'teki AYNI
 * desen: modül kapsamında BİR KEZ yüklenir (bkz. o dosyanın doc yorumu).
 */
const cameraConfig = loadCameraConfig();

/**
 * Faz 2 "HUD Telemetri" düzeltmesi (bu turda EKLENDİ) — bu dosyanın kendi
 * `pickHorseColor`'ı BURADAN kaldırıldı: at-görseli hesaplaması artık
 * `computeHorseVisualsAt` (bkz. `./RaceViewer` importu) üzerinden yapılıyor,
 * o fonksiyon renk seçimini KENDİ İÇİNDE yapıyor — bu dosyanın ayrıca bir
 * kopyasını tutmasına gerek YOK.
 *
 * Aşağıdaki üç no-op, canlı yayında ANLAMSIZ olan oynat/duraklat/hız/seek
 * kontrollerinin `RaceHud`'a geçirilen karşılıklarıdır (bkz. dosya başı doc
 * yorumu madde 2). Modül seviyesinde SABİT kimlikte tanımlanırlar — JSX
 * içine inline `() => undefined` yazmak her render'da YENİ bir fonksiyon
 * referansı üretir, bu da `RaceHud`'un `memo()` sarmalayıcısının (bkz.
 * `RaceHud.tsx`) sığ prop karşılaştırmasını KIRAR ve Faz 2'nin throttle
 * amacını boşa çıkarır.
 */
const NOOP_TOGGLE_PLAY = (): void => undefined;
const NOOP_CHANGE_SPEED_MULTIPLIER = (): void => undefined;
const NOOP_SEEK = (): void => undefined;

export interface LiveRaceViewerProps {
  /** `api-client.ts`'in EXPORT edilen `API_BASE_URL`'i (bkz. `live-race-socket.ts`). */
  apiBaseUrl: string;
  /** `api-client.ts`'in `getAuthToken()`'ı — `race.gateway.ts`'in handshake doğrulaması için. */
  token: string;
  raceId: string;
  /** Roster'da bu `horseId`'ye sahip katılımcı, "Jokey Kamerası"nın takip ettiği/HUD'da vurgulanan attır. */
  ownHorseId: string;
  /** brief §7 `Track.turnCount`. Varsayılan: virajlı (2) — `RaceViewer.tsx` ile AYNI varsayılan. */
  turnCount?: number;
}

export function LiveRaceViewer({
  apiBaseUrl,
  token,
  raceId,
  ownHorseId,
  turnCount = 2,
}: LiveRaceViewerProps): React.ReactElement {
  const trackGeometry = useMemo(
    () => createStadiumTrackGeometry(DEFAULT_LAP_LENGTH_METERS, DEFAULT_TURN_RADIUS_METERS),
    [],
  );

  const [roster, setRoster] = useState<RaceRosterEntrant[] | null>(null);
  const [segments, setSegments] = useState<RaceSegmentSnapshot[]>([]);
  const [finishedEntrants, setFinishedEntrants] = useState<LiveRaceFinishedEntrant[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  // Faz 2 "HUD Telemetri" düzeltmesi (bkz. `RaceViewer.tsx`'in
  // `HUD_SYNC_INTERVAL_MS` doc yorumu) — HUD'un (DOM) tükettiği throttle'lı
  // zaman ekseni; `currentTimeMs` 3D sahne için HER karede güncellenmeye
  // devam eder.
  const [hudTimeMs, setHudTimeMs] = useState(0);
  // `tick()` içinde HEM 3D saatini HEM throttle kararını AYNI "bir sonraki
  // değer"e göre almak için tek bir yetkili referans (bkz. `RaceViewer.tsx`'in
  // AYNI deseni).
  const currentTimeMsRef = useRef(0);
  const lastHudSyncAtRef = useRef(0);
  const [cameraMode, setCameraMode] = useState<CameraMode>('track');
  // Bkz. dosya başı doc yorumu "Reconnection dilimi". `roster` `null`
  // olduğunda (ilk bağlantı) ZATEN ayrı bir "Canlı yarışa bağlanılıyor…"
  // placeholder'ı gösterildiğinden (bkz. aşağıdaki `!roster` dalı), bu
  // bayrak yalnızca "DAHA ÖNCE bağlıydık ama bağlantı koptu" durumunu
  // ayırt eder.
  const [isDisconnected, setIsDisconnected] = useState(false);

  // Bkz. dosya başı doc yorumu madde 1 — "GERÇEK zaman = oynatma saati".
  const playbackStartedAtRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  // `finished`/`segments`'in EN GÜNCEL değerlerine `tick()` içinden state
  // bağımlılığı OLMADAN erişmek için (bkz. aşağıdaki rAF efektinin doc
  // yorumu — bu efekt BİLEREK yalnızca mount/unmount'ta çalışır, `segments`
  // her güncellendiğinde YENİDEN BAŞLATILMAZ).
  const finishedRef = useRef(false);
  const segmentsRef = useRef<RaceSegmentSnapshot[]>([]);

  useEffect(() => {
    playbackStartedAtRef.current = null;
    finishedRef.current = false;
    segmentsRef.current = [];
    setRoster(null);
    setSegments([]);
    setFinishedEntrants(null);
    setErrorMessage(null);
    setCurrentTimeMs(0);
    currentTimeMsRef.current = 0;
    setHudTimeMs(0);
    lastHudSyncAtRef.current = 0;
    setIsDisconnected(false);

    const socket = connectRaceSocket(apiBaseUrl, token, raceId, {
      onRoster: (entrants) => {
        // Roster her (yeniden) bağlanmada TEKRAR gelir (bkz. `race.
        // gateway.ts`'in `joinSharedPlayback`'i — idempotent) — bunun
        // alınması bağlantının GERÇEKTEN kurulduğunun kanıtıdır, bu
        // yüzden "yeniden bağlanılıyor" durumunu burada temizliyoruz.
        setIsDisconnected(false);
        setRoster(entrants);
      },
      onTelemetry: (newSegments) => {
        setIsDisconnected(false);
        if (playbackStartedAtRef.current === null) {
          playbackStartedAtRef.current = performance.now();
        }
        // Bkz. dosya başı doc yorumu "Reconnection dilimi" — koşulsuz
        // ekleme (`[...segmentsRef.current, ...newSegments]`) YERİNE
        // `mergeSegments` ile TEKİLLEŞTİRİLMİŞ birleştirme: her yeniden
        // bağlanmanın backend'den getirdiği "yakalama" segmentleri
        // (bkz. `race.gateway.ts`'in `joinSharedPlayback`'i) burada
        // YİNELENMEZ.
        segmentsRef.current = mergeSegments(segmentsRef.current, newSegments);
        setSegments(segmentsRef.current);
      },
      onFinished: (entrants) => {
        setIsDisconnected(false);
        finishedRef.current = true;
        setFinishedEntrants(entrants);
      },
      onError: (message) => setErrorMessage(message),
      onConnectError: (message) => setErrorMessage(`Bağlantı hatası: ${message}`),
      onDisconnected: () => setIsDisconnected(true),
    });

    return () => {
      socket.disconnect();
    };
    // NOT: bu repo'nun kök `.eslintrc.cjs`'inde `eslint-plugin-react-hooks`
    // KURULU DEĞİL (bkz. `races/page.tsx` doc yorumundaki AYNI ders) — bu
    // yüzden burada bir `eslint-disable` yorumu YAZILMAZ.
  }, [apiBaseUrl, token, raceId]);

  // Oynatma saati: yarış bitene kadar GERÇEK (wall-clock) zamanla ilerler,
  // bittiğinde son segmentin zaman damgasında DONAR (bkz. dosya başı doc
  // yorumu madde 1). BİLEREK yalnızca `raceId` değiştiğinde YENİDEN
  // BAŞLAR — `segments`/`finishedEntrants` bağımlılığı YOKTUR, aksi halde
  // her yeni segment/telemetri batch'inde `requestAnimationFrame` zinciri
  // gereksiz yere iptal edilip yeniden kurulurdu (`tick()` zaten `Ref`'ler
  // üzerinden EN GÜNCEL veriyi okur, bir React state/prop DEĞİŞİKLİĞİNE
  // ihtiyaç duymaz).
  useEffect(() => {
    const tick = (): void => {
      const now = performance.now();
      if (finishedRef.current) {
        const maxTimestampMs = segmentsRef.current.reduce((max, segment) => Math.max(max, segment.timestampMs), 0);
        currentTimeMsRef.current = maxTimestampMs;
        setCurrentTimeMs(maxTimestampMs);
        // Faz 2 düzeltmesi (bkz. `RaceViewer.tsx`'in AYNI deseni) — yarış
        // bitince throttle penceresini BEKLEMEDEN HUD'u (son sıralama/foto
        // finiş) ANINDA senkronize et.
        lastHudSyncAtRef.current = now;
        setHudTimeMs(maxTimestampMs);
        frameRef.current = null;
        return;
      }
      const startedAt = playbackStartedAtRef.current;
      if (startedAt !== null) {
        const next = now - startedAt;
        currentTimeMsRef.current = next;
        setCurrentTimeMs(next);
        // Faz 2 düzeltmesi (bkz. `RaceViewer.tsx`'in `HUD_SYNC_INTERVAL_MS`
        // doc yorumu) — AYNI throttle deseni burada da uygulanır: `RaceHud`
        // (DOM) her karede DEĞİL, en fazla 10Hz'de bir yeniden render edilir.
        if (now - lastHudSyncAtRef.current >= HUD_SYNC_INTERVAL_MS) {
          lastHudSyncAtRef.current = now;
          setHudTimeMs(next);
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [raceId]);

  const entryIds = useMemo(() => (roster ?? []).map((entrant) => entrant.entryId), [roster]);

  const horseNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entrant of roster ?? []) {
      map[entrant.entryId] = entrant.isBot ? (entrant.botLabel ?? 'Rakip') : (entrant.horseName ?? 'At');
    }
    return map;
  }, [roster]);

  const ownEntryId = useMemo(
    () => (roster ?? []).find((entrant) => entrant.horseId === ownHorseId)?.entryId ?? null,
    [roster, ownHorseId],
  );

  // 3D sahne — HER rAF karesinde (60Hz) günceli kalır (bkz. dosya başı doc
  // yorumu ve `RaceViewer.tsx`'in `HUD_SYNC_INTERVAL_MS` doc yorumu). Bu
  // dosyanın "entryId" kimliği `computeHorseVisualsAt`'in genel `ids`
  // parametresine OPAK bir anahtar olarak geçirilir — bkz. dosya başı doc
  // yorumu madde 3 (`RaceViewer.tsx`'in demo-fixture-özel `horseId ===
  // raceEntryId` varsayımı burada TEKRARLANMAZ).
  const horseVisuals: HorseVisual[] = useMemo(
    () => computeHorseVisualsAt(entryIds, segments, currentTimeMs, turnCount, trackGeometry),
    [entryIds, segments, currentTimeMs, turnCount, trackGeometry],
  );

  // HUD (DOM) — throttle'lı `hudTimeMs`'ten türetilir; minimap DAHİL,
  // `RaceHud`'a giden HİÇBİR türetilmiş veri 60Hz'de YENİLENMEZ.
  const hudHorseVisuals: HorseVisual[] = useMemo(
    () => computeHorseVisualsAt(entryIds, segments, hudTimeMs, turnCount, trackGeometry),
    [entryIds, segments, hudTimeMs, turnCount, trackGeometry],
  );

  const leaderboard = useMemo(
    () => getLiveLeaderboard(segments, entryIds, hudTimeMs),
    [segments, entryIds, hudTimeMs],
  );

  // Photo Finish sunumu (Master Brief §23, bkz. `photo-finish.ts` dosya
  // başı doc yorumu) — CANLI yayında AĞIR ÇEKİM uygulanmaz (`RaceViewer.
  // tsx`'in aksine, bu bileşen sunucunun ZATEN gerçek zamanda gönderdiği
  // telemetriyi oynatır, bkz. dosya başı doc yorumu madde 1 — geriye
  // dönük bir "yavaşlatma" burada ANLAMSIZ/uygulanamaz), yalnızca SONUÇ
  // KARTI. `finalTimeMs`/`finishPosition` `null` olan katılımcılar (DNF —
  // şu an motor bunu üretmiyor ama tip izin verdiği için burada güvenlik
  // amaçlı FİLTRELENİR, UYDURULMAZ) atlanır.
  const finishRows = useMemo(() => {
    if (!finishedEntrants) {
      return [];
    }
    return buildPhotoFinishRows(
      finishedEntrants
        .filter(
          (entrant): entrant is LiveRaceFinishedEntrant & { finishPosition: number; finalTimeMs: number } =>
            entrant.finishPosition !== null && entrant.finalTimeMs !== null,
        )
        .map((entrant) => ({
          horseId: entrant.horseId,
          displayName: entrant.isBot ? (entrant.botLabel ?? 'Rakip') : (entrant.horseName ?? 'At'),
          finishPosition: entrant.finishPosition,
          finishTimeMs: entrant.finalTimeMs,
          performanceScore: entrant.performanceScore,
        })),
    );
  }, [finishedEntrants]);

  const miniMapMarkers: MiniMapMarker[] = useMemo(
    () =>
      hudHorseVisuals.map((horse) => ({
        horseId: horse.horseId,
        isLeader: horse.isLeader,
        ...projectToMiniMap({ x: horse.x, z: horse.z, headingRadians: horse.headingRadians }, trackGeometry),
      })),
    [hudHorseVisuals, trackGeometry],
  );

  const raceDistanceMeters = useMemo(
    () => segments.reduce((max, segment) => Math.max(max, segment.positionMeters), 0),
    [segments],
  );
  const finishLinePoint = useMemo(
    () => getHorseTrackPosition(raceDistanceMeters, turnCount, trackGeometry),
    [raceDistanceMeters, turnCount, trackGeometry],
  );

  const leaderVisual = horseVisuals.find((horse) => horse.isLeader) ?? horseVisuals[0];
  const focusVisual = horseVisuals.find((horse) => horse.horseId === ownEntryId) ?? leaderVisual;

  // Camera Director (Master Development Brief §17, bkz. `camera-director.ts`
  // dosya başı doc yorumu) — `RaceViewer.tsx`'teki AYNI mantık, `isFinished`
  // sinyali burada `finishedEntrants !== null` (canlı yayında `durationMs`
  // gerçek bir yarış süresi DEĞİL, bkz. aşağıdaki `RaceHud`'a geçirilen
  // `durationMs={hudTimeMs}` — bu yüzden zaman yerine gerçek `race.finished`
  // olayı kullanılıyor).
  const isRaceFinished = finishedEntrants !== null;
  const leaderPositionMeters = leaderboard[0]?.positionMeters ?? 0;
  const anyHorseBlocked = useMemo(
    () => isAnyHorseBlockedAtTime(segments, entryIds, hudTimeMs),
    [segments, entryIds, hudTimeMs],
  );
  const manualCameraOverrideRef = useRef(false);
  const lastAutoCameraEventRef = useRef<RaceCameraEvent | null>(null);

  useEffect(() => {
    const cameraDirectorInput = { leaderPositionMeters, raceDistanceMeters, anyHorseBlocked, isFinished: isRaceFinished };
    const currentEvent = classifyRaceCameraEvent(cameraDirectorInput, cameraConfig);
    if (currentEvent !== lastAutoCameraEventRef.current) {
      manualCameraOverrideRef.current = false;
      lastAutoCameraEventRef.current = currentEvent;
    }
    if (!manualCameraOverrideRef.current) {
      setCameraMode(selectAutomaticCameraMode(cameraDirectorInput, cameraConfig));
    }
  }, [leaderPositionMeters, raceDistanceMeters, anyHorseBlocked, isRaceFinished]);

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

  // Faz 2 düzeltmesi (bkz. `RaceViewer.tsx`'in AYNI deseni) — `useCallback`
  // ile SABİT kimlikte, aksi halde her render'da YENİ bir fonksiyon
  // referansı `RaceHud`'un (bkz. `memo()` sarmalayıcısı) sığ prop
  // karşılaştırmasını KIRAR.
  const handleChangeCameraMode = useCallback((mode: CameraMode) => {
    manualCameraOverrideRef.current = true;
    setCameraMode(mode);
  }, []);

  if (errorMessage) {
    return <ScenePlaceholder text={errorMessage} isError />;
  }

  if (!roster) {
    return <ScenePlaceholder text="Canlı yarışa bağlanılıyor…" />;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '480px' }}>
      <RaceScene3D horses={horseVisuals} cameraPose={cameraPose} trackGeometry={trackGeometry} />
      <RaceHud
        horseNamesById={horseNamesById}
        leaderboard={leaderboard}
        miniMapMarkers={miniMapMarkers}
        currentTimeMs={hudTimeMs}
        durationMs={hudTimeMs}
        isPlaying
        speedMultiplier={1}
        cameraMode={cameraMode}
        finishResult={isRaceFinished ? finishRows : undefined}
        onTogglePlay={NOOP_TOGGLE_PLAY}
        onChangeSpeedMultiplier={NOOP_CHANGE_SPEED_MULTIPLIER}
        onChangeCameraMode={handleChangeCameraMode}
        onSeek={NOOP_SEEK}
        liveStatus={finishedEntrants ? 'finished' : isDisconnected ? 'reconnecting' : 'live'}
      />
    </div>
  );
}

function ScenePlaceholder({ text, isError = false }: { text: string; isError?: boolean }): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: '480px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isError ? 'var(--color-status-critical)' : 'var(--color-text-muted)',
        background: 'var(--color-bg-base)',
        textAlign: 'center',
        padding: 'var(--space-lg)',
      }}
    >
      {text}
    </div>
  );
}
