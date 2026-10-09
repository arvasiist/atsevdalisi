/**
 * ELMAS POLİTİKASI (09.10.2026, sahibinin onayı). Elmas gerçek parayla
 * alınan birimdir; yalnızca GÖRÜNÜŞ ve KOLAYLIK satın alır. Saf; DB yok.
 *
 *   - Yarışı etkileyen hiçbir şey elmasla satılmaz. Yem atın kondisyon /
 *     sağlık / enerjisini değiştirir ve motor kondisyonu + sağlığı doğrudan
 *     okur (`conditionModifier`) → yem fiyatı elmas OLAMAZ.
 *   - Oyuncudan oyuncuya elmas aktarılmaz: gerçek parayı hesaplar arasında
 *     taşımak hesap satışı / değer aktarımı kapısıdır → hediye birimi elmas
 *     OLAMAZ.
 *
 * Kural config'e bağlı olduğu için API açılışında denetlenir; bozuk config
 * ile API AÇILMAZ (ırk/masa doğrulayıcılarıyla aynı desen).
 */

import type { CareConfig, GiftConfig } from '@at-sevdalisi/game-config';

const GEMS = 'gems';

export function validateGemPolicy(care: Pick<CareConfig, 'feedTypes'>, gift: Pick<GiftConfig, 'allowedCurrencies'>): string[] {
  const problems: string[] = [];
  for (const [feedType, definition] of Object.entries(care.feedTypes)) {
    if (definition.price?.currency === GEMS) {
      problems.push(
        `care.feedTypes.${feedType}: yem elmasla satılamaz — yem yarış kondisyonunu değiştirir (elmas yalnızca görünüş/kolaylık).`,
      );
    }
  }
  if (gift.allowedCurrencies.includes(GEMS)) {
    problems.push('gift.allowedCurrencies: elmas hediye edilemez — gerçek parayla alınan birim oyuncular arasında taşınmaz.');
  }
  return problems;
}
