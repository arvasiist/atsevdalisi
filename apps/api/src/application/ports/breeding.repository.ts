import type { BreedingAttemptView, BreedingOfferView, MyStudView, PregnancyView } from '@at-sevdalisi/shared-types';

/**
 * Çiftleştirme + gebelik + doğum (brief §4–§5, 16.10.2026'da yeniden kuruldu).
 *
 * **PARA YOLU.** Kilit sırası her yolda aynı: (teklif) → atlar (id sırası) →
 * (ilan) → oyuncular (id sırası). Uygunluk ve sahiplik KİLİTLİ satırlardan
 * okunur; use-case ön kontrol yapmaz (ikinci doğruluk kaynağı + TOCTOU).
 * Defter satırları ve bildirimler para hareketiyle AYNI transaction'dadır.
 */
export interface BreedingRepository {
  /** Kendi kısrağı × KENDİ aygırı (ücretsiz). Başkasının aygırı → `BreedingRequiresAgreementError`. */
  attemptOwnBreeding(input: OwnBreedingInput): Promise<BreedingAttemptView>;
  listStudCandidates(input: StudSearchInput): Promise<StudCandidate[]>;
  listPregnancies(ownerId: string, limit: number, now: Date): Promise<PregnancyView[]>;
  /** Ücretli veteriner kontrolü (`pregnancy_vet_check`); en sık `checkupIntervalHours`. */
  performCheckup(input: { pregnancyId: string; actorId: string; now: Date; idempotencyKey: string | null }): Promise<PregnancyView>;
  /** Vakti gelen doğumlar (her biri kendi transaction'ında). Doğan tay sayısı. */
  deliverDueBirths(now: Date, batchSize: number): Promise<number>;
}

export interface BreedingOfferRepository {
  findMyStuds(ownerId: string, now: Date): Promise<MyStudView[]>;
  upsertStudListing(input: { ownerId: string; stallionId: string; fee: unknown; now: Date }): Promise<MyStudView>;
  /** İlanı geri çeker; bekleyen teklifler İPTAL + TAM iade (+ bildirim). */
  withdrawStudListing(input: { ownerId: string; stallionId: string; now: Date }): Promise<{ cancelledOffers: number }>;
  createOffer(input: CreateOfferInput): Promise<BreedingOfferView>;
  /** Teklifin kısrak sahibi (çiftlik etkisi için); yoksa `null`. */
  findOfferMareOwner(offerId: string): Promise<string | null>;
  acceptOffer(input: AcceptOfferInput): Promise<BreedingOfferView>;
  rejectOffer(input: { offerId: string; actorId: string; now: Date }): Promise<BreedingOfferView>;
  cancelOffer(input: { offerId: string; actorId: string; now: Date }): Promise<BreedingOfferView>;
  listOffers(playerId: string, limit: number): Promise<BreedingOfferView[]>;
  /** Süresi dolan bekleyen teklifler: TAM iade + bildirim. Kapanan sayı. */
  expireDueOffers(now: Date, batchSize: number): Promise<number>;
}

export interface OwnBreedingInput {
  playerId: string;
  mareId: string;
  stallionId: string;
  foalName: string;
  now: Date;
  random: () => number;
  birthHealthRiskMultiplier: number;
}

export interface CreateOfferInput {
  offerId: string;
  mareOwnerId: string;
  mareId: string;
  stallionId: string;
  foalName: string;
  idempotencyKey: string | null;
  now: Date;
}

export interface AcceptOfferInput {
  offerId: string;
  actorId: string;
  now: Date;
  random: () => number;
  birthHealthRiskMultiplier: number;
}

export interface StudSearchInput {
  viewerId: string;
  foalLimit: number;
  scanLimit: number;
  breed: string | null;
  maxFee: number | null;
}

/** `GET /breeding/studs` satırı — İLANDAKİ aygır (yaş uygunluğu use-case'te süzülür). */
export interface StudCandidate {
  horseId: string;
  name: string;
  breed: string;
  ownerId: string;
  ownerUsername: string | null;
  birthDate: Date;
  agingStartedAt: Date;
  level: number;
  quality: number;
  potential: number;
  fertility: number;
  fee: number;
  foalCount: number;
  sireName: string | null;
  damName: string | null;
}

export const BREEDING_REPOSITORY = Symbol('BREEDING_REPOSITORY');
export const BREEDING_OFFER_REPOSITORY = Symbol('BREEDING_OFFER_REPOSITORY');

/** [0,1) düzgün dağılımlı sayı — döllenme zarı ve tay cinsiyeti (e2e sabitler). */
export interface BreedingRandomSource {
  next(): number;
}

export const BREEDING_RANDOM = Symbol('BREEDING_RANDOM');
