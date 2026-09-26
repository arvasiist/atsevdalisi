import { describe, expect, it } from 'vitest';
import type { RaceSegmentSnapshot, RaceTimelineView } from '@at-sevdalisi/shared-types';
import { adaptRaceTimelineViewToReplayData } from '../../../src/features/race-viewer/replay-adapter';

function makeSegment(overrides: Partial<RaceSegmentSnapshot> = {}): RaceSegmentSnapshot {
  return {
    raceEntryId: 'entry-1',
    segmentDistanceMeters: 100,
    timestampMs: 1000,
    positionMeters: 100,
    speed: 15,
    stamina: 80,
    fatigue: 10,
    lane: 1,
    tacticalState: 'holding',
    currentRank: 1,
    blocked: false,
    decision: 'hold',
    ...overrides,
  };
}

function makeView(overrides: Partial<RaceTimelineView> = {}): RaceTimelineView {
  return {
    raceId: 'race-1',
    distanceMeters: 1600,
    surface: 'dirt',
    weather: 'sunny',
    simulationSeed: 'seed-abc',
    entrants: [
      {
        entryId: 'entry-1',
        isBot: false,
        horseId: 'horse-1',
        horseName: 'Yıldırım',
        botLabel: null,
        tacticalStyle: 'front_runner',
        riskLevel: 'normal',
        gatePosition: 1,
        finalTimeMs: 95000,
        finishPosition: 1,
        performanceScore: 88.5,
        segments: [makeSegment({ raceEntryId: 'entry-1' })],
      },
      {
        entryId: 'entry-2',
        isBot: true,
        horseId: null,
        horseName: null,
        botLabel: 'Bot Rüzgar',
        tacticalStyle: 'closer',
        riskLevel: 'low',
        gatePosition: 2,
        finalTimeMs: 96500,
        finishPosition: 2,
        performanceScore: 84.1,
        segments: [makeSegment({ raceEntryId: 'entry-2', currentRank: 2 })],
      },
    ],
    ...overrides,
  };
}

describe('adaptRaceTimelineViewToReplayData', () => {
  it('her katılımcı için segments dizisini raceEntryId anahtarıyla düzleştirir', () => {
    const result = adaptRaceTimelineViewToReplayData(makeView());
    expect(result.timeline.segments).toHaveLength(2);
    expect(result.timeline.segments[0]!.raceEntryId).toBe('entry-1');
    expect(result.timeline.segments[1]!.raceEntryId).toBe('entry-2');
  });

  it('finalResult.horseId olarak GERÇEK horseId DEĞİL, entryId kullanır (botlarda horseId null olduğundan)', () => {
    const result = adaptRaceTimelineViewToReplayData(makeView());
    const ids = result.timeline.finalResult.map((entry) => entry.horseId);
    expect(ids).toEqual(['entry-1', 'entry-2']);
  });

  it('finalResult finishTimeMs/finishPosition/performanceScore alanlarını DOĞRU taşır', () => {
    const result = adaptRaceTimelineViewToReplayData(makeView());
    const winner = result.timeline.finalResult.find((entry) => entry.horseId === 'entry-1');
    expect(winner).toBeDefined();
    expect(winner!.finishTimeMs).toBe(95000);
    expect(winner!.finishPosition).toBe(1);
    expect(winner!.performanceScore).toBe(88.5);
  });

  it('horseNamesById gerçek at için horseName, bot için botLabel kullanır', () => {
    const result = adaptRaceTimelineViewToReplayData(makeView());
    expect(result.horseNamesById['entry-1']).toBe('Yıldırım');
    expect(result.horseNamesById['entry-2']).toBe('Bot Rüzgar');
  });

  it('finalTimeMs/finishPosition/performanceScore biri bile null olan katılımcıyı TAMAMEN dışlar (hayalet at üretmez)', () => {
    const view = makeView();
    view.entrants[1] = {
      ...view.entrants[1]!,
      finalTimeMs: null,
      finishPosition: null,
      performanceScore: null,
    };
    const result = adaptRaceTimelineViewToReplayData(view);

    expect(result.timeline.finalResult).toHaveLength(1);
    expect(result.timeline.finalResult[0]!.horseId).toBe('entry-1');
    expect(result.timeline.segments.every((segment) => segment.raceEntryId === 'entry-1')).toBe(true);
    expect(result.horseNamesById['entry-2']).toBe(undefined);
  });

  it('HİÇBİR katılımcının bitiş verisi tam değilse boş finalResult/segments/horseNamesById döner (çökmez)', () => {
    const view = makeView({
      entrants: [
        { ...makeView().entrants[0]!, finalTimeMs: null },
        { ...makeView().entrants[1]!, finishPosition: null },
      ],
    });
    const result = adaptRaceTimelineViewToReplayData(view);

    expect(result.timeline.finalResult).toHaveLength(0);
    expect(result.timeline.segments).toHaveLength(0);
    expect(Object.keys(result.horseNamesById)).toHaveLength(0);
  });

  it('raceId doğrudan view.raceId olur', () => {
    const result = adaptRaceTimelineViewToReplayData(makeView({ raceId: 'race-xyz' }));
    expect(result.timeline.raceId).toBe('race-xyz');
  });

  it('simulationSeed null ise boş string döner (RaceViewer/RaceHud tarafından hiç okunmayan bir alan)', () => {
    const result = adaptRaceTimelineViewToReplayData(makeView({ simulationSeed: null }));
    expect(result.timeline.simulationSeed).toBe('');
  });

  it('explanations her zaman boş dizidir (RaceTimelineView bu veriyi hiç taşımaz, RaceViewer hiç okumaz)', () => {
    const result = adaptRaceTimelineViewToReplayData(makeView());
    expect(result.timeline.explanations).toEqual([]);
  });

  it('botLabel de horseName de yoksa (beklenmeyen veri) "Bilinmeyen katılımcı" güvenli varsayılanını kullanır', () => {
    const view = makeView();
    view.entrants[0] = { ...view.entrants[0]!, horseName: null, botLabel: null };
    const result = adaptRaceTimelineViewToReplayData(view);
    expect(result.horseNamesById['entry-1']).toBe('Bilinmeyen katılımcı');
  });
});
