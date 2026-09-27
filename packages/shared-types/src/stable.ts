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
  /**
   * Sıradaki ahır yükseltmesinin teklifi; `null` ise tanımlı en yüksek
   * seviyeye ULAŞILMIŞTIR (arayüz bu durumda "Yükselt" düğmesini hiç
   * göstermemelidir).
   *
   * NEDEN ÖZETİN İÇİNDE (ayrı bir uç nokta DEĞİL): maliyet ve yeni kapasite
   * zaten sunucuda `domain/stable/stable.ts`'te hesaplanıyor, ama Ahır
   * ekranı bunları gösterebilmek için İKİNCİ bir istek atmak zorunda
   * kalıyordu — ve asıl sorun şuydu: `POST /players/:id/stable/upgrade`
   * PARA harcayan bir uç nokta olduğu halde, arayüz fiyatı ÖNCEDEN
   * gösteremiyordu, yani oyuncu ne kadar ödediğini ancak işlem bittikten
   * sonra öğreniyordu. Teklifi özete eklemek bunu tek istekle çözer.
   *
   * İstemci bu değerleri YALNIZCA GÖSTERİR — hiçbir şey hesaplamaz ve
   * yükseltme kararını VERMEZ (bkz. CLAUDE.md "SUNUCU OTORİTESİ": fiyat
   * sunucudan gelir, gerçek düşüş `POST .../stable/upgrade` içindeki
   * `SELECT ... FOR UPDATE` + `economy_transactions` defter kaydıyla olur).
   */
  nextUpgrade: StableUpgradeOfferView | null;
}

/**
 * Ahır yükseltme teklifinin API şekli. `domain/stable/stable.ts`'teki
 * `StableUpgradeOffer` ile AYNI alanları taşır (o tip framework'süz saf
 * domain tipidir, bu ise tel üzerindeki şekildir — bkz. bu dosyanın başı).
 */
export interface StableUpgradeOfferView {
  nextLevel: number;
  cost: { currency: 'money' | 'gems'; amount: number };
  /** `nextLevel`'a geçildiğinde ahırın yeni at kapasitesi. */
  nextCapacity: number;
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
