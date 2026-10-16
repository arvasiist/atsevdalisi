/**
 * AT IRKLARI (07.10.2026). Irk kataloğu `config/breeds.config.json`dadır;
 * `horses.breed` ırk ANAHTARINI saklar (migration 0069 CHECK'i ile aynı küme).
 * Yeni oyuncuya en zayıf ırk ücretsiz verilir, güçlü ırklar ırk mağazasından
 * OYUN PARASIYLA alınır (elmasla değil) ve seviye kapısı vardır.
 */
import type { HorseGender, PublicHorse } from './horse';

/** `POST /breeds/:key/purchase` gövdesi. Fiyat GÖNDERİLMEZ — sunucu config'ten okur. */
export interface BuyBreedHorseRequest {
  name: string;
  gender: HorseGender;
}

export interface BuyBreedHorseResult {
  horse: PublicHorse;
  /** Ödenen tutar (oyun parası). */
  price: number;
  /** Alım sonrası bakiye. */
  money: number;
}
