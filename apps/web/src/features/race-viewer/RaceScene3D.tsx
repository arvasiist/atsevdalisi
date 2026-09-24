'use client';

/**
 * Three.js sahnesi — `docs/ARCHITECTURE.md` §5 "3D/Görsel katman": bu
 * modül SADECE zaten hesaplanmış (Race Engine çıktısı, `RaceTimeline`)
 * pozisyonları render eder, hiçbir simülasyon mantığı içermez
 * (`docs/RACE_ENGINE.md` §1 ilkesi).
 *
 * FAZ 6 kapsamı — "basit şekillerle iskelet" (bkz. proje sahibinin FAZ 6
 * kapsam kararı, bu oturum): gerçek 3D at/jokey modelleri, animasyonlar,
 * seyirci (crowd), hava efektleri (VFX) ve ses BİLİNÇLİ OLARAK bu
 * dosyanın kapsamı DIŞINDADIR (bkz. README.md "Kapsam dışı"). Bunun
 * yerine basit geometrik şekiller (kapsül gövde + küre "jokey" başı)
 * kullanılır; ileride gerçek modeller eklendiğinde (Faz 3, asset kaynağı
 * kararı bekliyor) sadece `HorseMarker` bileşeninin içeriği değişir,
 * `RaceViewer`/`RaceHud` arayüzü aynı kalır.
 *
 * FAZ 1 görsel kalite yükseltmesi (proje sahibinin paylaştığı UI mockup'taki
 * "stilize-gerçekçi" yarış ekranı hedefine yönelik, bkz. görsel kalite
 * planı): düz ambient+directional aydınlatma yerine drei `<Environment>`
 * (IBL/yansıma) + korunan yönlü güneş ışığı; materyallere PBR
 * roughness/metalness/envMapIntensity; 96 ayrı `<mesh>` pist karosu yerine
 * tek `THREE.InstancedMesh` (bilinen performans borcu kapatıldı — artık tek
 * draw call); `@react-three/postprocessing` ile Bloom + SSAO. Bunların
 * hiçbiri `HorseVisual`/`RaceScene3DProps` arayüzünü DEĞİŞTİRMEZ.
 *
 * ÖNEMLİ (bkz. `docs/ARCHITECTURE.md` §9): bu dosya `three`,
 * `@react-three/fiber`, `@react-three/drei` ve `@react-three/postprocessing`'e
 * bağımlı olduğu için, bu geliştirme ortamında (npm registry erişimi
 * kısıtlı) YEREL OLARAK derlenip doğrulanamamıştır. Yapısal olarak doğru
 * yazılmıştır; gerçek doğrulama GitHub Actions CI'da (`npm install` +
 * `npm run typecheck`/`build`, tam registry erişimiyle) gerçekleşir.
 *
 * FAZ 4 (kalite kademeleri), İLK DİLİM (bu turda EKLENDİ) — Master Plan
 * §46: yukarıdaki Bloom/SSAO/Environment/2048px gölgeler HER cihazda AYNI
 * ağırlıkta çalışıyordu; düşük donanımlı/mobil bir cihazda bu muhtemelen
 * oynanamaz derecede yavaş olurdu (ölçülemedi, bkz. `quality-tier.ts`
 * "4/8/12/16 at benchmark" kapsam dışı notu). Artık `detectQualityTier`
 * (bu dosyada, AŞAĞIDA — `navigator.userAgent`/`hardwareConcurrency` okur,
 * bu yüzden KASITLI OLARAK saf `quality-tier.ts`'in DIŞINDA, bkz. o
 * dosyanın "saf mantığı ayır" doc yorumu) bir kademe belirler,
 * `getQualityTierRenderSettings` o kademenin hangi özellikleri açacağını
 * döner. Yüksek çekirdekli bir masaüstünde (varsayılan/en yaygın
 * geliştirme/QA cihazı) sonuç 'ultra' kademesidir ve `QUALITY_TIER_RENDER_SETTINGS.ultra`
 * BİLİNÇLİ OLARAK bu değişiklikten ÖNCEKİ sabit değerlerle BİREBİR
 * aynıdır — yani bu dilim mevcut masaüstü görsel deneyimini DEĞİŞTİRMEZ,
 * yalnızca düşük donanımlı cihazlar için bir kaçış yolu EKLER.
 * `qualityTierOverride` prop'u opsiyoneldir (varsayılan: otomatik
 * algılama) — ileride bir ayarlar UI'ı eklendiğinde kullanıcının
 * kademeyi elle seçebilmesi için genişletme noktasıdır, bugün hiçbir
 * çağıran taraf (`RaceViewer.tsx`) bunu VERMEZ.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { Bloom, EffectComposer, SSAO } from '@react-three/postprocessing';
import * as THREE from 'three';
import { getHorseTrackPosition, type StadiumTrackGeometry } from './track-path';
import type { CameraPose } from './camera-presets';
import {
  classifyQualityTier,
  getQualityTierRenderSettings,
  type QualityTier,
  type QualityTierRenderSettings,
} from './quality-tier';

export interface HorseVisual {
  horseId: string;
  x: number;
  z: number;
  headingRadians: number;
  color: string;
  isLeader: boolean;
}

export interface RaceScene3DProps {
  horses: HorseVisual[];
  cameraPose: CameraPose;
  trackGeometry: StadiumTrackGeometry;
  /** Bkz. dosya başı doc yorumu "FAZ 4 (kalite kademeleri)". Verilmezse `detectQualityTier()` ile otomatik algılanır. */
  qualityTierOverride?: QualityTier;
}

