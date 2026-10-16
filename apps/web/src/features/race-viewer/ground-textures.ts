/**
 * ZEMİN DOKULARI (10.10.2026, görsel gerçekçilik B2) — çim ve pist için
 * çalışma anında `<canvas>`a çizilen DÖŞENEBİLİR ayrıntı dokuları. Dosya
 * DEĞİLDİR (CLAUDE.md kural 8: indirilen/depoya konan görsel yok); gerçek
 * PBR dokusu (`textures/grass-pbr.ktx2`, `textures/track-dirt-pbr.ktx2`)
 * gelene kadar düz renk yerine kullanılır.
 *
 * Dokular NÖTR tonludur (açık gri çevresinde ton farkı): malzeme rengiyle
 * çarpılır, böylece hipodrom temasının çim rengi ve yarış yüzeyinin pist
 * rengi (`vfx.config.json` → `trackColorBySurface`) aynen korunur.
 * Tohumlu PRNG ile çizilir (`Math.random()` yok) — her açılışta aynı desen.
 * Sunucu tarafında (`document` yok) `null` döner; malzeme düz renge düşer.
 */
import * as THREE from 'three';
import { createSeededRandom } from '@at-sevdalisi/shared-types';

const TEXTURE_SIZE = 512;

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  return context ? [canvas, context] : null;
}

function toRepeatingTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Kenara yakın çizimi karşı kenarda tekrarlar → doku dikişsiz döşenir. */
function drawWrapped(x: number, y: number, reach: number, draw: (dx: number, dy: number) => void): void {
  const offsets = [0];
  const xs = [...offsets, ...(x < reach ? [TEXTURE_SIZE] : []), ...(x > TEXTURE_SIZE - reach ? [-TEXTURE_SIZE] : [])];
  const ys = [...offsets, ...(y < reach ? [TEXTURE_SIZE] : []), ...(y > TEXTURE_SIZE - reach ? [-TEXTURE_SIZE] : [])];
  for (const dx of xs) for (const dy of ys) draw(dx, dy);
}

function grey(value: number, alpha: number, warm = 0): string {
  const v = Math.round(Math.max(0, Math.min(255, value)));
  const r = Math.round(Math.max(0, Math.min(255, v + warm)));
  const b = Math.round(Math.max(0, Math.min(255, v - warm)));
  return `rgba(${r}, ${v}, ${b}, ${alpha})`;
}

/**
 * Çim: yumuşak lekeler (seyrek/gür alanlar) + binlerce kısa ot çizgisi.
 * Ilık (`warm`) tonlar renkle çarpılınca sarımsı ot uçları verir.
 */
export function createGrassDetailTexture(seed = 'hipodrom-cim'): THREE.CanvasTexture | null {
  const made = makeCanvas();
  if (!made) return null;
  const [canvas, context] = made;
  const random = createSeededRandom(seed);
  context.fillStyle = grey(232, 1);
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  for (let i = 0; i < 46; i += 1) {
    const x = random() * TEXTURE_SIZE;
    const y = random() * TEXTURE_SIZE;
    const radius = 30 + random() * 90;
    const light = random() < 0.5;
    drawWrapped(x, y, radius, (dx, dy) => {
      const gradient = context.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
      gradient.addColorStop(0, grey(light ? 255 : 172, 0.42, light ? 12 : -4));
      gradient.addColorStop(1, grey(232, 0));
      context.fillStyle = gradient;
      context.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
    });
  }

  context.lineCap = 'round';
  for (let i = 0; i < 11000; i += 1) {
    const x = random() * TEXTURE_SIZE;
    const y = random() * TEXTURE_SIZE;
    const length = 2 + random() * 5;
    const angle = -Math.PI / 2 + (random() - 0.5) * 1.2;
    const tone = 165 + random() * 90;
    context.strokeStyle = grey(tone, 0.55 + random() * 0.4, random() < 0.18 ? 14 : 0);
    context.lineWidth = 0.6 + random() * 0.9;
    drawWrapped(x, y, length, (dx, dy) => {
      context.beginPath();
      context.moveTo(x + dx, y + dy);
      context.lineTo(x + dx + Math.cos(angle) * length, y + dy + Math.sin(angle) * length);
      context.stroke();
    });
  }
  return toRepeatingTexture(canvas);
}

/**
 * Pist: ince benekler (kum tanesi), pist boyunca tırmık izleri (dokunun
 * yatay ekseni = pist yönü; `DirtTrack` UV'si buna göre kurulur) ve
 * dağınık nal izleri.
 */
export function createTrackDetailTexture(seed = 'hipodrom-pist'): THREE.CanvasTexture | null {
  const made = makeCanvas();
  if (!made) return null;
  const [canvas, context] = made;
  const random = createSeededRandom(seed);
  context.fillStyle = grey(226, 1);
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  for (let i = 0; i < 18; i += 1) {
    const x = random() * TEXTURE_SIZE;
    const y = random() * TEXTURE_SIZE;
    const radius = 40 + random() * 110;
    // Ton kopyalardan ÖNCE seçilir: kenar kopyası aynı lekeyi çizmeli (dikiş yok).
    const tone = random() < 0.5 ? 250 : 195;
    drawWrapped(x, y, radius, (dx, dy) => {
      const gradient = context.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
      gradient.addColorStop(0, grey(tone, 0.25));
      gradient.addColorStop(1, grey(226, 0));
      context.fillStyle = gradient;
      context.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
    });
  }

  // Tırmık izleri: pist boyunca uzanan, hafif dalgalı oluk + sırt çiftleri.
  for (let y = 3; y < TEXTURE_SIZE; y += 7 + Math.floor(random() * 5)) {
    const phase = random() * Math.PI * 2;
    const amplitude = 0.4 + random() * 0.9;
    for (const [offset, colour] of [
      [0, grey(150, 0.22)],
      [1.4, grey(255, 0.16)],
    ] as const) {
      context.strokeStyle = colour;
      context.lineWidth = 1.1;
      context.beginPath();
      for (let x = 0; x <= TEXTURE_SIZE; x += 16) {
        // Uçlar aynı yükseklikte biter (sin periyodu dokuya tam sığar) → dikişsiz.
        const yy = y + offset + Math.sin((x / TEXTURE_SIZE) * Math.PI * 4 + phase) * amplitude;
        if (x === 0) context.moveTo(x, yy);
        else context.lineTo(x, yy);
      }
      context.stroke();
    }
  }

  for (let i = 0; i < 16000; i += 1) {
    const x = random() * TEXTURE_SIZE;
    const y = random() * TEXTURE_SIZE;
    context.fillStyle = grey(140 + random() * 115, 0.5 + random() * 0.5, random() < 0.3 ? 8 : 0);
    const size = random() < 0.85 ? 1 : 2;
    context.fillRect(x, y, size, size);
  }

  // Nal izleri: pist yönünde yarım ay oyuklar.
  for (let i = 0; i < 140; i += 1) {
    const x = random() * TEXTURE_SIZE;
    const y = random() * TEXTURE_SIZE;
    const radius = 3 + random() * 3;
    drawWrapped(x, y, radius * 2, (dx, dy) => {
      context.strokeStyle = grey(120, 0.35);
      context.lineWidth = 1.6;
      context.beginPath();
      context.ellipse(x + dx, y + dy, radius * 1.2, radius, 0, Math.PI * 0.15, Math.PI * 0.85);
      context.stroke();
    });
  }
  return toRepeatingTexture(canvas);
}
