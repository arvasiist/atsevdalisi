'use client';

/**
 * Master Development Brief §7/§51 "GLB Loader sarmalayıcısı" (bu turda
 * EKLENDİ) — `asset-manifest.ts`'te tanımlanan bir `AssetRequirement`'ı,
 * drei'nin `useGLTF`'i üzerinden GERÇEKTEN yüklemeye çalışan, dosya
 * `public/` altında YOKSA (veya bozuksa/ağ hatası vb.) `fallback`'e
 * DÜŞEN bir sarmalayıcı bileşen.
 *
 * ÇALIŞMA ŞEKLİ (gerçek React/Three.js davranışı, mock DEĞİL):
 * `useGLTF`, dosya henüz YÜKLENMEMİŞKEN bir Promise FIRLATIR (React
 * Suspense bunu YAKALAR, `fallback` gösterilir) — dosya BULUNAMAZSA
 * (404) veya ayrıştırılamazsa (bozuk GLB) o Promise REDDEDİLİR ve bu bir
 * senkron HATAYA dönüşür; Suspense bunu YAKALAMAZ, bu yüzden bir
 * `GltfErrorBoundary` (class component — `componentDidCatch`, React'ta
 * fonksiyon bileşenlerin YAPAMADIĞI tek şey) EKLENDİ. Sonuç: dosya yoksa
 * SESSİZCE `fallback`'e düşülür, konsola bir UYARI yazılır, sahne ÇÖKMEZ.
 *
 * Bu turda `public/` altına HİÇBİR gerçek `.glb` dosyası KONULMADI
 * (brief'in kendi kuralı: sahte/uydurma asset YOK, Grup 2 kullanıcının
 * "şimdilik erteleyelim" kararıyla ERTELENDİ) — bu yüzden bu bileşenin
 * "gerçek bir GLB'yi başarıyla yükleme" dalı bu oturumda TEST EDİLEMEDİ;
 * yalnızca "dosya yok → fallback'e düş" dalı, `asset-manifest.ts`'in
 * `ASSET_MANIFEST`'indeki HER girişin `status`'unun şu an `'missing'`
 * olmasıyla (bkz. o dosyanın doc yorumu) DOLAYLI olarak doğrulanmıştır.
 * İleride gerçek bir `.glb` dosyası eklendiğinde her iki dal da manuel
 * QA ile (owner tarafından, tarayıcıda) doğrulanmalıdır.
 *
 * `RaceScene3D.tsx`/`live-race-socket.ts` ile AYNI kısıt: `three`,
 * `@react-three/fiber`, `@react-three/drei`, `three-stdlib` bu sandbox'ta
 * KURULU DEĞİL (npm registry erişimi yok) — bu dosya burada `tsc`/gerçek
 * testle doğrulanamaz, yalnızca `ts.transpileModule` ile sözdizimi
 * kontrolü yapılabilir. Gerçek doğrulama GitHub Actions CI'dadır (bkz.
 * `docs/ARCHITECTURE.md` §9).
 */

import { Component, Suspense, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { GLTF, GLTFLoader } from 'three-stdlib';
import { resolveAnimationClips, type AnimationRole, type AssetRequirement } from './asset-manifest';
import {
  DRACO_DECODER_PATH,
  assetUrl,
  getKtx2Loader,
  useAssetAvailability,
} from './asset-pipeline';

interface GltfErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface GltfErrorBoundaryState {
  hasError: boolean;
}

/**
 * `useGLTF`'in dosya-bulunamadı/ayrıştırma-hatası durumunda fırlattığı
 * senkron hatayı yakalayan class component. React'ta hata sınırları
 * (error boundaries) SADECE class component'lerle YAZILABİLİR —
 * `getDerivedStateFromError`/`componentDidCatch` fonksiyon component'lerde
 * bir KARŞILIĞI YOKTUR, bu yüzden burada `useState`/hook TABANLI bir
 * alternatif YAZILMADI (böyle bir şey React'ın kendisinde MEVCUT DEĞİL).
 */
class GltfErrorBoundary extends Component<GltfErrorBoundaryProps, GltfErrorBoundaryState> {
  constructor(props: GltfErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): GltfErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    // eslint-disable-next-line no-console -- brief'in "sessizce çökme" kuralı: hata GÖRÜNÜR olmalı ama sahneyi DURDURMAMALI.
    console.warn("[GltfAssetLoader] Asset yüklenemedi, placeholder'a düşülüyor:", error);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * `useGLTF` çağrısını AYRI bir iç bileşene almamızın nedeni: hook'un
 * fırlattığı Suspense promise'i/hatası ancak bu bileşen RENDER EDİLMEYE
 * ÇALIŞILDIĞINDA (yani `<Suspense>`/`<GltfErrorBoundary>`'nin İÇİNDE)
 * oluşur — hook'u üst bileşende ÇAĞIRMAK, sarmalayıcıların onu
 * YAKALAYAMAMASINA yol açardı.
 */
function GltfScene({
  asset,
  path,
  children,
}: {
  asset: AssetRequirement;
  path: string;
  children: GltfRenderProp;
}): React.ReactElement {
  const gl = useThree((state) => state.gl);
  // 01.10.2026 — Draco çözücüsü YEREL yoldan (CDN değil), Meshopt paketten,
  // KTX2 dokular renderer'a bağlı yerel transcoder ile (asset-pipeline.ts).
  const gltf = useGLTF(path, DRACO_DECODER_PATH, true, (loader) => {
    (loader as unknown as GLTFLoader).setKTX2Loader(getKtx2Loader(gl));
  }) as unknown as GLTF;
  const clips = resolveAnimationClips(
    asset,
    gltf.animations.map((clip) => clip.name),
  );
  return <>{children(gltf, clips)}</>;
}

/** Yüklenen sahne + manifest rollerine eşlenmiş klip adları (eşleşmeyen rol `null`). */
export type GltfRenderProp = (
  gltf: GLTF,
  clips: Partial<Record<AnimationRole, string | null>>,
) => ReactNode;

export interface GltfAssetLoaderProps {
  /** `asset-manifest.ts`'teki `ASSET_MANIFEST` girişlerinden biri. */
  asset: AssetRequirement;
  /** Dosya yoksa, yüklenirken ya da yüklenemezse gösterilecek görsel — ÇAĞIRAN belirler, varsayılan İCAT EDİLMEZ. */
  fallback: ReactNode;
  /** Başarıyla yüklenen GLTF sahnesini (ve eşlenmiş klipleri) Three.js düğümlerine dönüştüren render-prop. */
  children: GltfRenderProp;
}

export function GltfAssetLoader({
  asset,
  fallback,
  children,
}: GltfAssetLoaderProps): React.ReactElement {
  const publicPath = assetUrl(asset.expectedPath);
  // 01.10.2026 — dosya YOKSA yükleme hiç denenmez (404 + konsol uyarısı
  // yerine doğrudan yedek görünüm). Yoklama sürerken de yedek gösterilir.
  const availability = useAssetAvailability(publicPath);
  if (availability !== 'available') {
    return <>{fallback}</>;
  }
  return (
    <GltfErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GltfScene asset={asset} path={publicPath}>
          {children}
        </GltfScene>
      </Suspense>
    </GltfErrorBoundary>
  );
}