/**
 * `navigator.userAgent`'ta yaygın mobil işletim sistemi/tarayıcı
 * imzalarını arar (Android telefon/tablet, iOS'un TÜM cihazları —
 * `iPhone`/`iPad`/`iPod`, ve daha az yaygın `Windows Phone`). Tablet/
 * masaüstü ayrımı GEREKMİYOR — Master Plan §46 yalnızca "Mobile" ile
 * "Desktop" ikilisini ayırıyor, `classifyQualityTier`'ın kendisi zaten
 * çekirdek sayısına göre bir mobil cihazı 'low'dan 'high'a kadar
 * kademeleyebiliyor (bkz. o dosyanın doc yorumu).
 */
const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod|Windows Phone/i;

/**
 * `quality-tier.ts`'in saf `classifyQualityTier`'ını GERÇEK tarayıcı
 * sinyalleriyle besleyen ince, KASITLI OLARAK saf OLMAYAN sarmalayıcı —
 * bu dosyanın zaten `docs/ARCHITECTURE.md` §9 gereği yalnızca CI'da
 * doğrulanabildiğinden, `navigator` okuması buraya, `quality-tier.ts`'i
 * (ve onun bu sandbox'taki GERÇEK `tsc`/`tsx` doğrulamasını) DOM'a
 * bağımlı KILMADAN eklendi.
 */
function detectQualityTier(): QualityTier {
  if (typeof navigator === 'undefined') {
    // SSR sırasında teorik olarak çağrılabilir (pratikte çağrılmaz, bkz.
    // `RaceViewer.tsx`'teki `next/dynamic({ssr:false})`) — güvenli bir
    // orta-üst varsayım, tarayıcıda GERÇEK değer HER ZAMAN client-side
    // mount sonrası hesaplanır.
    return 'high';
  }
  const isMobileUserAgent = MOBILE_USER_AGENT_PATTERN.test(navigator.userAgent);
  const hardwareConcurrencyCores =
    typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 0;
  return classifyQualityTier({ isMobileUserAgent, hardwareConcurrencyCores });
}

const TRACK_TILE_COUNT = 96;
const TRACK_TILE_WIDTH_METERS = 18;
const TRACK_TILE_LENGTH_METERS = 6;
const TRACK_TURN_COUNT_FOR_VISUAL = 2;
const CAMERA_LERP_FACTOR = 0.06;
const GROUND_SIZE_METERS = 1200;

