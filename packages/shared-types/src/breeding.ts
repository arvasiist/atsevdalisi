import type { ISODateTimeString, UUID } from './common';
import type { HorseGender, HorseRecordSummary } from './horse';

/** brief §7 BreedingPair, §28 */
export interface BreedingPrediction {
  // Örn. { speed: [78, 84], potential: [85, 92] } - brief §34 scout mantığıyla tutarlı aralıklar
  [statName: string]: [min: number, max: number];
}

export interface BreedingPair {
  id: UUID;
  mareId: UUID;
  stallionId: UUID;
  prediction: BreedingPrediction | null;
  fee: number;
  foalId: UUID | null;
  createdAt: ISODateTimeString;
}

/** brief §7 Pedigree */
export interface Pedigree {
  horseId: UUID;
  sireId: UUID | null;
  damId: UUID | null;
  grandSireId: UUID | null;
  grandDamId: UUID | null;
  bloodline: string | null;
}

/**
 * `GET /horses/{id}/pedigree` yanıtı (bu dilimde EKLENDİ).
 *
 * `pedigree` **her zaman** doludur — soy kaydı OLMAYAN bir at için de
 * (başlangıç atları hiçbir zaman çiftleştirilmediği için `pedigrees`
 * satırları yoktur) tüm ata alanları `null` olan bir `Pedigree` döner.
 * İstemcinin "kayıt yok" durumunu ayrı bir `null` kontrolüyle ele alması
 * YERİNE, aynı şekli (`PedigreeTree`'nin beklediği) her zaman alması
 * bilinçli bir tercihtir — `pedigree-tree.ts` zaten `null` alanları
 * "Bilinmiyor" düğümüne çevirir.
 *
 * `horseNamesById` — ağaçta GÖRÜNEN her ata ID'si için at adı. Yalnızca
 * GERÇEKTEN bulunan atlar girer (uydurma ad yok); bir ID burada yoksa
 * `pedigree-tree.ts` ham ID'yi gösterir.
 */
export interface HorsePedigreeView {
  pedigree: Pedigree;
  horseNamesById: Record<string, string>;
  /** 16.10.2026 — soy ağacındaki her atın yarış + yetiştirme özeti (brief §6). */
  recordsById: Record<string, HorseRecordSummary>;
}

/** Gebeliğin ekranda gösterilen bakım + risk durumu (genetik GİZLİ kalır). */
export interface PregnancyCareView {
  checkups: number;
  expectedCheckups: number;
  /** 0..1 — yapılan / beklenen veteriner kontrolü. */
  careScore: number;
  /** 0..1 — kısrağın beslendiği gün / geçen gün. */
  nutritionScore: number;
  lastCheckupAt: ISODateTimeString | null;
  /** `null` = şimdi yapılabilir. */
  nextCheckupAt: ISODateTimeString | null;
  checkupCost: number;
}

export type PregnancyRiskLevel = 'low' | 'medium' | 'high';

/**
 * 16.10.2026 — gebelik (brief §5). Tayın statları, cinsiyeti ve genetik tohumu
 * DÖNMEZ (doğumda görünür); süre sunucu saatine göredir (istemci saati yok).
 */
export interface PregnancyView {
  pregnancyId: UUID;
  mareId: UUID;
  mareName: string;
  stallionId: UUID;
  stallionName: string;
  foalName: string;
  /** Ödenen damızlık ücreti (kendi aygırında 0). */
  fee: number;
  inbreedingDetected: boolean;
  status: 'gestating' | 'born';
  conceivedAt: ISODateTimeString;
  expectedBirthAt: ISODateTimeString;
  bornAt: ISODateTimeString | null;
  /** Yalnızca doğduktan sonra dolu. */
  foalId: UUID | null;
  /** 0..1 — geçen süre / gebelik süresi. */
  progress: number;
  care: PregnancyCareView;
  /** Şimdiki bakımla beklenen doğum riski düzeyi. */
  riskLevel: PregnancyRiskLevel;
}

