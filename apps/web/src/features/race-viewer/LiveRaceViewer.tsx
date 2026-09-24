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
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RaceRosterEntrant, RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';
import {
  DEFAULT_LAP_LENGTH_METERS,
  DEFAULT_TURN_RADIUS_METERS,
  createStadiumTrackGeometry,
  getHorseTrackPosition,
} from './track-path';
import { computeCameraPose, type CameraMode } from './camera-presets';
import { projectToMiniMap } from './minimap-projection';
import { getLiveLeaderboard, interpolateHorseStateAtTime } from './timeline-playback';
import { RaceHud, type MiniMapMarker } from './RaceHud';
import type { HorseVisual } from './RaceScene3D';
import { HORSE_COLORS, HORSE_VISUAL_HEIGHT_METERS } from './RaceViewer';
import { connectRaceSocket, type LiveRaceFinishedEntrant } from './live-race-socket';
import { mergeSegments } from './segment-merge';

const RaceScene3D = dynamic(() => import('./RaceScene3D').then((imported) => imported.RaceScene3D), {
  ssr: false,
  loading: () => <ScenePlaceholder text="Sahne yükleniyor…" />,
});

/**
 * `HORSE_COLORS[index % HORSE_COLORS.length]` matematiksel olarak HER ZAMAN
 * dizinin sınırları içindedir (`%` operatörü bunu garanti eder), ama
 * `noUncheckedIndexedAccess` bunu `string | undefined` olarak tipler. `!`
 * tip zorlaması KULLANILMADAN (bu oturumun `gate-assignment.ts`'teki AYNI
 * prensibi — bkz. `readIndexOrThrow`), gerçek bir çalışma zamanı guard'ı.
 */
function pickHorseColor(index: number): string {
  const color = HORSE_COLORS[index % HORSE_COLORS.length];
  if (color === undefined) {
    throw new Error('pickHorseColor: HORSE_COLORS boş olmamalıydı.');
  }
  return color;
}

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
      if (finishedRef.current) {
        const maxTimestampMs = segmentsRef.current.reduce((max, segment) => Math.max(max, segment.timestampMs), 0);
        setCurrentTimeMs(maxTimestampMs);
        frameRef.current = null;
        return;
      }
      const startedAt = playbackStartedAtRef.current;
      if (startedAt !== null) {
        setCurrentTimeMs(performance.now() - startedAt);
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

  const horseVisuals: HorseVisual[] = useMemo(() => {
    if (entryIds.length === 0) {
      return [];
    }
    const states = entryIds.map((entryId, index) => {
      // `interpolateHorseStateAtTime`'ın ikinci parametresi ADI "raceEntryId"
      // olsa da (bkz. `timeline-playback.ts` imzası) burada TAM OLARAK
      // BEKLENEN kimlik türü geçiriliyor — bkz. dosya başı doc yorumu
      // madde 3.
      const state = interpolateHorseStateAtTime(segments, entryId, currentTimeMs);
      const point = getHorseTrackPosition(state.positionMeters, turnCount, trackGeometry);
      return {
        entryId,
        x: point.x,
        z: point.z,
        headingRadians: point.headingRadians,
        color: pickHorseColor(index),
        positionMeters: state.positionMeters,
      };
    });
    const leaderId = [...states].sort((a, b) => b.positionMeters - a.positionMeters)[0]?.entryId;
    return states.map((state) => ({
      horseId: state.entryId,
      x: state.x,
      z: state.z,
      headingRadians: state.headingRadians,
      color: state.color,
      isLeader: state.entryId === leaderId,
    }));
  }, [entryIds, segments, currentTimeMs, turnCount, trackGeometry]);

  const leaderboard = useMemo(
    () => getLiveLeaderboard(segments, entryIds, currentTimeMs),
    [segments, entryIds, currentTimeMs],
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
        currentTimeMs={currentTimeMs}
        durationMs={currentTimeMs}
        isPlaying
        speedMultiplier={1}
        cameraMode={cameraMode}
        onTogglePlay={() => undefined}
        onChangeSpeedMultiplier={() => undefined}
        onChangeCameraMode={setCameraMode}
        onSeek={() => undefined}
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