export function RaceScene3D({
  horses,
  cameraPose,
  trackGeometry,
  qualityTierOverride,
}: RaceScene3DProps): React.ReactElement {
  // `detectQualityTier()` `navigator`'ı okur — mount başına BİR KEZ
  // hesaplanır (bkz. boş bağımlılık dizisi), oturum ortasında cihaz
  // değişmez varsayımıyla; `qualityTierOverride` verilmişse (bugün hiçbir
  // çağıran taraf vermiyor, bkz. `RaceScene3DProps` doc yorumu) algılama
  // hiç ÇALIŞTIRILMAZ.
  const settings: QualityTierRenderSettings = useMemo(
    () => getQualityTierRenderSettings(qualityTierOverride ?? detectQualityTier()),
    [qualityTierOverride],
  );
  const hasPostProcessing = settings.bloomEnabled || settings.ssaoEnabled;

  return (
    <Canvas shadows={settings.shadowsEnabled} dpr={[1, settings.pixelRatioCap]} camera={{ fov: 50, near: 0.5, far: 2000 }}>
      <color attach="background" args={['#0b1220']} />
      {settings.environmentEnabled ? (
        // Gün batımı/hipodrom atmosferi için IBL — eski düz ambientLight'ın yerini alır
        <Environment preset="sunset" background={false} />
      ) : (
        // FAZ 4: `environmentEnabled=false` olan kademelerde ('low') IBL
        // hiç hesaplanmaz — sahne aydınlatmasız KALMASIN diye Faz 1
        // ÖNCESİNDEKİ (bkz. yukarıdaki eski yorum) düz ambient ışığa
        // geri dönülür; bu, `envMapIntensity` içeren materyalleri
        // BOZMAZ (ortam haritası yoksa bu alan sessizce etkisizdir),
        // yalnızca yansıma/IBL katkısı olmaz.
        <ambientLight intensity={0.7} color="#c9d6e8" />
      )}
      <directionalLight
        position={[80, 120, 40]}
        intensity={1.4}
        color="#fff1d6"
        castShadow={settings.shadowsEnabled}
        shadow-mapSize={[settings.shadowMapSize, settings.shadowMapSize]}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
      />
      <Ground />
      <TrackSurface geometry={trackGeometry} />
      {horses.map((horse) => (
        <HorseMarker key={horse.horseId} horse={horse} />
      ))}
      <CameraRig pose={cameraPose} />
      {hasPostProcessing ? (
        <EffectComposer>
          {/*
           * NOT: `@react-three/postprocessing`'in kurulu sürümündeki SSAO
           * bileşeninin TypeScript tipinde `worldDistanceThreshold` /
           * `worldDistanceFalloff` / `worldProximityThreshold` /
           * `worldProximityFalloff` alanları ZORUNLU görünüyor (üst akış
           * kütüphanesinin dokümantasyonu bunları opsiyonel gösterse de) —
           * bu, ilk CI çalıştırmasında `tsc` hatasıyla yakalandı. Değerler,
           * benzer ölçekli (onlarca metre) bir sahne için bilinen çalışan bir
           * örnekten alındı (pmndrs/postprocessing #441).
           *
           * FAZ 4: `<EffectComposer>`'ın KENDİSİ, hiçbir efekt açık
           * değilken ('low'/'medium' kademeleri) hiç MOUNT EDİLMEZ (bkz.
           * `hasPostProcessing`) — boş bir post-processing geçişinin bile
           * bir maliyeti vardır (ekstra render-to-texture geçişi),
           * `EffectComposer`'ı içi boş bırakmak yerine tamamen atlamak
           * bunu da ORTADAN KALDIRIR. `<SSAO>`/`<Bloom>` de kendi
           * içlerinde AYRI AYRI koşulludur (birbirinden bağımsız iki
           * kademe eşiği, bkz. `quality-tier.ts` tablosu).
           */}
          {settings.ssaoEnabled ? (
            <SSAO
              radius={4}
              intensity={1.5}
              luminanceInfluence={0.6}
              worldDistanceThreshold={20}
              worldDistanceFalloff={5}
              worldProximityThreshold={0.4}
              worldProximityFalloff={0.1}
            />
          ) : null}
          {settings.bloomEnabled ? (
            <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} intensity={0.4} mipmapBlur />
          ) : null}
        </EffectComposer>
      ) : null}
    </Canvas>
  );
}

