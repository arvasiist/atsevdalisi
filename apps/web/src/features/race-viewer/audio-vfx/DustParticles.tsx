'use client';

/**
 * Master Development Brief §31 "VFX — toz efekti" — `dust-particle-sim.ts`'in
 * SAF simülasyon fonksiyonlarını three.js'in `<points>` (`BufferGeometry`)
 * ilkeline BAĞLAYAN render katmanı. Brief'in KENDİ önerisi ("three.js'in
 * kendi ilkel Points/instanced parçacık sistemi, DOKU GEREKTİRMEZ") burada
 * TAM olarak uygulanır — `map`/`texture` prop'u YOKTUR.
 *
 * ÖNEMLİ — neden `<pointsMaterial>` YERİNE özel bir `<shaderMaterial>`
 * kullanılıyor: her parçacığın KENDİ opaklığı (`getDustParticleOpacity`,
 * yaşına göre solma) VARDIR, ama three.js'in HAZIR `PointsMaterial`'ı
 * SADECE TEK bir global `opacity` değeri kabul eder — vertex-başına
 * opaklık (`vertexColors` bile SADECE RGB'yi etkiler, alfa'yı DEĞİL)
 * DESTEKLEMEZ. Bu yüzden `opacity` bir `BufferAttribute` olarak GEÇİRİLİP
 * basit bir vertex/fragment shader'da OKUNUYOR — three.js'in resmi
 * `webgl_custom_attributes_points` örneğiyle AYNI, standart bir teknik
 * (uydurma/deneysel bir yöntem DEĞİL).
 *
 * `RaceScene3D.tsx`/`live-race-socket.ts` ile AYNI kısıt: bu dosya
 * `@react-three/fiber`'ın `useFrame`'ine bağımlıdır, bu sandbox'ta
 * `three`/`@react-three/fiber` KURULU DEĞİL — yalnızca `ts.transpileModule`
 * ile sözdizimi kontrolü yapılabilir, gerçek doğrulama CI'dadır.
 *
 * Her at için AYRI bir `<DustParticles>` örneği mount edilmesi ÖNERİLİR
 * (`horseId`, parçacık seed'lerinin BENZERSİZLİĞİ için kullanılır) — bkz.
 * `emitterPosition` prop'unun doc yorumu.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  advanceDustParticle,
  getDustParticleOpacity,
  isDustParticleExpired,
  spawnDustParticle,
  type DustParticle,
} from './dust-particle-sim';

/** Bir atın hızına göre saniyede kaç toz parçacığı DOĞACAĞI — sabit, brief'in bir sayı VERMEMESİ nedeniyle burada seçilen makul bir değer (Faz 6 "Config ayrımı"na taşınabilir). */
const SPAWN_RATE_PER_SECOND = 12;
/** Aynı anda ekranda tutulacak AZAMİ parçacık sayısı — sınırsız büyümeyi ÖNLER (bellek/performans güvencesi). */
const MAX_ACTIVE_PARTICLES = 40;
const PARTICLE_COLOR = new THREE.Color('#c9b28a'); // Toprak/toz rengi.

/**
 * Standart three.js "point sprite" boyutlandırma formülü (bkz. resmi
 * `webgl_custom_attributes_points` örneği) — perspektife göre uzaktaki
 * parçacıklar KÜÇÜK, yakındakiler BÜYÜK görünür. `uSizeScale`, `size`
 * uniform'unun piksel karşılığını belirleyen sabit bir ölçek faktörüdür.
 */
const DUST_VERTEX_SHADER = `
  attribute float opacity;
  varying float vOpacity;
  uniform float uSize;
  uniform float uSizeScale;
  void main() {
    vOpacity = opacity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * (uSizeScale / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const DUST_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uBaseOpacity;
  varying float vOpacity;
  void main() {
    // Kare nokta yerine YUMUŞAK bir daire — gl_PointCoord, nokta sprite'ı
    // İÇİNDEKİ [0,1] konumdur, merkeze göre uzaklık 0.5'i AŞARSA piksel
    // ATILIR (discard) — doku GEREKTİRMEDEN dairesel bir görünüm sağlar.
    vec2 coord = gl_PointCoord - vec2(0.5);
    if (length(coord) > 0.5) {
      discard;
    }
    gl_FragColor = vec4(uColor, vOpacity * uBaseOpacity);
  }
`;

/**
 * `dust-particle-sim.ts`'in `advanceDustParticle`'ı her çağrıda AYNI
 * `seed`'in verilmesini BEKLER (bkz. o fonksiyonun doc yorumu) — bu
 * yüzden burada, doğduğu andaki seed'i parçacığın YANINDA saklıyoruz.
 * Bu, `DustParticle`'ın KENDİSİNE eklenen bir alan DEĞİLDİR (o tip
 * `dust-particle-sim.ts`'in saf/framework-bağımsız kapsamında kalır) —
 * sadece bu RENDER katmanının kendi iç defterinde tuttuğu bir eşleme.
 */
