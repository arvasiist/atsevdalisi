/**
 * "AT SEVDALISI — Master Development Brief" §27 "PHASE 16 — CAREER" (bu
 * dosya bu turda EKLENDİ — `docs/AUDIT_REPORT.md`'nin "MISSING FEATURES"
 * listesindeki "§27 Career progression: NOVICE→CHAMPIONSHIP seviyeleri,
 * achievement sistemi — YOK" bulgusunun TIER-MAPPING kısmının kapatılması).
 *
 * Achievement sistemi brief'te "eklenebilir" (opsiyonel, "Achievement
 * sistemi eklenebilir" — zorunlu "Achievement sistemi OLMALI" DEĞİL)
 * olarak işaretlendiğinden VE kalıcı bir veri modeli + yeni backend
 * gerektirdiğinden bilinçli olarak bu turun kapsamı DIŞINDA bırakıldı
 * (bkz. `claude/hizli-bitirme-plani.md` "devam 24"/"devam 25" bölümleri).
 *
 * Brief'in istediği beş kademe (NOVICE → LOCAL OWNER → RISING STABLE →
 * PRO STABLE → CHAMPIONSHIP STABLE) burada UYDURULMUŞ eşik değerleriyle
 * DEĞİL, `config/progression.config.json`'ın (bkz. `@at-sevdalisi/
 * game-config`, `apps/api/src/domain/progression/progression.ts`) ZATEN
 * VAR OLAN `unlocks` seviyeleriyle hizalanır: 1 (basic_stable),
 * 10 (advanced_training), 20 (online_tournaments), 30 (advanced_farm),
 * 40 (elite_races) — bu seviyeler ZATEN oyunun kendi tasarımında "önemli
 * bir kilometre taşı" anlamına geliyor (yeni bir özellik açılıyor), bu
 * yüzden kariyer kademesi sınırı olarak da anlamlı ve TUTARLI bir seçim;
 * `maxLevel=50` olduğundan son kademe 50'de sınırlanır (`applyXpGain`
 * zaten 50'nin üzerine çıkmıyor, bkz. `progression.ts`).
 *
 * Bu modül BİLİNÇLİ olarak `apps/web`'de yaşar, backend'de DEĞİL — yeni
 * bir uç nokta GEREKTİRMEZ, çünkü girdisi (`PlayerSummary.level`)
 * ZATEN `GET /players/:id` ile istemciye ulaşıyor; kademe SADECE bunun
 * istemci tarafında sunum katmanı bir türetmesidir (`StableSummaryView.
 * stableLevel`'ın `club.ts`'teki `computeClubLevel`'dan türetilmesiyle
 * AYNI desen — sadece o backend'de, bu ise saf sunum olduğu için
 * frontend'de).
 */

export type CareerTierId = 'NOVICE' | 'LOCAL_OWNER' | 'RISING_STABLE' | 'PRO_STABLE' | 'CHAMPIONSHIP_STABLE';

export interface CareerTierDefinition {
  id: CareerTierId;
  label: string;
  minLevel: number;
}

// Bkz. dosya başı doc yorumu — sınırlar `progression.config.json`'ın
// unlocks seviyeleriyle (1/10/20/30/40) BİLEREK hizalanır, yeni bir
// dengeleme kararı İCAT EDİLMEZ.
export const CAREER_TIERS: readonly CareerTierDefinition[] = [
  { id: 'NOVICE', label: 'Acemi', minLevel: 1 },
  { id: 'LOCAL_OWNER', label: 'Yerel Sahip', minLevel: 10 },
  { id: 'RISING_STABLE', label: 'Yükselen Ahır', minLevel: 20 },
  { id: 'PRO_STABLE', label: 'Profesyonel Ahır', minLevel: 30 },
  { id: 'CHAMPIONSHIP_STABLE', label: 'Şampiyonluk Ahırı', minLevel: 40 },
];

export interface CareerProgress {
  tier: CareerTierDefinition;
  nextTier: CareerTierDefinition | null;
  /**
   * `[0,1]` aralığında, mevcut kademe İÇİNDEKİ ilerleme (bir sonraki
   * kademenin eşiğine göre). `nextTier` `null`sa (son kademedeyse) her
   * zaman `1` — "daha fazla ilerleme yok" anlamında dolu bir çubuk.
   */
  progressToNextTier: number;
}

function findTierForLevel(level: number): CareerTierDefinition {
  // `CAREER_TIERS` `minLevel`e göre ARTAN sırada tanımlıdır (bkz. yukarısı)
  // — bu yüzden basitçe eşiği GEÇMEYEN son kademede durulur, ayrı bir
  // sıralama/arama yapısı İCAT EDİLMEZ.
  let current = CAREER_TIERS[0]!;
  for (const tier of CAREER_TIERS) {
    if (level >= tier.minLevel) {
      current = tier;
    }
  }
  return current;
}

/**
 * `level` normalde `PlayerSummary.level` (1-50 arası, bkz. `progression.
 * config.json`'ın `maxLevel`i) olarak beklenir, ama GERÇEK bir çalışma
 * zamanı guard'ı var: `0`/negatif/`NaN`/ondalık bir değer gelirse (ör.
 * bozuk veri, henüz hiç XP kazanmamış YENİ bir oyuncu senaryosu) asla
 * `undefined` tier dönmez veya hata fırlatmaz — en düşük kademeye
 * (`NOVICE`) güvenle düşer.
 */
export function getCareerProgress(level: number): CareerProgress {
  const safeLevel = Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  const tier = findTierForLevel(safeLevel);
  const tierIndex = CAREER_TIERS.findIndex((t) => t.id === tier.id);
  const nextTier = tierIndex >= 0 && tierIndex < CAREER_TIERS.length - 1 ? CAREER_TIERS[tierIndex + 1]! : null;

  if (!nextTier) {
    return { tier, nextTier: null, progressToNextTier: 1 };
  }

  const span = nextTier.minLevel - tier.minLevel;
  const progressToNextTier = span > 0 ? Math.min(1, Math.max(0, (safeLevel - tier.minLevel) / span)) : 1;
  return { tier, nextTier, progressToNextTier };
}
