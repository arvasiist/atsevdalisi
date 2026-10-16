import { CURRENCIES, type Currency } from '@at-sevdalisi/shared-types';
import { loadGiftConfig } from '@at-sevdalisi/game-config';

/**
 * Hediye formunda gösterilecek birimler: sunucuyla AYNI config
 * (`gift.config.json → allowedCurrencies`). 09.10.2026'dan beri elmas hediye
 * EDİLEMEZ (elmas politikası) — formda her zaman 400 alan bir seçenek
 * göstermemek için liste config'ten süzülür. Kural yine sunucudadır.
 */
export const GIFT_CURRENCIES: readonly Currency[] = CURRENCIES.filter((currency) =>
  loadGiftConfig().allowedCurrencies.includes(currency),
);
