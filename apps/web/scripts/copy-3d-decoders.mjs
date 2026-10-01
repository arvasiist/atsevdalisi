// 01.10.2026 — 3D varlık hattı: sıkıştırılmış GLB (Draco) ve KTX2 doku
// çözücülerini `public/decoders/` altına KOPYALAR. Neden: drei'nin
// `useGLTF`i Draco çözücüsünü varsayılan olarak gstatic.com CDN'inden
// indirir; indirme düşerse sahne çöker (yarış ekranında bir kez yaşandı,
// bkz. CLAUDE.md (13)). Dosyalar `three` paketinin kendisinden gelir
// (MIT) — uydurma varlık DEĞİLDİR. Çıktı gitignore'ludur; `predev` ve
// `prebuild` bu betiği her seferinde çalıştırır.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// `three/package.json` export edilmez; ana giriş (build/three.cjs) üzerinden köke çıkılır.
const threeRoot = join(dirname(require.resolve('three')), '..');
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const COPIES = [
  {
    from: 'examples/jsm/libs/draco/gltf',
    to: 'public/decoders/draco',
    files: ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'],
  },
  {
    from: 'examples/jsm/libs/basis',
    to: 'public/decoders/basis',
    files: ['basis_transcoder.js', 'basis_transcoder.wasm'],
  },
];

for (const { from, to, files } of COPIES) {
  const target = join(webRoot, to);
  mkdirSync(target, { recursive: true });
  for (const file of files) {
    const source = join(threeRoot, from, file);
    if (!existsSync(source)) {
      throw new Error(`3D çözücü bulunamadı: ${source} — three paketi beklenen dosyayı içermiyor.`);
    }
    cpSync(source, join(target, file));
  }
}
console.log('3D çözücüler kopyalandı → public/decoders/{draco,basis}');
