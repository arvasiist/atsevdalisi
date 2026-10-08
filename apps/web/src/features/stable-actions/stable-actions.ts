/**
 * AHIR İÇİ İŞLEMLER (08.10.2026). Bakım ve ekipman artık ayrı menü sayfası
 * değildir: ahır sahnesindeki simgelerden açılır. Bu dosya saf veridir
 * (React'siz) — test DOM'suz koşar.
 *
 * Eski `/care` ve `/equipment` adresleri kaybolmasın diye `/stable?panel=…`a
 * yönlenir; yer imi ya da eski bağlantı 404 vermez.
 */
export type StableActionKey = 'care' | 'equipment';

export interface StableAction {
  key: StableActionKey;
  label: string;
  description: string;
}

export const STABLE_ACTIONS: ReadonlyArray<StableAction> = [
  { key: 'care', label: 'Bakım', description: 'Tımar, su, veteriner, nalbant ve yem' },
  { key: 'equipment', label: 'Ekipman', description: 'Eyer, dizgin, nal, göz siperi, bandaj' },
];

/** Sorgu dizesindeki `panel` değerini doğrular; bilinmeyen değer `null`dur (panel açılmaz). */
export function parseStableActionParam(value: string | null | undefined): StableActionKey | null {
  return STABLE_ACTIONS.some((action) => action.key === value) ? (value as StableActionKey) : null;
}

/** Eski sayfa adresinin yönlendiği ahır adresi. */
export function stableActionHref(key: StableActionKey): string {
  return `/stable?panel=${key}`;
}
