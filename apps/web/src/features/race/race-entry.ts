/**
 * Yarışa giriş — proje sahibinin açık talebi (27.09.2026): "yarışlar ücretli
 * olsun, verilen ücret kadarıyla giriş yapan kişiler çarpan olsun ve bir
 * yarışta 8 / 10 / 12 / 14 / 16 at koşabilsin, HAZIR OLAN kişiler
 * yarışabilsinler".
 *
 * Bu modül iki soruyu yanıtlar ve İKİSİ DE yalnızca sunum içindir:
 *  1. Hangi kademe ne kadar tutuyor, kaç at koşuyor, çarpan ne?
 *  2. Seçili at yarışa HAZIR mı; değilse neden?
 *
 * HİÇBİR LİSTE BURADA TANIMLANMAZ. Tek kaynak `config/economy.config.json`
 * (`raceTiers`/`raceRake`) ve `config/race.config.json` (`readiness`) —
 * sunucu da AYNI dosyaları okur (`apps/api/src/domain/race/prize.ts` ve
 * `.../readiness.ts`). `career-tier.ts`'in `progression.config.json`'a
 * bağlanmasıyla AYNI desen. İstemci kendi giriş ücreti / alan büyüklüğü /
 * ödül tablosu / hazır olma eşiği UYDURMAZ; aksi hâlde iki liste kaçınılmaz
 * olarak birbirinden kayardı ve ekranda yazan ücret ile bakiyeden düşen
 * ücret farklı olurdu.
 *
 * SUNUCU OTORİTESİ (CLAUDE.md kural 1): gerçek giriş ücreti, havuz ve ödül
 * HER ZAMAN yarış yanıtından (`PracticeRaceResult.entryFee` / `prizePool` /
 * `prizeWon`) okunur; burada hesaplanan hiçbir sayı bakiyeyi etkilemez.
 * Hazır olma kontrolü de öyle: sunucu reddederse (`409`) ekrandaki ipucu ne
 * derse desin yarış BAŞLAMAZ.
 */
import { loadEconomyConfig, loadRaceConfig, type RaceTierConfig } from '@at-sevdalisi/game-config';
import type { HorseStatus } from '@at-sevdalisi/shared-types';

const economyConfig = loadEconomyConfig();
const raceConfig = loadRaceConfig();

/**
 * `raceTiers` ARTAN alan büyüklüğüne göre tanımlıdır (8/10/12/14/16) ve
 * `apps/api` tarafındaki `getDefaultRaceTier` de listenin İLKİNİ varsayılan
 * kabul eder — bu yüzden burada da ilk kademe varsayılandır; config'e ayrıca
 * bir "varsayılan" alanı EKLENMEZ (ikinci bir doğruluk kaynağı olurdu).
 */
export const RACE_TIERS: readonly RaceTierConfig[] = economyConfig.raceTiers;

export const DEFAULT_RACE_TIER_ID: string | null = RACE_TIERS[0]?.id ?? null;

/**
 * `raceRake` — havuzdan dağıtılmayan kesinti oranı (proje sahibinin kararı
 * ~%10). Ekranda AÇIKÇA gösterilir: oyuncunun eşit güçte bir alanda beklenen
 * net sonucu tam olarak bu oran kadar negatiftir ve bunu gizlemek yanıltıcı
 * olurdu (bkz. `apps/api/test/domain/race/prize.spec.ts` EV testi).
 */
export const RACE_RAKE: number = economyConfig.raceRake;

export function findRaceTier(tierId: string | null): RaceTierConfig | null {
  if (tierId === null) {
    return null;
  }
  return RACE_TIERS.find((tier) => tier.id === tierId) ?? null;
}

