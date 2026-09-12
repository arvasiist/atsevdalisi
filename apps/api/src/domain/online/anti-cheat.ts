/**
 * Anti-cheat — brief §42 ONLINE GÜVENLİK: "Client'tan gelen horse_speed,
 * horse_money, race_result, reward_amount gibi kritik veriler authoritative
 * kabul edilmemelidir." ve "Client 'Bu atın speed'i 99' derse backend kendi
 * DB değerini kullanmalıdır."
 *
 * Bu dosya iki tamamlayıcı savunma katmanı sağlar:
 *   1. `pickAllowedClientFields` — genel amaçlı bir ALLOWLIST filtresi.
 *      Application katmanı, client'tan gelen HERHANGİ bir payload'ı DB'ye
 *      yazmadan önce bu fonksiyondan geçirerek yalnızca izin verilen
 *      alanları alır; kalan her şey (örn. `speed`, `money`, `finalTimeMs`)
 *      sessizce YOK SAYILIR (asla DB'ye yazılmaz).
 *   2. `assertSnapshotMatchesAuthoritative` — client optimistic-UI için
 *      kendi hesapladığı bir snapshot'ı da gönderirse (ör. debug/telemetri
 *      amaçlı), bunu server'ın KENDİ hesapladığı authoritative snapshot'la
 *      karşılaştırır ve taktik alanları DIŞINDA bir uyuşmazlık bulursa
 *      açıkça reddeder — brief §42'nin "backend kendi DB değerini
 *      kullanmalıdır" ilkesinin, sessizce yok saymak yerine GÖZLEMLENEBİLİR
 *      (loglanabilir) bir ihlal sinyaline dönüştürülmüş hâlidir.
 *
 * Fonksiyonlar saftır; hiçbir DB/network erişimi yoktur.
 */

import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';
import { AntiCheatViolationError } from './errors';

/** Herhangi bir client payload'ından yalnızca `allowedKeys` içindeki alanları alır; başka her şeyi atar. */
export function pickAllowedClientFields<T extends Record<string, unknown>, K extends keyof T>(
  clientPayload: T,
  allowedKeys: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of allowedKeys) {
    if (key in clientPayload) {
      result[key] = clientPayload[key];
    }
  }
  return result;
}

/**
 * `RaceEntrantSnapshot.tactic` — brief §14.2 "Oyuncu kararları" (racingStyle,
 * riskLevel, startApproach, finalStretchPlan) — snapshot içindeki TEK
 * client-kontrollü alt alandır; geri kalan tüm alanlar (speed, stamina,
 * fitness, ... jockeySkillComposite, form) DB'den server tarafından
 * hesaplanır.
 */
const CLIENT_CONTROLLED_SNAPSHOT_FIELDS = new Set<keyof RaceEntrantSnapshot>(['tactic']);

/**
 * Client'ın gönderdiği (varsa) snapshot ile server'ın kendi hesapladığı
 * authoritative snapshot'ı karşılaştırır. `tactic` DIŞINDA herhangi bir
 * alan uyuşmuyorsa `AntiCheatViolationError` fırlatır. `clientProvided`
 * `null`/`undefined` ise (normal akış — client zaten stat göndermemelidir)
 * hiçbir şey yapmaz.
 */
export function assertSnapshotMatchesAuthoritative(
  clientProvided: RaceEntrantSnapshot | null | undefined,
  authoritative: RaceEntrantSnapshot,
): void {
  if (clientProvided == null) {
    return;
  }

  for (const key of Object.keys(authoritative) as Array<keyof RaceEntrantSnapshot>) {
    if (CLIENT_CONTROLLED_SNAPSHOT_FIELDS.has(key)) {
      continue;
    }
    if (clientProvided[key] !== authoritative[key]) {
      throw new AntiCheatViolationError(
        String(key),
        `Client değeri (${String(clientProvided[key])}) ile sunucunun DB'den hesapladığı gerçek değer ` +
          `(${String(authoritative[key])}) uyuşmuyor. Sunucu değeri kullanılacaktır.`,
      );
    }
  }
}