function Ground(): React.ReactElement {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <planeGeometry args={[GROUND_SIZE_METERS, GROUND_SIZE_METERS]} />
      <meshStandardMaterial color="#1c3a24" roughness={0.85} metalness={0.02} envMapIntensity={0.6} />
    </mesh>
  );
}

/**
 * Pist yüzeyi — daha önce `TRACK_TILE_COUNT` (96) kadar ayrı `<mesh>`
 * elemanı olarak (96 ayrı draw call) render ediliyordu; bu bilinen bir
 * performans borcuydu (bkz. görsel kalite planı). Artık tek bir
 * `THREE.InstancedMesh` — geometri/materyal aynı, tile pozisyon/rotasyon
 * hesabı (`getHorseTrackPosition`) DEĞİŞMEDİ, sadece render hedefi
 * (tek draw call) değişti.
 */
function TrackSurface({ geometry }: { geometry: StadiumTrackGeometry }): React.ReactElement | null {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const tiles = useMemo(() => {
    const result: Array<{ x: number; z: number; rotationY: number }> = [];
    if (geometry.lapLengthMeters <= 0) {
      return result;
    }
    for (let i = 0; i < TRACK_TILE_COUNT; i += 1) {
      const distance = (i / TRACK_TILE_COUNT) * geometry.lapLengthMeters;
      const point = getHorseTrackPosition(distance, TRACK_TURN_COUNT_FOR_VISUAL, geometry);
      result.push({ x: point.x, z: point.z, rotationY: -point.headingRadians });
    }
    return result;
  }, [geometry]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || tiles.length === 0) {
      return;
    }
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    tiles.forEach((tile, index) => {
      position.set(tile.x, 0, tile.z);
      euler.set(0, tile.rotationY, 0);
      quaternion.setFromEuler(euler);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles]);

  if (tiles.length === 0) {
    return null;
  }

  return (
    <instancedMesh
      key={tiles.length}
      ref={meshRef}
      args={[undefined, undefined, tiles.length]}
      receiveShadow
    >
      <boxGeometry args={[TRACK_TILE_LENGTH_METERS, 0.05, TRACK_TILE_WIDTH_METERS]} />
      <meshStandardMaterial color="#8a6b45" roughness={0.9} metalness={0.05} envMapIntensity={0.5} />
    </instancedMesh>
  );
}

function HorseMarker({ horse }: { horse: HorseVisual }): React.ReactElement {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const bob = Math.sin(clock.elapsedTime * 6 + horse.x) * 0.05;
    group.position.set(horse.x, 0.55 + bob, horse.z);
    group.rotation.y = -horse.headingRadians;
  });

  return (
    <group ref={groupRef}>
      <mesh castShadow receiveShadow>
        <capsuleGeometry args={[0.35, 1.1, 4, 8]} />
        <meshStandardMaterial color={horse.color} roughness={0.55} metalness={0.05} envMapIntensity={0.8} />
      </mesh>
      <mesh position={[0, 0.75, 0.15]} castShadow receiveShadow>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#f5f7fa" roughness={0.6} metalness={0.03} envMapIntensity={0.8} />
      </mesh>
      {horse.isLeader ? (
        <mesh position={[0, 1.3, 0]}>
          <coneGeometry args={[0.15, 0.3, 8]} />
          <meshStandardMaterial
            color="#e3b341"
            emissive="#e3b341"
            emissiveIntensity={0.6}
            roughness={0.3}
            metalness={0.4}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function CameraRig({ pose }: { pose: CameraPose }): null {
  const { camera } = useThree();
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const currentLookAt = useRef(new THREE.Vector3());

  useFrame(() => {
    targetPosition.current.set(pose.position.x, pose.position.y, pose.position.z);
    targetLookAt.current.set(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    camera.position.lerp(targetPosition.current, CAMERA_LERP_FACTOR);
    currentLookAt.current.lerp(targetLookAt.current, CAMERA_LERP_FACTOR);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}
