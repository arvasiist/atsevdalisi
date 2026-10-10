import { stat } from 'node:fs/promises';
import path from 'node:path';
import { ASSET_MANIFEST } from '../../features/race-viewer/assets/asset-manifest';
import { buildAssetAvailabilityReport } from '../../features/race-viewer/assets/asset-availability';

/**
 * `GET /asset-availability` (10.10.2026) — manifest'teki varlıkların
 * `public/` altında olup olmadığı, TEK yanıtta. İstemci eskiden her eksik
 * dosya için HEAD atıyordu; tarayıcı konsolu her sayfada 404 ile doluyordu.
 *
 * Güvenlik: yalnızca manifest'in SABİT yolları denetlenir — istekten hiçbir
 * girdi yol olarak kullanılmaz; yol `public/` kökünün dışına çıkarsa
 * (manifest hatası) "yok" sayılır. Önbelleğe alınmaz: dosya sonradan
 * konulursa yeniden başlatmadan görülür.
 */
export async function GET(): Promise<Response> {
  const root = path.resolve(process.cwd(), 'public');
  const report = await buildAssetAvailabilityReport(
    ASSET_MANIFEST.map((asset) => asset.expectedPath),
    async (relative) => {
      const absolute = path.resolve(root, relative);
      if (!absolute.startsWith(root + path.sep)) return false;
      try {
        return (await stat(absolute)).isFile();
      } catch {
        return false;
      }
    },
  );
  return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
