/**
 * Ahır dokuları (08.10.2026) — çalışma anında `<canvas>`a çizilir, dosya
 * DEĞİLDİR (CLAUDE.md "sahte asset yasak": indirilen ya da depoya konan bir
 * görsel yok). Tohumlu PRNG ile çizilir: sahne her açılışta aynı görünür.
 * Sunucu tarafında (`document` yok) `null` döner; malzeme düz renge düşer.
 */
import * as THREE from 'three';
import { seededRandom } from './stable-layout';

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  return context ? [canvas, context] : null;
}

function toTexture(canvas: HTMLCanvasElement, repeat: [number, number]): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  return texture;
}

function shade(hex: string, factor: number): string {
  const color = new THREE.Color(hex);
  color.multiplyScalar(factor);
  return `#${color.getHexString()}`;
}

/** Yatay tahta kaplama: tahta başına ton farkı, damar çizgileri, budak, derz. */
export function createWoodTexture(
  seed: number,
  base: string,
  repeat: [number, number],
  boards = 8,
): THREE.CanvasTexture | null {
  const made = makeCanvas(512, 512);
  if (!made) return null;
  const [canvas, context] = made;
  const random = seededRandom(seed);
  const boardHeight = canvas.height / boards;
  for (let board = 0; board < boards; board += 1) {
    const top = board * boardHeight;
    context.fillStyle = shade(base, 0.82 + random() * 0.3);
    context.fillRect(0, top, canvas.width, boardHeight);
    // Damar: tahta boyunca dalgalı ince çizgiler.
    for (let line = 0; line < 14; line += 1) {
      const y = top + random() * boardHeight;
      const amplitude = 1 + random() * 3;
      const frequency = 0.004 + random() * 0.01;
      context.strokeStyle = `rgba(30, 18, 8, ${0.08 + random() * 0.14})`;
      context.lineWidth = 0.6 + random() * 1.4;
      context.beginPath();
      for (let x = 0; x <= canvas.width; x += 8) {
        const yy = y + Math.sin(x * frequency + line) * amplitude;
        if (x === 0) context.moveTo(x, yy);
        else context.lineTo(x, yy);
      }
      context.stroke();
    }
    // Budak.
    if (random() < 0.55) {
      const cx = random() * canvas.width;
      const cy = top + boardHeight * (0.3 + random() * 0.4);
      const radius = 3 + random() * 6;
      context.fillStyle = 'rgba(40, 22, 10, 0.55)';
      context.beginPath();
      context.ellipse(cx, cy, radius * 1.8, radius, 0, 0, Math.PI * 2);
      context.fill();
    }
    // Derz (iki tahta arası koyu çizgi) + üst kenar ışığı.
    context.fillStyle = 'rgba(12, 7, 3, 0.85)';
    context.fillRect(0, top, canvas.width, 2);
    context.fillStyle = 'rgba(255, 230, 190, 0.08)';
    context.fillRect(0, top + 2, canvas.width, 1);
  }
  // Kir/eskime lekeleri.
  for (let i = 0; i < 40; i += 1) {
    context.fillStyle = `rgba(20, 12, 6, ${0.03 + random() * 0.05})`;
    context.beginPath();
    context.arc(random() * canvas.width, random() * canvas.height, 10 + random() * 40, 0, Math.PI * 2);
    context.fill();
  }
  return toTexture(canvas, repeat);
}

