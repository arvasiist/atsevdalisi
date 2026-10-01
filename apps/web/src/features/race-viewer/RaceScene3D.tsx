'use client';

/**
 * Three.js sahnesi — `docs/ARCHITECTURE.md` §5 "3D/Görsel katman": bu
 * modül SADECE zaten hesaplanmış (Race Engine çıktısı, `RaceTimeline`)
 * pozisyonları render eder, hiçbir simülasyon mantığı içermez
 * (`docs/RACE_ENGINE.md` §1 ilkesi).
 *
 * FAZ 6 kapsamı — "basit şekillerle iskelet" (bkz. proje sahibinin FAZ 6
 * kapsam kararı, bu oturum): gerçek 3D at/jokey modelleri, animasyonlar
 * ve ses BİLİNÇLİ OLARAK bu dosyanın kapsamı DIŞINDADIR (bkz. README.md
 * "Kapsam dışı"). Bunun yerine basit geometrik şekiller (kapsül gövde +
 * küre "jokey" başı) kullanılır; ileride gerçek modeller eklendiğinde
 * (Faz 3, asset kaynağı kararı bekliyor) sadece `HorseMarker` bileşeninin
 * içeriği değişir, `RaceViewer`/`RaceHud` arayüzü aynı kalır.
 *
 * GÜNCELLEME (bu turda) — yukarıdaki kapsam listesinden İKİ madde artık
 * KAPANDI, çünkü ikisi de GERÇEK bir varlık dosyası GEREKTİRMİYOR:
 *   - "seyirci (crowd)" → `CrowdBillboards` (aşağıda, dokusuz düz renkli
 *     billboard halkası — bkz. o bileşenin doc yorumu),
 *   - "hava efektleri (VFX)" → `DustParticles` (`audio-vfx/DustParticles.tsx`,
 *     tamamen prosedürel parçacıklar; brief §31'in KENDİ önerisi olan
 *     "doku GEREKTİRMEZ" ilkesiyle yazılmış).
 * Yani bu ikisi Faz 3'ün asset kararını BEKLEMEDEN bağlanabildi; gerçek
 * modeller/animasyonlar/ses ise hâlâ o karara bağlı.
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
 *
 * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §9 "Tribün/kalabalık" (bu
 * turda EKLENDİ, proje sahibinin "notta eksik bişi kalmasın" talebi
 * üzerine — bu bileşen daha önce `CROWD_BILLBOARD_TEXTURE_REQUIRED`
 * (bkz. `asset-manifest.ts`) için SIFIR render kodu içeriyordu, bu bir
 * ÖZ-DENETİM turunda bulunup açıkça bekletilmiş bir eksikti) — `Crowd
 * Billboards` bileşeni, `TrackSurface` ile AYNI desende (tek `THREE.
 * InstancedMesh`, `track-path.ts`teki YENİ SAF fonksiyon `getOutwardBoundaryPoint`
 * ile hesaplanmış pozisyonlar) pistin ÇEVRESİNE bir tribün billboard
 * halkası yerleştirir. ÖNEMLİ SINIRLAMA: `CROWD_BILLBOARD_TEXTURE_REQUIRED`
 * `ktx2` formatındadır (bkz. o girişin `format` alanı) — GERÇEK bir KTX2
 * yüklemesi `THREE.KTX2Loader` + Basis transcoder dosyaları (normalde
 * `node_modules/three/examples/jsm/libs/basis/`den `public/`e
 * KOPYALANIR) gerektirir; bu sandbox'ta `three` paketi KURULU
 * OLMADIĞINDAN (npm registry erişimi yok) bu transcoder kurulumu NE
 * yazılabilir NE doğrulanabilir — bu yüzden GERÇEK doku yükleme
 * pipeline'ı BİLİNÇLİ OLARAK bu turun kapsamı DIŞINDA bırakıldı (bkz.
 * `docs/ASSET_GUIDE.md`'nin "Bilinçli olarak HENÜZ ele alınmayan"
 * bölümü). Bunun yerine `HorseMarker`in kapsül+küre ilkel şekliyle AYNI
 * disiplin uygulanır: doku OLMADAN, düz renkli (silüet tonlarında) bir
 * malzeme — "tribünde HİÇBİR ŞEY yok" yerine "tribünde KALABALIK VAR ama
 * dokusuz" durumu; gerçek doku/pipeline kararı verildiğinde SADECE bu
 * bileşenin materyali değişir, `RaceScene3DProps` arayüzü DEĞİŞMEZ.
 */

