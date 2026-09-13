import type { Player } from './player';

/**
 * brief §38 "Ahır Özeti" (Ana Sayfa kartı), §39 Ahır Ekranı. Bu, API
 * yanıtının şeklidir — `domain/stable/stable.ts`'teki `StableSummary`
 * (framework'ten bağımsız domain tipi) ile AYNI alanları taşır, artı
 * `stableLevel` (Player'dan gelir, domain fonksiyonuna zaten bir
 * PARAMETRE olarak verildiği için domain tipinin kendisinde YOKTUR).
 */
export interface StableSummaryView {
  stableLevel: number;
  horseCount: number;
  capacity: number;
  /** [0, 100] — atların (health + fitness) / 2 ortalaması. */
  averageCondition: number;
  /** health'i uyarı eşiğinin altında olan atların isimleri. */
  healthWarnings: string[];
}

/**
 * FAZ 1 wiring, altıncı dilim — `POST /players/{id}/stable/upgrade` yanıtı
 * (brief §32). `newBalance`, `Player`'ın yalnızca para alanlarının bir alt
 * kümesidir (`Pick`) — bu, `care.ts`'teki `PerformCareActionResult`'ın
 * `newVitals` alanı için kullanılan AYNI desendir.
 */
export interface StableUpgradeResult {
  newStableLevel: number;
  newCapacity: number;
  newBalance: Pick<Player, 'money' | 'gems'>;
  cost: { currency: 'money' | 'gems'; amount: number };
}
