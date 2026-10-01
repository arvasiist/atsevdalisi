// 01.10.2026 — `npm run assets:check`: manifestteki her varlığı `public/`
// altında arar, biçimini doğrular ve sahnede kullanılabilirliğini raporlar.
// `--strict`: mevcut ama GEÇERSİZ bir dosya varsa çıkış kodu 1.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSET_MANIFEST } from '../src/features/race-viewer/assets/asset-manifest';
import { inspectAsset } from '../src/features/race-viewer/assets/asset-inspect';

const publicRoot = join(__dirname, '..', 'public');
const strict = process.argv.includes('--strict');
let present = 0;
let invalid = 0;

for (const asset of ASSET_MANIFEST) {
  const file = join(publicRoot, asset.expectedPath);
  const bytes = existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
  const report = inspectAsset(asset, bytes);
  if (!report.present) {
    console.log(`·  EKSİK      ${asset.id.padEnd(36)} public/${asset.expectedPath}`);
    continue;
  }
  present += 1;
  if (!report.valid) invalid += 1;
  const size = `${(report.bytes / 1048576).toFixed(2)} MB`;
  console.log(`${report.valid ? '✓  GEÇERLİ  ' : '✗  GEÇERSİZ '} ${asset.id.padEnd(36)} ${size}`);
  if (report.glb) {
    console.log(
      `     mesh ${report.glb.meshCount} · iskelet ${report.glb.skinCount} · klipler: ${report.glb.animationNames.join(', ') || 'yok'}`,
    );
  }
  for (const problem of report.problems) console.log(`     HATA: ${problem}`);
  for (const note of report.notes) console.log(`     not: ${note}`);
}

console.log(`\n${ASSET_MANIFEST.length} varlıktan ${present} mevcut, ${invalid} geçersiz.`);
if (strict && invalid > 0) process.exit(1);
