import type { HorseLevelBracketConfig } from '@at-sevdalisi/game-config';

/**
 * AT SEVİYESİ ARALIKLI YARIŞLAR (08.10.2026, migration 0073) — saf. Sahibinin
 * isteği: "kişinin at seviyesine göre yarışlar olsun". Aralıklı bir yarışa
 * yalnızca seviyesi aralıktaki at katılır; botlar aralığın gücündedir (çaylak
 * yarışında yeni at adil yarışır). Aralık yoksa (`null`) yarış her seviyeye
 * açıktır ve botlar eskisi gibi üretilir.
 */

/** Aralık dışı at (409) — ırk sınıfı kapısıyla aynı sınıf. */
export class HorseLevelNotAllowedError extends Error {
  constructor(
    public readonly horseLevel: number,
    public readonly bracketName: string,
  ) {
    super(`Bu yarış ${bracketName} atlar içindir; atının seviyesi (${horseLevel}) aralığın dışında.`);
    this.name = 'HorseLevelNotAllowedError';
  }
}

export function findLevelBracket(
  brackets: readonly HorseLevelBracketConfig[],
  key: string | null,
): HorseLevelBracketConfig | null {
  return brackets.find((bracket) => bracket.key === key) ?? null;
}

/** Atın seviyesinin düştüğü aralık (sıralama ve "atına uygun" için). */
export function bracketForLevel(
  brackets: readonly HorseLevelBracketConfig[],
  level: number,
): HorseLevelBracketConfig | null {
  return brackets.find((bracket) => level >= bracket.minLevel && level <= bracket.maxLevel) ?? null;
}

/** `null` aralık herkese açık; bilinmeyen aralık KAPALIDIR (yanlış yazılmış config kimseyi sokmaz). */
export function isHorseLevelAllowed(
  brackets: readonly HorseLevelBracketConfig[],
  bracketKey: string | null,
  horseLevel: number,
): boolean {
  if (bracketKey === null) return true;
  const bracket = findLevelBracket(brackets, bracketKey);
  return bracket !== null && horseLevel >= bracket.minLevel && horseLevel <= bracket.maxLevel;
}

export function levelBracketBotStatRange(
  brackets: readonly HorseLevelBracketConfig[],
  bracketKey: string | null,
): readonly [number, number] | null {
  return findLevelBracket(brackets, bracketKey)?.botStatRange ?? null;
}

/**
 * Irk sınıfı ve seviye aralığı birlikteyse bot gücü ikisinin KESİŞİMİdir;
 * kesişim boşsa ırk sınıfı geçerlidir (ırk doğuştan gücü belirler). İkisi de
 * yoksa `null` → genel aralık (açık yarış botları bit bit eskisi gibi).
 */
export function combineBotStatRanges(
  breedRange: readonly [number, number] | null,
  levelRange: readonly [number, number] | null,
): readonly [number, number] | null {
  if (breedRange === null) return levelRange;
  if (levelRange === null) return breedRange;
  const low = Math.max(breedRange[0], levelRange[0]);
  const high = Math.min(breedRange[1], levelRange[1]);
  return low < high ? [low, high] : breedRange;
}

/** Config tutarlılığı — boş liste geçerli; doluysa 1..maxLevel boşluksuz ve çakışmasız. */
export function validateHorseLevelBrackets(
  brackets: readonly HorseLevelBracketConfig[],
  maxLevel: number,
): string[] {
  const problems: string[] = [];
  if (brackets.length === 0) return problems;
  const keys = new Set<string>();
  brackets.forEach((bracket, index) => {
    if (!bracket.key || keys.has(bracket.key)) problems.push(`Aralık anahtarı boş ya da tekrarlı: "${bracket.key}".`);
    keys.add(bracket.key);
    if (!bracket.name) problems.push(`Aralık adı boş: ${bracket.key}.`);
    if (bracket.minLevel > bracket.maxLevel) problems.push(`Aralık ters: ${bracket.key}.`);
    const expectedMin = index === 0 ? 1 : (brackets[index - 1]?.maxLevel ?? 0) + 1;
    if (bracket.minLevel !== expectedMin) {
      problems.push(`Aralık ${bracket.key} ${expectedMin}'den başlamalı (boşluk/çakışma).`);
    }
    const [low, high] = bracket.botStatRange;
    if (!(low >= 0 && high <= 100 && low < high)) problems.push(`Bot gücü aralığı geçersiz: ${bracket.key}.`);
  });
  const last = brackets[brackets.length - 1];
  if (last && last.maxLevel !== maxLevel) problems.push(`Son aralık ${maxLevel}. seviyede bitmeli.`);
  return problems;
}
