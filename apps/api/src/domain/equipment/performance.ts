/**
 * Ekipmanın Race Engine'e etkisi (bkz. `packages/shared-types/src/
 * horse.ts` `HorseEquipment` doc yorumu — Carried Weight'in "ekipman
 * ağırlığı BİLİNÇLİ olarak kapsam dışı" kararından AYRI, yeni ve bağımsız
 * bir sistem).
 *
 * `track-fit.ts`/`carried-weight.ts` ile AYNI desen: bu dosya hiçbir I/O
 * yapmaz, hiçbir DB/NestJS bağımlılığı içermez — `apps/api/tsconfig.
 * domain.json` ile gerçek `tsc --noEmit` ile doğrulanabilir, ve saf
 * olduğu için bu sandbox'ta `tsx` ile GERÇEKTEN çalıştırılıp test
 * edilebilir (CI'ya güvenmeden).
 *
 * **Ölçek kararı (KALİBRASYON notu) — neden 1 ekipman parçası başına en
 * fazla %1:** Bu, `carried-weight.ts`'in `FLOOR_SCORE`/`FALLOFF_DECAY_KG`
 * için yaptığı gibi GERÇEK motora karşı YENİ bir Monte Carlo kalibrasyonu
 * DEĞİLDİR (o dosyanın "İLK taslak `20` idi, ölçüldü, `90`'a çıkarıldı"
 * dersini burada tekrarlamak için bu turda zaman/kapsam yok) — bunun
 * yerine, `modifier-combination.ts`'in KENDİ doc yorumunun BİLE referans
 * verdiği, bu projede HALİHAZIRDA "küçük bir bonus" için GÜVENLİ kabul
 * edilmiş TEK somut örnek büyüklüğü ÖDÜNÇ ALINIR: `config/weather.
 * config.json`'daki `sunny_grass_dry → 1.05` (bkz. `modifier-combination.ts`
 * satır ~41). Beş ekipman yuvasının (saddle/bridle/horseshoe/blinkers/
 * leg_wraps) HEPSİ AYNI ANDA en yüksek kalitede (`quality: 100`)
 * kuşanıldığında toplam bonus TAM OLARAK bu AYNI büyüklüğe (`+0.05`,
 * yani `1.05`) ulaşır — YENİ, kalibre edilmemiş bir üst sınır İCAT
 * ETMEK yerine, projenin KENDİSİNİN ZATEN güvenli kabul ettiği bir
 * büyüklüğe BİLEREK eşitlenir. `MAX_TOTAL_EQUIPMENT_MODIFIER` yine de
 * AÇIKÇA bir savunma tabanı olarak kırpar (ör. ileride altıncı bir yuva
 * eklenirse toplamın sessizce bu sınırı AŞMAMASI için).
 *
 * **Neden yalnızca BONUS, asla ceza (aksine `carried-weight.ts`/`track-
 * fit.ts`):** kuşanılmamış/hiç ekipmanı olmayan bir at NÖTR (`1.0`)
 * sayılır, "kötü ekipman" diye bir ceza kavramı YOKTUR — bu, "ekipman
 * satın almak/kuşanmak SADECE fayda sağlar, asla dezavantaj YARATMAZ"
 * şeklindeki bilinçli, basit bir tasarım kararıdır (spekülatif bir "kötü
 * ekipman cezası" sistemi İCAT ETMEKTEN kaçınılmıştır).
 */
const MAX_MODIFIER_PER_EQUIPPED_ITEM = 0.01;

/** Beş yuvanın (bkz. `EQUIPMENT_TYPES`) HEPSİ en yüksek kalitede olsa bile ulaşılabilecek üst sınır — bkz. yukarıdaki doc yorumu. */
const MAX_TOTAL_EQUIPMENT_MODIFIER = 1.05;

/** `race-engine.ts`'in `combineConditionModifiers`'ının beklediği "1.0 = nötr" ölçeği. */
export const NEUTRAL_EQUIPMENT_MODIFIER = 1;

/**
 * Yalnızca `equipped: true` olan parçalar sayılır (envanterde bekleyen,
 * satın alınmış ama kuşanılmamış ekipmanın performansa HİÇBİR etkisi
 * yoktur — bkz. `HorseEquipment.equipped` doc yorumu).
 */
export function computeEquipmentPerformanceModifier(
  equippedItems: ReadonlyArray<{ quality: number; equipped: boolean }>,
): number {
  const totalBonus = equippedItems
    .filter((item) => item.equipped)
    .reduce((sum, item) => sum + (item.quality / 100) * MAX_MODIFIER_PER_EQUIPPED_ITEM, 0);

  return Math.min(MAX_TOTAL_EQUIPMENT_MODIFIER, NEUTRAL_EQUIPMENT_MODIFIER + totalBonus);
}
