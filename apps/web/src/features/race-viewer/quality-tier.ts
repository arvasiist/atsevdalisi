/**
 * FAZ 4 (Görsel Kalite — kalite kademeleri), İLK DİLİM — brief'in
 * `claude/hardening-realism-master-plan.md` §46 "3D PERFORMANCE" bölümü:
 * "Mobile: Low/Medium/High. Desktop: Medium/High/Ultra." Bu dosya, bir
 * cihazın hangi kademeye ait olduğunu (`classifyQualityTier`) ve o
 * kademede `RaceScene3D.tsx`'in HANGİ ağır özellikleri (IBL/`Environment`,
 * Bloom, SSAO, gölgeler, piksel oranı tavanı) açması gerektiğini
 * (`getQualityTierRenderSettings`) belirleyen SAF (framework'ten bağımsız)
 * mantıktır — `live-race-url.ts`/`segment-merge.ts` ile AYNI "saf mantığı
 * ayır" deseni: `navigator`/`window` okuma (tarayıcıya özgü, DOM'a bağımlı)
 * KASITLI OLARAK BURADA DEĞİL, `RaceScene3D.tsx`'teki ince `detectQualityTier`
 * sarmalayıcısındadır — bu sayede BU dosya `apps/web/tsconfig.logic.json`'a
 * dahil edilip bu sandbox'ta GERÇEKTEN `tsc --noEmit` + `tsx` ile
 * doğrulanabilir (`tsconfig.base.json`'ın `lib`i yalnızca `ES2022`'dir,
 * DOM YOKTUR — bu yüzden `Navigator`/`Window` gibi DOM tipleri bu dosyada
 * KULLANILAMAZ, girdi saf `boolean`/`number` alanlarına indirgenmiştir).
 *
 * ## Kapsam kararı (bu dilim) — §46'nın hangi parçaları burada, hangileri DEĞİL
 *
 * Master Plan §46 şunları listeler: "LOD, instancing, texture compression,
 * lazy loading, animation pooling, frustum culling, shadow tiers, mobile
 * quality presets." Bunlardan:
 * - **Instancing**: ZATEN TAMAMLANDI (Görsel Kalite Faz 1 — `TrackSurface`
 *   tek `THREE.InstancedMesh`, bkz. `RaceScene3D.tsx` başlık yorumu).
 * - **Lazy loading**: ZATEN TAMAMLANDI (Faz 6 — `RaceViewer.tsx`'te
 *   `next/dynamic({ssr:false})`).
 * - **Frustum culling**: three.js'in `Object3D.frustumCulled` varsayılanı
 *   ZATEN AÇIKTIR — bu sahnede elle EKLENECEK bir şey YOKTUR (basit
 *   şekillerden oluşan küçük bir sahnede özel bir culling stratejisi
 *   gerektirecek karmaşıklık da yok).
 * - **Shadow tiers + mobile quality presets**: BU DİLİMİN KONUSU —
 *   `getQualityTierRenderSettings` bunu sağlar.
 * - **LOD** (Level of Detail — mesafeye göre model detay azaltma) ve
 *   **texture compression**: KASITLI OLARAK KAPSAM DIŞI — ikisi de gerçek
 *   3D at/jokey modelleri VE dokuları (texture) gerektirir; şu an sahnede
 *   ne model (`HorseMarker` kapsül+küre, Faz 6 kapsam kararı) ne de doku
 *   (yalnızca düz `meshStandardMaterial` renkleri) VAR — uygulanacak bir
 *   şey yok, bu Faz 3'ün (asset satın alma kararı bekliyor) doğal
 *   uzantısıdır.
 * - **Animation pooling**: KASITLI OLARAK KAPSAM DIŞI — henüz bir
 *   animasyon sistemi (iskelet/keyframe) YOK, `HorseMarker` yalnızca bir
 *   `useFrame` sinüs "bob" efekti kullanıyor; havuzlanacak bir animasyon
 *   YOK.
 * - **4/8/12/16 at benchmark ölçümü**: KASITLI OLARAK KAPSAM DIŞI — gerçek
 *   FPS ölçümü gerçek bir tarayıcı+GPU gerektirir, bu sandbox'ta YAPILAMAZ
 *   (bkz. `docs/ARCHITECTURE.md` §9); manuel görsel QA proje sahibine
 *   bırakılmıştır.
 */

/** Master Plan §46'daki dört kademe — mobil YALNIZCA 'low'/'medium'/'high', masaüstü YALNIZCA 'medium'/'high'/'ultra' döner ('low' asla masaüstüne, 'ultra' asla mobile atanmaz). */
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityTierClassificationInput {
  /** `RaceScene3D.tsx`'teki `detectQualityTier`, `navigator.userAgent`'ı bir mobil-cihaz düzenli ifadesiyle test ederek bunu üretir. */
  isMobileUserAgent: boolean;
  /**
   * `navigator.hardwareConcurrency` (CPU çekirdek/iş parçacığı sayısı) —
   * GPU gücünün doğrudan bir ölçüsü DEĞİLDİR, ama tarayıcının güvenlik
   * gerekçesiyle sunduğu, ek bir izin/API gerektirmeyen TEK evrensel
   * donanım sinyalidir (WebGL `EXT_disjoint_timer_query`/GPU bilgisi
   * çıkarımı bu dilimin kapsamı dışında bırakılmıştır — gereksiz karmaşıklık).
   * Tarayıcı desteklemiyorsa (0 veya `undefined`) çağıran taraf 0 geçer,
   * bu fonksiyon `UNKNOWN_CORE_COUNT_FALLBACK`'e döner.
   */
  hardwareConcurrencyCores: number;
}

