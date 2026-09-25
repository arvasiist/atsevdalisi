/**
 * Master Development Brief §31 "VFX — toz efekti" (bu turda EKLENDİ) —
 * atların ayaklarının altından kalkan toz parçacıklarının SAF simülasyon
 * matematiği. Brief'in kendi önerisi ("three.js'in kendi ilkel Points/
 * instanced parçacık sistemi, DOKU GEREKTİRMEZ") burada TAM olarak
 * uygulanır — bu dosya three.js'e HİÇ dokunmaz, sadece parçacıkların
 * konum/yaş/opaklık HESABINI yapar. Gerçek render (`DustParticles.tsx`,
 * aynı klasör) bu SAF fonksiyonları `<points>`/`BufferGeometry`'ye
 * bağlayan İNCE bir katmandır — `track-path.ts`'in geometri hesabı ile
 * `RaceScene3D.tsx`'in onu render etmesi arasındaki AYNI ayrım.
 *
 * Determinizm: Race Engine'in KENDİ kuralına (`docs/RACE_ENGINE.md` §7,
 * `deterministic-random.ts`) UYGUN olarak `Math.random()` KULLANILMAZ —
 * `@at-sevdalisi/shared-types`'ın ZATEN VAR OLAN `createSeededRandom`'ı
 * kullanılır. Bu, saf görsel bir efekt için mutlak GEREKLİ değildir (yarış
 * sonucunu ETKİLEMEZ) ama (a) bu sandbox'ta GERÇEKTEN test edilebilir
 * olmasını sağlar (aynı seed → aynı parçacık dizisi → `toEqual` ile
 * doğrulanabilir), (b) projenin geri kalanıyla TUTARLI tek bir rastgelelik
 * kaynağı kullanır — yeni bir `Math.random()` kullanımı İCAT EDİLMEZ.
 */

import { createSeededRandom, seededRange } from '@at-sevdalisi/shared-types';

export interface DustParticle {
  /** Doğduğu andaki dünya koordinatı (at o anda neredeyse orası) — parçacık zamanla bu noktadan UZAKLAŞIR (bkz. `advanceDustParticle`). */
  originX: number;
  originZ: number;
  /** Mevcut konum (başlangıçta origin'le AYNI, `advanceDustParticle` ile güncellenir). */
  x: number;
  y: number;
  z: number;
  ageMs: number;
  lifetimeMs: number;
}

/** Saniyede yükseklik artışı (m/s) — hafif bir "kalkıp havada asılı kalma" hissi, gerçek fizik simülasyonu DEĞİL (brief bunu istemiyor, sadece görsel bir ipucu). */
const RISE_SPEED_MPS = 0.6;
/** Parçacığın orijinden yatayda ne kadar UZAKLAŞABİLECEĞİ (metre) — atın arkasında dağılan bir toz bulutu izlenimi. */
const MAX_HORIZONTAL_DRIFT_METERS = 0.4;
const MIN_LIFETIME_MS = 400;
const MAX_LIFETIME_MS = 900;

/**
 * `seed` aynıysa dönen parçacık BİREBİR aynıdır (determinizm garantisi,
 * bkz. dosya başı doc yorumu). Çağıran taraf (bkz. `DustParticles.tsx`)
 * her yeni parçacık için `${horseId}:${spawnIndex}` gibi BENZERSİZ bir
 * seed üretir — aksi halde TÜM parçacıklar birbirinin AYNISI olurdu.
 */
export function spawnDustParticle(originX: number, originZ: number, seed: string): DustParticle {
  // `angle`/`driftMeters` doğum anında HENÜZ hesaplanmaz — `advanceDustParticle`
  // AYNI `seed`'den KENDİ `rng` örneğini oluşturup bunları TÜRETİR (tek
  // kaynak: seed + yaş, iki ayrı yerde SAKLANAN/SENKRONİZE edilmesi
  // gereken bir açı/mesafe DEĞİL). Burada sadece ömür (`lifetimeMs`)
  // belirlenir — bu, parçacığın DOĞUŞUNDA sabitlenen tek gerçek durumdur.
  const rng = createSeededRandom(seed);
  const lifetimeMs = seededRange(rng, MIN_LIFETIME_MS, MAX_LIFETIME_MS);
  return {
    originX,
    originZ,
    x: originX,
    y: 0,
    z: originZ,
    ageMs: 0,
    lifetimeMs,
  };
}

/**
 * `spawnDustParticle`'ın `x`/`z`'yi doğum anında `origin`e EŞİT bırakmasının
 * nedeni: yatay sürüklenme YÖNÜ/mesafesi (`angle`/`driftMeters`) burada,
 * her çağrıda AYNI `seed`'den YENİDEN türetilir (mulberry32 deterministik
 * olduğundan aynı seed HER ZAMAN aynı ilk iki `seededRange` değerini
 * üretir) — bu yüzden `spawnDustParticle`'ın bunları AYRICA hesaplayıp
 * `DustParticle`'a bir alan olarak EKLEMESİNE gerek YOKTUR (tek kaynak:
 * seed'in kendisi, iki fonksiyon arasında SENKRONİZE edilmesi gereken
 * ekstra bir durum yok). ÖNEMLİ: çağıran taraf (`DustParticles.tsx`) bir
 * parçacığın TÜM `advanceDustParticle` çağrılarında AYNI `seed`'i
 * geçirmelidir — aksi halde parçacık her karede FARKLI bir yöne sürüklenir.
 */
export function advanceDustParticle(particle: DustParticle, deltaMs: number, seed: string): DustParticle {
  const nextAgeMs = particle.ageMs + deltaMs;
  const rng = createSeededRandom(seed);
  const angle = seededRange(rng, 0, Math.PI * 2);
  const driftMeters = seededRange(rng, 0, MAX_HORIZONTAL_DRIFT_METERS);
  const progress = Math.min(1, nextAgeMs / particle.lifetimeMs);
  return {
    ...particle,
    ageMs: nextAgeMs,
    x: particle.originX + Math.cos(angle) * driftMeters * progress,
    z: particle.originZ + Math.sin(angle) * driftMeters * progress,
    y: (nextAgeMs / 1000) * RISE_SPEED_MPS,
  };
}

/** `true` dönerse çağıran taraf bu parçacığı LİSTEDEN ÇIKARMALIDIR (bkz. `DustParticles.tsx`). */
export function isDustParticleExpired(particle: DustParticle): boolean {
  return particle.ageMs >= particle.lifetimeMs;
}

/**
 * Brief §31'in "toz zamanla solur" isteği — [0 (yeni doğdu, tam opak), 1
 * (ömrünü tamamladı, tam saydam)] ARASINDA DOĞRUSAL bir opaklık ÇARPANI
 * DEĞİL, `1 - opacity` döner (yani DOĞRUDAN `material.opacity`'ye
 * verilebilecek bir değer: 1 = tam görünür, 0 = tam saydam).
 */
export function getDustParticleOpacity(particle: DustParticle): number {
  const progress = Math.max(0, Math.min(1, particle.ageMs / particle.lifetimeMs));
  return 1 - progress;
}
