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
