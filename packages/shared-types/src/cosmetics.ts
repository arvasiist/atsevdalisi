/**
 * 09.10.2026 — KOZMETİK MAĞAZA (elmas politikası: elmas yalnızca görünüş +
 * kolaylık). Her ürün avatar kataloğundaki bir seçeneği açar.
 */
export interface CosmeticItemView {
  key: string;
  name: string;
  /** Avatar kataloğu (ör. `silkColors`). */
  catalog: string;
  /** Kataloğun açılan seçeneği (ör. `turquoise`). */
  optionId: string;
  /** Renk kataloğuysa seçeneğin hex rengi (önizleme için); değilse `null`. */
  color: string | null;
  priceGems: number;
  owned: boolean;
}

export interface CosmeticsCatalogView {
  gems: number;
  items: CosmeticItemView[];
}

export interface CosmeticPurchaseResult {
  item: CosmeticItemView;
  /** Satın alma sonrası elmas bakiyesi. */
  gems: number;
}