import { Fragment, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, SSAO } from '@react-three/postprocessing';
import * as THREE from 'three';
import { DustParticles } from './audio-vfx/DustParticles';
import { HorseModel } from './HorseModel';
import {
  DirtTrack,
  Grandstand,
  Grass,
  Rails,
  SkyAndLighting,
  TRACK_WIDTH_METERS,
  TrackFurniture,
  TreeLine,
} from './TrackScenery';
import type { StadiumTrackGeometry } from './track-path';
import type { CameraPose } from './camera-presets';
import {
  getQualityTierRenderSettings,
  type QualityTier,
  type QualityTierRenderSettings,
} from './quality-tier';
import { detectQualityTier } from './detect-quality-tier';

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
  /**
   * Oynatma sürüyor mu — `DustParticles`'ın `isMoving` prop'unu besler
   * (bkz. o bileşenin doc yorumu: "at hareket ETMİYORSA toz da
   * DOĞMAMALIDIR"). Yarıçap duraklatıldığında veya yarış bittiğinde
   * `RaceViewer` bunu `false` yapar (`isPlaying` state'i), böylece toz
   * akışı da durur.
   *
   * OPSİYONEL ve varsayılanı `true`'dur: `LiveRaceViewer` (canlı yayın)
   * bu prop'u HİÇ VERMEZ çünkü canlı bir yarışta duraklatma kavramı
   * yoktur — `RaceHud`'a da `isPlaying` sabit `true` geçer. Böylece
   * mevcut çağıran tarafların hiçbiri kırılmaz.
   */
  isPlaying?: boolean;
}

const CAMERA_LERP_FACTOR = 0.06;
/** `CAMERA_LERP_FACTOR`ın ayarlandığı kare hızı. */
const REFERENCE_FPS = 60;
/** Atlar arası yanal şerit aralığı — pist genişliğine sığacak şekilde daraltılır. */
const MAX_LANE_SPACING_METERS = 1.7;
const LANE_MARGIN_METERS = 3;

/**
 * Atlara yanal şerit verir (01.10.2026). Zaman çizelgesi yalnızca pist
 * üzerindeki MESAFEYİ taşır; hepsi merkez çizgide çizilince yakın atlar iç
 * içe geçiyordu. Şerit yalnızca GÖRSELDİR — sonucu, sırayı ya da HUD'u
 * etkilemez (sunucu otoritesi).
 */
function laneOffsetMeters(index: number, count: number): number {
  const spacing = Math.min(
    MAX_LANE_SPACING_METERS,
    (TRACK_WIDTH_METERS - LANE_MARGIN_METERS * 2) / Math.max(1, count - 1),
  );
  return (index - (count - 1) / 2) * spacing;
}