interface SeededDustParticle {
  particle: DustParticle;
  seed: string;
}

export interface DustParticlesProps {
  /** Parçacık seed'lerinin benzersizliği için (bkz. dosya başı doc yorumu) — genelde `raceEntryId`/`horseId`. */
  horseId: string;
  /** Parçacıkların DOĞACAĞI dünya konumu (atın ayak/nal hizası) — her karede GÜNCELLENMESİ beklenir. */
  emitterPosition: { x: number; z: number };
  /** At hareket ETMİYORSA (yarış duraklatıldı/bitti) toz da DOĞMAMALIDIR — gerçekçilik (brief "çok gerçekçi" ilkesi). */
  isMoving: boolean;
}

export function DustParticles({ horseId, emitterPosition, isMoving }: DustParticlesProps): React.ReactElement {
  const particlesRef = useRef<SeededDustParticle[]>([]);
  const spawnCounterRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_ACTIVE_PARTICLES * 3), 3));
    geo.setAttribute('opacity', new THREE.BufferAttribute(new Float32Array(MAX_ACTIVE_PARTICLES), 1));
    return geo;
  }, []);

  // `uniforms` nesnesi component ömrü boyunca AYNI referans olarak kalır
  // (yeniden oluşturulmaz) — `useFrame` içinde `.value` alanları MUTATE
  // edilir (bkz. aşağıdaki `useFrame`'in `uSize` güncellemesi YOK, sabit
  // kalır), three.js'in `ShaderMaterial` için ÖNERDİĞİ desen budur.
  const uniforms = useMemo(
    () => ({
      uColor: { value: PARTICLE_COLOR },
      uSize: { value: 0.15 },
      uSizeScale: { value: 300 },
      uBaseOpacity: { value: 0.6 },
    }),
    [],
  );

  useFrame((_state, deltaSeconds) => {
    const deltaMs = deltaSeconds * 1000;
    const particles = particlesRef.current;

    // 1) Süresi dolan parçacıkları çıkar.
    const alive = particles.filter((entry) => !isDustParticleExpired(entry.particle));

    // 2) Kalanları ilerlet — HER parçacık doğduğu andaki seed'iyle (bkz.
    //    `SeededDustParticle` doc yorumu) `advanceDustParticle`'a geçirilir,
    //    böylece `dust-particle-sim.ts`'in gerektirdiği "her zaman AYNI
    //    seed" kuralı (deterministik yatay sürüklenme yönü) sağlanır.
    const advanced: SeededDustParticle[] = alive.map((entry) => ({
      particle: advanceDustParticle(entry.particle, deltaMs, entry.seed),
      seed: entry.seed,
    }));

    // 3) Yeni parçacık doğur (sadece at HAREKET EDİYORSA).
    if (isMoving) {
      accumulatedMsRef.current += deltaMs;
      const spawnIntervalMs = 1000 / SPAWN_RATE_PER_SECOND;
      while (accumulatedMsRef.current >= spawnIntervalMs && advanced.length < MAX_ACTIVE_PARTICLES) {
        accumulatedMsRef.current -= spawnIntervalMs;
        spawnCounterRef.current += 1;
        const seed = `${horseId}:${spawnCounterRef.current}`;
        advanced.push({ particle: spawnDustParticle(emitterPosition.x, emitterPosition.z, seed), seed });
      }
    }

    particlesRef.current = advanced;

    // 4) BufferGeometry'yi güncelle.
    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    const opacityAttribute = geometry.getAttribute('opacity') as THREE.BufferAttribute;
    for (let i = 0; i < MAX_ACTIVE_PARTICLES; i += 1) {
      const entry = advanced[i];
      if (entry) {
        const { particle } = entry;
        positionAttribute.setXYZ(i, particle.x, particle.y, particle.z);
        opacityAttribute.setX(i, getDustParticleOpacity(particle));
      } else {
        // Kullanılmayan slot'ları görünmez (opaklık 0) yap — geometriyi
        // her karede YENİDEN ALLOCATE etmek yerine SABİT boyutlu bir
        // buffer'ı yeniden KULLANIYORUZ (performans — brief §46 mobil
        // kademe hedefiyle TUTARLI).
        opacityAttribute.setX(i, 0);
      }
    }
    positionAttribute.needsUpdate = true;
    opacityAttribute.needsUpdate = true;
    geometry.setDrawRange(0, MAX_ACTIVE_PARTICLES);
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={DUST_VERTEX_SHADER}
        fragmentShader={DUST_FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
}
