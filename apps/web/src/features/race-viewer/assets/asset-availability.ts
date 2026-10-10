/**
 * VARLIK DURUM RAPORU (10.10.2026) — saf; React ve Node içe aktarmaz (hem
 * istemci `asset-pipeline.ts` hem sunucu rota işleyicisi
 * `app/asset-availability/route.ts` kullanır).
 */

/** `public/`e göreli manifest yolunu URL'ye çevirir. */
export function assetUrl(expectedPath: string): string {
  return `/${expectedPath.replace(/^\/+/, '')}`;
}

/**
 * 10.10.2026 — manifest varlıklarının durumu TEK istekle gelir
 * (`app/asset-availability/route.ts`, sunucu `public/`e bakar). Eskiden her
 * eksik dosya için bir HEAD isteği atılıyor ve tarayıcı konsolu her sayfada
 * "404 Failed to load resource" ile doluyordu.
 */
export const ASSET_AVAILABILITY_URL = '/asset-availability';

export interface AssetAvailabilityReport {
  /** Sunucunun baktığı manifest yolları (`public/`e göreli). */
  checked: string[];
  /** Bunlardan dosyası bulunanlar. */
  available: string[];
}

/** Yanıtı doğrular; bozuksa `null` (çağıran HEAD yoklamasına döner). */
export function parseAssetAvailability(body: unknown): { checked: Set<string>; available: Set<string> } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { checked, available } = body as Partial<AssetAvailabilityReport>;
  if (!Array.isArray(checked) || !Array.isArray(available)) return null;
  const urls = (list: unknown[]) =>
    new Set(list.filter((item): item is string => typeof item === 'string').map(assetUrl));
  return { checked: urls(checked), available: urls(available) };
}

/** Sunucu tarafı rapor (rota işleyici): yollar tekilleştirilir, sıra korunur. */
export async function buildAssetAvailabilityReport(
  paths: readonly string[],
  exists: (relativePath: string) => Promise<boolean>,
): Promise<AssetAvailabilityReport> {
  const checked = [...new Set(paths.map((item) => item.replace(/^\/+/, '')))];
  const present = await Promise.all(checked.map((item) => exists(item)));
  return { checked, available: checked.filter((_, index) => present[index]) };
}