/**
 * Oyuncunun gördüğü ÇARPANDIR: `prize = entryFee × fieldSize × share`
 * olduğundan, ödülün ÖDENEN giriş ücretine oranı tam olarak
 * `fieldSize × share`'dır. Ayrı bir çarpan tablosu TUTULMAZ — çarpan
 * türetilir, böylece alan büyüklüğü arttığında kendiliğinden büyür
 * (mahalli 1. sıra 3.00×, şampiyona 1. sıra 4.80×) ve kayacak ikinci bir
 * tablo oluşmaz.
 *
 * Ödül almayan bir sıra için `0` döner (çökme yok) — ödülsüz bitirmek bu
 * modelde İSTİSNA DEĞİL OLAĞAN yoldur (ödül alan sıra sayısı her zaman alan
 * büyüklüğünden küçüktür).
 */
export function getPayoutMultiplier(tier: RaceTierConfig, finishPosition: number): number {
  const share = tier.payoutShares[finishPosition - 1];
  return share === undefined ? 0 : share * tier.fieldSize;
}

/**
 * Kademe başına ilk `count` sıranın çarpanı — ekranda ödül tablosunu
 * göstermek için. Yalnızca İLK birkaç sıra gösterilir: 1.0×'in altındaki
 * sıralar (giriş ücretinden az kazanç) doğru olsa da ilk bakışta
 * yanıltıcıdır, o yüzden listelenmezler; kesinti notu onun yerine açıkça
 * yazılır.
 */
export function getTopPayoutMultipliers(tier: RaceTierConfig, count: number): number[] {
  const positions = Math.max(0, Math.min(count, tier.payoutShares.length));
  const multipliers: number[] = [];
  for (let position = 1; position <= positions; position += 1) {
    multipliers.push(getPayoutMultiplier(tier, position));
  }
  return multipliers;
}

export function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(2)}×`;
}

export function formatRakePercent(rake: number): string {
  return `%${Math.round(rake * 100)}`;
}

/** `apps/api/src/domain/race/readiness.ts`'teki `RaceNotReadyReason` ile AYNI değerler. */
export type RaceEntryBlocker = 'HORSE_NOT_ACTIVE' | 'INSUFFICIENT_HEALTH' | 'HORSE_TOO_TIRED' | 'INSUFFICIENT_ENERGY';

export const RACE_ENTRY_BLOCKER_LABELS: Record<RaceEntryBlocker, string> = {
  HORSE_NOT_ACTIVE: 'At yarışabilir durumda değil',
  INSUFFICIENT_HEALTH: `Sağlık ${raceConfig.readiness.minHealth} altında`,
  HORSE_TOO_TIRED: `Yorgunluk ${raceConfig.readiness.maxFatigue} üstünde`,
  INSUFFICIENT_ENERGY: `Enerji ${raceConfig.readiness.minEnergy} altında`,
};

/**
 * Ekranın "Yarışa Başla" düğmesini kilitleme gerekçesi. `apps/api/src/domain/
 * race/readiness.ts`'teki `checkRaceReadiness`'in AYNI kontrol SIRASINI
 * uygular (en kalıcıdan en geçiciye) — sıra bilinçlidir: oyuncuya aynı anda
 * tek bir neden gösterilir, böylece mesaj iki farklı yerden iki farklı şey
 * söylemez. SUNUCU YİNE DE TEK OTORİTEDİR; burası yalnızca düğmeyi
 * kilitleyen bir ÖN İZLEMEDİR (sunucu reddederse yarış başlamaz).
 */
export function getRaceEntryBlocker(horse: {
  status: HorseStatus;
  health: number;
  fatigue: number;
  energy: number;
}): RaceEntryBlocker | null {
  const { minHealth, maxFatigue, minEnergy } = raceConfig.readiness;
  if (horse.status !== 'active') {
    return 'HORSE_NOT_ACTIVE';
  }
  if (horse.health < minHealth) {
    return 'INSUFFICIENT_HEALTH';
  }
  if (horse.fatigue > maxFatigue) {
    return 'HORSE_TOO_TIRED';
  }
  if (horse.energy < minEnergy) {
    return 'INSUFFICIENT_ENERGY';
  }
  return null;
}