export function RaceScene3D({
  horses,
  cameraPose,
  trackGeometry,
  qualityTierOverride,
  isPlaying = true,
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
  // FAZ 4: `@react-three/postprocessing`'in `<EffectComposer>` bileşeni
  // `children`'ı `Effect` elemanlarından oluşan bir DİZİ/tekil eleman
  // olarak bekliyor — `{koşul ? <SSAO/> : null}` deseni (bu dosyanın
  // başka yerlerinde, ör. `HorseMarker`'daki lider konisi, sorunsuz
  // çalışan genel bir React deseni) BURADA `tsc`'nin GERÇEK bir tip
  // hatası vermesine yol açtı (CI'da yakalandı: "Type 'Element | null'
  // is not assignable to type 'Element'.") — `EffectComposer`'ın kendi
  // tipi, SSAO/Bloom kütüphanesinin dokümantasyonunun aksine, `null`
  // içeren bir children'ı KABUL ETMİYOR. Çözüm: `null` HİÇ üretmeyen,
  // yalnızca gerçek `Effect` elemanlarından oluşan bir dizi önceden
  // (JSX DIŞINDA) inşa edilir — `@react-three/postprocessing`'in kendi
  // dokümantasyonunun önerdiği "dinamik efekt dizisi" deseni budur.
  const effects: React.ReactElement[] = [];
  if (settings.ssaoEnabled) {
    effects.push(
      <SSAO
        key="ssao"
        radius={4}
        intensity={1.5}
        luminanceInfluence={0.6}
        worldDistanceThreshold={20}
        worldDistanceFalloff={5}
        worldProximityThreshold={0.4}
        worldProximityFalloff={0.1}
      />,
    );
  }
  if (settings.bloomEnabled) {
    effects.push(
      <Bloom
        key="bloom"
        luminanceThreshold={0.5}
        luminanceSmoothing={0.9}
        intensity={0.4}
        mipmapBlur
      />,
    );
  }
  const hasPostProcessing = effects.length > 0;

  return (
    <Canvas
      shadows={settings.shadowsEnabled}
      dpr={[1, settings.pixelRatioCap]}
      camera={{ fov: 50, near: 0.5, far: 4000 }}
    >
      <SkyAndLighting
        environmentEnabled={settings.environmentEnabled}
        shadowsEnabled={settings.shadowsEnabled}
        shadowMapSize={settings.shadowMapSize}
      />
      <Grass />
      <DirtTrack geometry={trackGeometry} />
      <Rails geometry={trackGeometry} />
      <Grandstand geometry={trackGeometry} />
      <TrackFurniture geometry={trackGeometry} />
      <TreeLine geometry={trackGeometry} />
      {/*
       * `DustParticles` KASITLI OLARAK atın grubunun İÇİNE DEĞİL, YANINA
       * (kardeş düğüm) konur: parçacıklar DÜNYA koordinatında yazılır; iç
       * içe olsaydı atın grup transform'u parçacıklara ikinci kez uygulanır
       * ve toz yanlış yerde görünürdü.
       */}
      {horses.map((horse, index) => {
        const lane = laneOffsetMeters(index, horses.length);
        // Pist dışına doğru birim normal (heading 0 = +X → dış = -Z).
        const x = horse.x + Math.sin(horse.headingRadians) * lane;
        const z = horse.z - Math.cos(horse.headingRadians) * lane;
        return (
          <Fragment key={horse.horseId}>
            <HorseRig
              horse={horse}
              x={x}
              z={z}
              saddleNumber={index + 1}
              isMoving={isPlaying}
              castShadow={settings.shadowsEnabled}
            />
            <DustParticles
              horseId={horse.horseId}
              emitterPosition={{ x, z }}
              isMoving={isPlaying}
            />
          </Fragment>
        );
      })}
      <CameraRig pose={cameraPose} />
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
       * FAZ 4: `<EffectComposer>`'ın KENDİSİ, hiçbir efekt açık değilken
       * ('low'/'medium' kademeleri) hiç MOUNT EDİLMEZ (bkz.
       * `hasPostProcessing`) — boş bir post-processing geçişinin bile bir
       * maliyeti vardır (ekstra render-to-texture geçişi). İçindeki
       * `effects` dizisi (yukarıda, JSX DIŞINDA inşa edildi) HER ZAMAN
       * yalnızca gerçek `Effect` elemanları içerir, asla `null` DEĞİL —
       * bkz. `effects` değişkeninin doc yorumu.
       */}
      {hasPostProcessing ? <EffectComposer>{effects}</EffectComposer> : null}
    </Canvas>
  );
}

/** Atın dünya konumu + yönü; model `HorseModel.tsx`'tedir. Lider atın üstünde altın bir işaret döner. */
function HorseRig({
  horse,
  x,
  z,
  saddleNumber,
  isMoving,
  castShadow,
}: {
  horse: HorseVisual;
  x: number;
  z: number;
  saddleNumber: number;
  isMoving: boolean;
  castShadow: boolean;
}): React.ReactElement {
  const groupRef = useRef<THREE.Group>(null);
  const markerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (group) {
      group.position.set(x, 0, z);
      group.rotation.y = -horse.headingRadians;
    }
    if (markerRef.current) markerRef.current.rotation.y = clock.elapsedTime * 2;
  });

  return (
    <group ref={groupRef}>
      <HorseModel
        horseId={horse.horseId}
        silkColor={horse.color}
        saddleNumber={saddleNumber}
        isMoving={isMoving}
        castShadow={castShadow}
      />
      {horse.isLeader ? (
        <mesh ref={markerRef} position={[0.3, 3.0, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.22, 0.4, 4]} />
          <meshStandardMaterial
            color="#e8b84a"
            emissive="#e8b84a"
            emissiveIntensity={0.8}
            roughness={0.3}
            metalness={0.5}
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

  useFrame((_, deltaSeconds) => {
    targetPosition.current.set(pose.position.x, pose.position.y, pose.position.z);
    targetLookAt.current.set(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    // Kare hızından bağımsız yumuşatma (01.10.2026): 60 fps'te eski sabit
    // `CAMERA_LERP_FACTOR` ile AYNI sonucu verir; düşük fps'li bir cihazda
    // kamera artık geride kalmaz (eskiden 5 fps'te hedefe ~12 kat yavaş varıyordu).
    const alpha = 1 - Math.pow(1 - CAMERA_LERP_FACTOR, Math.min(deltaSeconds, 1) * REFERENCE_FPS);
    camera.position.lerp(targetPosition.current, alpha);
    currentLookAt.current.lerp(targetLookAt.current, alpha);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}
