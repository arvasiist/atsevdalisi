import type { ISODateTimeString, UUID } from './common';

/** brief §14.1 Yarış parametreleri */
export type RaceSurface = 'grass' | 'dirt' | 'synthetic';
export type RaceWeather = 'sunny' | 'rainy' | 'windy' | 'cloudy' | 'hot' | 'cold';
export type RaceStatus = 'scheduled' | 'in_progress' | 'finished' | 'cancelled';

/** brief §14.2 Oyuncu kararları */
export type RacingStyle = 'front_runner' | 'tracker' | 'mid_pack' | 'closer';
export type RiskLevel = 'low' | 'normal' | 'high';
export type StartApproach = 'aggressive' | 'balanced' | 'controlled';
export type FinalStretchPlan = 'early_sprint' | 'normal' | 'late_sprint';

export interface Track {
  id: UUID;
  name: string;
  location: string | null;
  lengthMeters: number | null;
  turnCount: number | null;
  trackWidthMeters: number | null;
}

/** brief §7 Race */
export interface Race {
  id: UUID;
  trackId: UUID | null;
  name: string;
  distanceMeters: number;
  surface: RaceSurface;
  weather: RaceWeather;
  temperatureC: number | null;
  windKmh: number | null;
  humidityPct: number | null;
  participantLimit: number;
  entryFee: number;
  prizePool: number;
  startTime: ISODateTimeString;
  status: RaceStatus;
  simulationSeed: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/** brief §7 RaceEntry + §56 RaceSnapshot */
export interface RaceEntry {
  id: UUID;
  raceId: UUID;
  horseId: UUID;
  jockeyId: UUID | null;
  gatePosition: number | null;
  tacticalStyle: RacingStyle | null;
  riskLevel: RiskLevel | null;
  horseSnapshot: RaceEntrantSnapshot | null;
  finalTimeMs: number | null;
  finishPosition: number | null;
  performanceScore: number | null;
  createdAt: ISODateTimeString;
}

/**
 * brief §56 RaceSnapshot — yarış başladığında donmuş, değiştirilemez değerler.
 * Race Engine yalnızca bu veriyi kullanır (docs/RACE_ENGINE.md §3).
 */
export interface RaceEntrantSnapshot {
  horseId: UUID;
  speed: number;
  stamina: number;
  acceleration: number;
  fitness: number;
  fatigue: number;
  health: number;
  morale: number;
  surfaceCompatibility: number;
  distanceCompatibility: number;
  jockeySkillComposite: number;
  tactic: {
    racingStyle: RacingStyle;
    riskLevel: RiskLevel;
    startApproach: StartApproach;
    finalStretchPlan: FinalStretchPlan;
  };
}

/** brief §24 Race Telemetry / §19 Segment sistemi */
export interface RaceSegmentSnapshot {
  raceEntryId: UUID;
  segmentDistanceMeters: number;
  timestampMs: number;
  positionMeters: number;
  speed: number;
  stamina: number;
  fatigue: number;
  lane: number;
  tacticalState: string;
  currentRank: number;
}

/** docs/RACE_ENGINE.md §5 */
export interface RaceFinishEntry {
  horseId: UUID;
  finishTimeMs: number;
  finishPosition: number;
  performanceScore: number;
}

export interface RaceExplanation {
  horseId: UUID;
  positives: string[];
  negatives: string[];
}

export interface RaceTimeline {
  raceId: UUID;
  simulationSeed: string;
  segments: RaceSegmentSnapshot[];
  finalResult: RaceFinishEntry[];
  explanations: RaceExplanation[];
}