const MOBILE_LOW_MAX_CORES = 4;
const MOBILE_MEDIUM_MAX_CORES = 6;
const DESKTOP_MEDIUM_MAX_CORES = 4;
const DESKTOP_HIGH_MAX_CORES = 8;
/** `hardwareConcurrencyCores <= 0` (tarayıcı API'yi desteklemiyor/gizliyor) durumunda kullanılan güvenli orta-seviye varsayım — ne en düşük ne en yüksek kademeye aşırı iyimser/kötümser bir tahminle atamamak için. */
const UNKNOWN_CORE_COUNT_FALLBACK = 4;

/**
 * Bir cihazı, iki basit sinyalden (mobil mi, kaç çekirdek) Master Plan
 * §46'nın dört kademesinden birine sınıflandırır. Mobil bir cihaz ASLA
 * 'ultra' alamaz, masaüstü bir cihaz ASLA 'low' almaz — bu, §46'nın
 * "Mobile: Low/Medium/High. Desktop: Medium/High/Ultra." ifadesinin
 * BİREBİR karşılığıdır.
 */
export function classifyQualityTier(input: QualityTierClassificationInput): QualityTier {
  const cores = input.hardwareConcurrencyCores > 0 ? input.hardwareConcurrencyCores : UNKNOWN_CORE_COUNT_FALLBACK;

  if (input.isMobileUserAgent) {
    if (cores <= MOBILE_LOW_MAX_CORES) {
      return 'low';
    }
    if (cores <= MOBILE_MEDIUM_MAX_CORES) {
      return 'medium';
    }
    return 'high';
  }

  if (cores <= DESKTOP_MEDIUM_MAX_CORES) {
    return 'medium';
  }
  if (cores <= DESKTOP_HIGH_MAX_CORES) {
    return 'high';
  }
  return 'ultra';
}

export interface QualityTierRenderSettings {
  tier: QualityTier;
  /** `<Environment preset="sunset">` (IBL/yansıma) açık mı — kapalıysa `RaceScene3D.tsx` Faz 1 ÖNCESİ düz `<ambientLight>`'a geri döner (bkz. o dosyanın doc yorumu). */
  environmentEnabled: boolean;
  /** `@react-three/postprocessing` `<Bloom>` açık mı. */
  bloomEnabled: boolean;
  /** `@react-three/postprocessing` `<SSAO>` açık mı — üçü içinde EN pahalı post-processing geçişi olduğundan yalnızca 'ultra'da açık. */
  ssaoEnabled: boolean;
  /** `<Canvas shadows>` + `directionalLight castShadow` açık mı. */
  shadowsEnabled: boolean;
  /** `directionalLight`'ın `shadow-mapSize` değeri (kare, piksel cinsinden kenar uzunluğu) — `shadowsEnabled=false` iken anlamsızdır. */
  shadowMapSize: number;
  /** `<Canvas dpr={[1, pixelRatioCap]}>` üst sınırı — yüksek DPR'li (retina/mobil) ekranlarda GPU'yu gereksiz yere doldurmamak için. */
  pixelRatioCap: number;
}

const QUALITY_TIER_RENDER_SETTINGS: Record<QualityTier, Omit<QualityTierRenderSettings, 'tier'>> = {
  low: {
    environmentEnabled: false,
    bloomEnabled: false,
    ssaoEnabled: false,
    shadowsEnabled: false,
    shadowMapSize: 512,
    pixelRatioCap: 1,
  },
  medium: {
    environmentEnabled: true,
    bloomEnabled: false,
    ssaoEnabled: false,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    pixelRatioCap: 1.5,
  },
  high: {
    environmentEnabled: true,
    bloomEnabled: true,
    ssaoEnabled: false,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    pixelRatioCap: 2,
  },
  // Faz 1'de sabit kodlanmış ÖNCEKİ (kademe kavramı olmadan önceki) davranışın
  // BİREBİR aynısı — bu yüzden yüksek çekirdek sayılı bir masaüstünde
  // (varsayılan sınıflandırma sonucu) görsel deneyim ÖNCEKİYLE AYNI kalır,
  // hiçbir geriye dönük görsel regresyon YOKTUR.
  ultra: {
    environmentEnabled: true,
    bloomEnabled: true,
    ssaoEnabled: true,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    pixelRatioCap: 2,
  },
};

/** Bir kademe için tam render ayarlarını döner (bkz. `QUALITY_TIER_RENDER_SETTINGS` tablosu). */
export function getQualityTierRenderSettings(tier: QualityTier): QualityTierRenderSettings {
  return { tier, ...QUALITY_TIER_RENDER_SETTINGS[tier] };
}