/** Fırçalanmış beton koridor zemini: ince benek + çatlak. */
export function createConcreteTexture(seed: number, repeat: [number, number]): THREE.CanvasTexture | null {
  const made = makeCanvas(512, 512);
  if (!made) return null;
  const [canvas, context] = made;
  const random = seededRandom(seed);
  context.fillStyle = '#8d877d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 9000; i += 1) {
    const value = 90 + Math.floor(random() * 90);
    context.fillStyle = `rgba(${value}, ${value - 4}, ${value - 10}, ${0.25 + random() * 0.35})`;
    context.fillRect(random() * canvas.width, random() * canvas.height, 1 + random() * 2, 1 + random() * 2);
  }
  // Fırça izleri.
  for (let y = 0; y < canvas.height; y += 6) {
    context.fillStyle = `rgba(60, 56, 50, ${0.03 + random() * 0.04})`;
    context.fillRect(0, y, canvas.width, 2);
  }
  // Saman kırıntısı + leke.
  for (let i = 0; i < 160; i += 1) {
    context.strokeStyle = `rgba(214, 178, 96, ${0.25 + random() * 0.35})`;
    context.lineWidth = 1;
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const angle = random() * Math.PI;
    const length = 4 + random() * 10;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }
  for (let i = 0; i < 12; i += 1) {
    context.fillStyle = `rgba(40, 34, 28, ${0.05 + random() * 0.06})`;
    context.beginPath();
    context.arc(random() * canvas.width, random() * canvas.height, 20 + random() * 60, 0, Math.PI * 2);
    context.fill();
  }
  return toTexture(canvas, repeat);
}

/** Saman yatak: farklı tonlarda binlerce kısa tel. */
export function createStrawTexture(seed: number, repeat: [number, number]): THREE.CanvasTexture | null {
  const made = makeCanvas(512, 512);
  if (!made) return null;
  const [canvas, context] = made;
  const random = seededRandom(seed);
  context.fillStyle = '#9c7a3c';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const palette = ['#e6c879', '#d9b45f', '#c99f4b', '#f0dc9c', '#b88d3d', '#a77d34'];
  for (let i = 0; i < 6500; i += 1) {
    context.strokeStyle = palette[Math.floor(random() * palette.length)] ?? '#d9b45f';
    context.globalAlpha = 0.55 + random() * 0.45;
    context.lineWidth = 0.8 + random() * 1.6;
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const angle = random() * Math.PI;
    const length = 8 + random() * 26;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }
  context.globalAlpha = 1;
  return toTexture(canvas, repeat);
}

/** Bölme kapısındaki pirinç isim levhası — atın gerçek adı (sistem yazı tipi, indirme yok). */
export function createNameplateTexture(name: string): THREE.CanvasTexture | null {
  const made = makeCanvas(512, 128);
  if (!made) return null;
  const [canvas, context] = made;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#e9c46a');
  gradient.addColorStop(0.5, '#b8862b');
  gradient.addColorStop(1, '#8a6420');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(60, 40, 10, 0.8)';
  context.lineWidth = 6;
  context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  context.fillStyle = '#2a1a06';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  let size = 64;
  context.font = `bold ${size}px Georgia, serif`;
  while (context.measureText(name).width > canvas.width - 60 && size > 22) {
    size -= 4;
    context.font = `bold ${size}px Georgia, serif`;
  }
  context.fillText(name, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Pencereden görünen dış manzara: gökyüzü + uzak tepe + ağaç silueti. */
export function createWindowViewTexture(seed: number): THREE.CanvasTexture | null {
  const made = makeCanvas(256, 128);
  if (!made) return null;
  const [canvas, context] = made;
  const random = seededRandom(seed);
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#9cc7ef');
  sky.addColorStop(0.65, '#e8f1f7');
  sky.addColorStop(1, '#f6efdc');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#7d9a6a';
  context.beginPath();
  context.moveTo(0, canvas.height * 0.78);
  for (let x = 0; x <= canvas.width; x += 16) {
    context.lineTo(x, canvas.height * (0.7 + random() * 0.08));
  }
  context.lineTo(canvas.width, canvas.height);
  context.lineTo(0, canvas.height);
  context.fill();
  for (let i = 0; i < 9; i += 1) {
    const x = random() * canvas.width;
    const radius = 8 + random() * 12;
    context.fillStyle = random() < 0.5 ? '#4f6b3e' : '#5d7a47';
    context.beginPath();
    context.arc(x, canvas.height * 0.72 - radius * 0.6, radius, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
