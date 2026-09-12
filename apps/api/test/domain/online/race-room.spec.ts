import { describe, expect, it } from 'vitest';
import {
  createRaceRoomSeed,
  MAX_RACE_ROOM_PARTICIPANTS,
  MIN_RACE_ROOM_PARTICIPANTS,
  validateRaceRoomParticipants,
  type RaceRoomParticipant,
} from '../../../src/domain/online/race-room';
import { DuplicateHorseInRaceRoomError, InvalidRaceRoomParticipantCountError } from '../../../src/domain/online/errors';
import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';

function participant(playerId: string, horseId: string): RaceRoomParticipant {
  return {
    playerId,
    horseId,
    snapshot: {
      horseId,
      speed: 80,
      stamina: 75,
      acceleration: 70,
      fitness: 90,
      fatigue: 10,
      health: 95,
      morale: 85,
      surfaceCompatibility: 80,
      distanceCompatibility: 75,
      jockeySkillComposite: 70,
      form: 50,
      tactic: { racingStyle: 'mid_pack', riskLevel: 'normal', startApproach: 'balanced', finalStretchPlan: 'normal' },
    } as RaceEntrantSnapshot,
  };
}

describe('validateRaceRoomParticipants', () => {
  it('geçerli (2-12 arası, tekrarsız) bir listeyi kabul eder', () => {
    const participants = [participant('p1', 'h1'), participant('p2', 'h2')];
    expect(() => validateRaceRoomParticipants(participants)).not.toThrow();
  });

  it('minimum katılımcı sayısının altındaki listeyi reddeder', () => {
    expect(() => validateRaceRoomParticipants([participant('p1', 'h1')])).toThrow(
      InvalidRaceRoomParticipantCountError,
    );
  });

  it('maksimum katılımcı sayısının üstündeki listeyi reddeder', () => {
    const tooMany = Array.from({ length: MAX_RACE_ROOM_PARTICIPANTS + 1 }, (_, i) => participant(`p${i}`, `h${i}`));
    expect(() => validateRaceRoomParticipants(tooMany)).toThrow(InvalidRaceRoomParticipantCountError);
  });

  it('aynı atın iki kez kaydolmasını reddeder', () => {
    const duplicated = [participant('p1', 'shared-horse'), participant('p2', 'shared-horse')];
    expect(() => validateRaceRoomParticipants(duplicated)).toThrow(DuplicateHorseInRaceRoomError);
  });

  it('özel min/max parametreleriyle (örn. PvP = tam 2) çalışır', () => {
    const three = [participant('p1', 'h1'), participant('p2', 'h2'), participant('p3', 'h3')];
    expect(() => validateRaceRoomParticipants(three, 2, 2)).toThrow(InvalidRaceRoomParticipantCountError);
  });

  it('MIN_RACE_ROOM_PARTICIPANTS 2\'dir (brief §41 Client A/B/C örneği en az 2 gerçek katılımcı gerektirir)', () => {
    expect(MIN_RACE_ROOM_PARTICIPANTS).toBe(2);
  });
});

describe('createRaceRoomSeed', () => {
  it('aynı oda id + aynı başlangıç zamanı her zaman aynı seed\'i üretir (deterministic)', () => {
    const startedAt = new Date('2026-09-12T10:00:00.000Z');
    const seedA = createRaceRoomSeed('room-1', startedAt);
    const seedB = createRaceRoomSeed('room-1', new Date('2026-09-12T10:00:00.000Z'));
    expect(seedA).toBe(seedB);
  });

  it('farklı oda id\'leri farklı seed üretir', () => {
    const startedAt = new Date('2026-09-12T10:00:00.000Z');
    expect(createRaceRoomSeed('room-1', startedAt)).not.toBe(createRaceRoomSeed('room-2', startedAt));
  });
});
