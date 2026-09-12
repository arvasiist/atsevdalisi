/**
 * Yarış Odası (Race Room) — brief §41 ONLINE MİMARİ: "Client sadece kendi
 * local görünümünü kontrol edemez. Server: participant validation, horse
 * snapshot, jockey snapshot, race configuration, seed, simulation, result,
 * reward üretir."
 *
 * Bu dosya, server'ın "participant validation" ve "seed" adımlarını saf
 * fonksiyonlarla karşılar. "simulation" adımı zaten mevcut ve doğrulanmış
 * Race Engine'dir (`domain/race/race-engine.ts`) — PvP/online yarışlar için
 * YENİ bir simülasyon motoru YAZILMAMIŞTIR, aynı `simulateRace` fonksiyonu
 * bir "oda" bağlamında (2+ gerçek oyuncu, server-authoritative snapshot'lar)
 * çağrılır. "horse/jockey snapshot" üretimi zaten `domain/race/base-ability.ts`
 * + ilgili domain'lerin sorumluluğundadır (bu dosya sadece üretilmiş
 * snapshot'ların GEÇERLİLİĞİNİ doğrular, kendisi snapshot üretmez).
 */

import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';
import { DuplicateHorseInRaceRoomError, InvalidRaceRoomParticipantCountError } from './errors';

/** brief §41 "Client A / Client B / Client C" örneği en az 2 gerçek oyuncu ima eder. */
export const MIN_RACE_ROOM_PARTICIPANTS = 2;
/** brief'te üst sınır belirtilmemiştir; proje-içi karar: FAZ 1 temel yarış motoruyla aynı üst sınır (bkz. `Race.participantLimit` alanı, tipik hipodrom yarışı büyüklüğü). */
export const MAX_RACE_ROOM_PARTICIPANTS = 12;

/** İki oyunculu PvP maçları için sabit katılımcı sayısı (bkz. `PvpMatch.playerIds`, `[UUID, UUID]`). */
export const PVP_MATCH_PARTICIPANT_COUNT = 2;

export interface RaceRoomParticipant {
  playerId: string;
  horseId: string;
  snapshot: RaceEntrantSnapshot;
}

/**
 * Bir yarış odasına kaydolan katılımcı listesinin server tarafında
 * doğrulanması (brief §41 "participant validation"). Kontrol edilenler:
 *  - katılımcı sayısı izin verilen aralıkta mı (`minParticipants`/`maxParticipants`),
 *  - aynı at (`horseId`) birden fazla kez kaydolmuş mu (bir at aynı anda
 *    iki katılımcı gibi davranamaz — brief'te açık değildir ama temel bir
 *    bütünlük kuralıdır).
 * Geçerliyse hiçbir şey döndürmez; geçersizse ilgili hatayı fırlatır.
 */
export function validateRaceRoomParticipants(
  participants: RaceRoomParticipant[],
  minParticipants: number = MIN_RACE_ROOM_PARTICIPANTS,
  maxParticipants: number = MAX_RACE_ROOM_PARTICIPANTS,
): void {
  if (participants.length < minParticipants || participants.length > maxParticipants) {
    throw new InvalidRaceRoomParticipantCountError(participants.length, minParticipants, maxParticipants);
  }

  const seenHorseIds = new Set<string>();
  for (const participant of participants) {
    if (seenHorseIds.has(participant.horseId)) {
      throw new DuplicateHorseInRaceRoomError(participant.horseId);
    }
    seenHorseIds.add(participant.horseId);
  }
}

/**
 * brief §41 "seed" — bir yarış odası için deterministik ama tahmin
 * edilemez (odaya/zamana özgü) bir `simulationSeed` üretir. `createSeededRandom`
 * (bkz. `packages/shared-types/src/deterministic-random.ts`) burada
 * KULLANILMAZ — bu fonksiyon rastgele SAYI üretmez, `domain/race/race-engine.ts`'e
 * geçirilecek seed STRING'ini üretir. Aynı `raceRoomId` + `startedAt` girdisi
 * her zaman aynı seed'i üretir (deterministic, replay/dispute analizi için
 * gereklidir — brief §18 son madde ile aynı gerekçe).
 */
export function createRaceRoomSeed(raceRoomId: string, startedAt: Date): string {
  return `race-room:${raceRoomId}:${startedAt.toISOString()}`;
}