/**
 * `POST /players/{id}/breeding` (kendi kısrağı × KENDİ aygırı) ve teklif kabulü
 * yanıtı. 16.10.2026'dan beri tay ANINDA doğmaz: döllenme olasılığı < 1'dir,
 * tutarsa gebelik başlar ve doğumu zamanlayıcı yapar (brief §5).
 */
export interface BreedingAttemptView {
  attemptId: UUID;
  outcome: 'conceived' | 'not_conceived';
  /** 0..1 — bu denemenin döllenme olasılığı (sunucu hesapladı). */
  conceptionChance: number;
  pregnancy: PregnancyView | null;
  /** Tutmadıysa kısrağın yeniden denenebileceği an. */
  mareRestEndsAt: ISODateTimeString | null;
}

export type BreedingOfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

/** Çiftleştirme teklifi — iki tarafın da geçmişinde görünür. */
export interface BreedingOfferView {
  offerId: UUID;
  /** Çağırana göre: `outgoing` = kısrak sahibi, `incoming` = aygır sahibi. */
  direction: 'incoming' | 'outgoing';
  mare: { horseId: UUID; name: string; fertility: number };
  stallion: { horseId: UUID; name: string };
  mareOwner: { playerId: UUID; username: string | null };
  stallionOwner: { playerId: UUID; username: string | null };
  /** Emanete alınan ücret. */
  fee: number;
  foalName: string;
  status: BreedingOfferStatus;
  outcome: 'conceived' | 'not_conceived' | null;
  refundedAmount: number;
  pregnancyId: UUID | null;
  createdAt: ISODateTimeString;
  expiresAt: ISODateTimeString;
  respondedAt: ISODateTimeString | null;
}

/** Sahibinin aygırı için ilan durumu + ücret sınırları (ilan formu). */
export interface MyStudView {
  stallionId: UUID;
  name: string;
  breed: string;
  fertility: number;
  ageMonths: number;
  foalCount: number;
  foalLimit: number;
  /** Sunucunun izin verdiği ücret aralığı ve önerilen (formül) ücret. */
  feeBounds: { suggested: number; min: number; max: number };
  listing: { fee: number; status: 'active' | 'withdrawn' } | null;
  /** İlan verilebilir mi; değilse neden (Türkçe). */
  eligible: boolean;
  ineligibleReason: string | null;
  pendingOfferCount: number;
}

/** Merkezin kuralları — oyuncu işlemden ÖNCE görür (brief §4). */
export interface BreedingCenterRules {
  gestationDays: number;
  offerExpiryHours: number;
  failedConceptionRefundPercent: number;
  ownerSharePercent: number;
  checkupCost: number;
  checkupIntervalHours: number;
  failedAttemptCooldownHours: number;
  minConceptionChance: number;
  maxConceptionChance: number;
}

/** `GET /breeding/center` — çağıranın merkez özeti. */
export interface BreedingCenterView {
  rules: BreedingCenterRules;
  myStuds: MyStudView[];
  incomingOffers: BreedingOfferView[];
  outgoingOffers: BreedingOfferView[];
  pregnancies: PregnancyView[];
}

/**
 * `GET /breeding/studs` — başka oyuncuların İLANDAKİ aygırları (16.10.2026'dan
 * beri yalnızca sahibinin ilan verdiği; ücret = sahibinin belirlediği, sınırlı).
 *
 * ⚠️ Önerilen ücret aygırın kalite + potansiyelinden türer; emekli aygırın
 * potansiyeli ücretten çıkarılabilir — bilinçli (Photo Finish: statlar
 * emeklilikte açılır). Yarışan atın potansiyeli yine gizlidir.
 */
export interface StudListingView {
  horseId: UUID;
  name: string;
  breed: string;
  ownerId: UUID;
  ownerUsername: string | null;
  /** Oyun yaşı (ay). */
  ageMonths: number;
  level: number;
  quality: number;
  fertility: number;
  /** Sahibinin belirlediği damızlık ücreti (teklifte emanete alınır). */
  fee: number;
  /** Ömür boyu verdiği (+ taşınan) tay sayısı ve sınırı. */
  foalCount: number;
  foalLimit: number;
  sireName: string | null;
  damName: string | null;
  record: HorseRecordSummary;
}
