/**
 * Yarış ekranında at/jokey renkleri — saf (DOM/three yok).
 *
 * 01.10.2026: 16 atlık sahada formalar ayırt edilebilsin diye palet 6'dan 12'ye
 * çıkarıldı (yarış konseptindeki numara rozetleri gibi doygun renkler).
 *
 * 09.10.2026 (kozmetik — jokey forması): sunucu, avatarını kaydetmiş oyuncunun
 * forma ana rengini (`silkColor`) gönderir. O katılımcı kendi rengiyle koşar;
 * kalanlar paletten alır, ama bir formaya çok benzeyen palet rengi atlanır
 * (aynı sahada iki "turuncu" olmasın). Forma verilmeyen sahada atama eskisiyle
 * BİREBİR aynıdır (`horse-colors.spec.ts` kilitler).
 */
export const HORSE_COLORS = [
  '#1d6fe0',
  '#d62f2f',
  '#1f9d55',
  '#e8b416',
  '#7c3aed',
  '#ea6a12',
  '#0ea5a5',
  '#db2777',
  '#e5e7eb',
  '#111827',
  '#84cc16',
  '#8b5a2b',
];

/**
 * İki rengin "ayrı" sayılması için en küçük RGB uzaklığı. Paletin kendi en
 * yakın iki rengi 69, forma kataloğunun en yakın ikisi (altın/turuncu) 62
 * uzaklıktadır — ikisi de geçer; paletteki forma ikizleri (≤ 43) elenir.
 * Forma kataloğuna renk eklerken `horse-colors.spec.ts` bu eşiği dener.
 */
export const MIN_DISTINCT_COLOR_DISTANCE = 60;

/**
 * `HORSE_COLORS[index % HORSE_COLORS.length]` her zaman dizinin içindedir ama
 * `noUncheckedIndexedAccess` bunu `string | undefined` tipler — `!` yerine
 * gerçek bir çalışma zamanı guard'ı.
 */
export function pickHorseColor(index: number): string {
  const color = HORSE_COLORS[index % HORSE_COLORS.length];
  if (color === undefined) {
    throw new Error('pickHorseColor: HORSE_COLORS boş olmamalıydı.');
  }
  return color;
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** RGB uzaklığı; çözülemeyen renk "çok uzak" sayılır (eleme yapılmaz). */
export function colorDistance(a: string, b: string): number {
  const left = parseHex(a);
  const right = parseHex(b);
  if (left === null || right === null) return Number.POSITIVE_INFINITY;
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function isDistinct(color: string, used: readonly string[]): boolean {
  return used.every((other) => colorDistance(color, other) >= MIN_DISTINCT_COLOR_DISTANCE);
}

/**
 * Kimlik → renk. Formalar önce yerleşir — kimlik sırasıyla (liste sırasından
 * bağımsız: canlı ekran ve tekrar aynı formayı aynı ata verir); daha önce
 * yerleşmiş bir renge çok benzeyen forma palete düşer. Kalanlar listedeki
 * sırayla paletten, kullanılmış renklere benzemeyen ilk rengi alır; palet
 * tükenirse eski döngüye (`pickHorseColor(index)`) döner.
 */
export function assignHorseColors(
  ids: readonly string[],
  silkById: Readonly<Record<string, string | null | undefined>> = {},
): Record<string, string> {
  const colors: Record<string, string> = {};
  const used: string[] = [];
  const silkClaimants = ids
    .filter((id) => typeof silkById[id] === 'string' && parseHex(silkById[id]!) !== null)
    .sort();
  for (const id of silkClaimants) {
    const silk = silkById[id]!;
    if (isDistinct(silk, used)) {
      colors[id] = silk;
      used.push(silk);
    }
  }
  let cursor = 0;
  ids.forEach((id, index) => {
    if (colors[id] !== undefined) return;
    while (cursor < HORSE_COLORS.length && !isDistinct(HORSE_COLORS[cursor]!, used)) {
      cursor += 1;
    }
    const color = cursor < HORSE_COLORS.length ? HORSE_COLORS[cursor]! : pickHorseColor(index);
    if (cursor < HORSE_COLORS.length) cursor += 1;
    colors[id] = color;
    used.push(color);
  });
  return colors;
}
