import { Inject, Injectable } from '@nestjs/common';
import type {
  InteractiveRaceView,
  PlayerControlInput,
  RaceSurface,
  RaceWeather,
} from '@at-sevdalisi/shared-types';
import { computeRaceXp } from '../../domain/progression/progression';
import {
  InteractiveRaceClosedError,
  InteractiveRaceNotFoundError,
  RaceNotSettleableError,
} from '../../domain/race/errors';
import {
  applyPlayerControl,
  commandTargetSegment,
  liveElapsedMs,
  liveRemainingMs,
  parsePlayerControlInput,
  revealedSegmentCount,
  segmentCountOf,
} from '../../domain/race/interactive-race';
import { AppConfigService } from '../../infrastructure/config/config.service';
import {
  RACE_REPOSITORY,
  type LobbySettlementContext,
  type RaceRepository,
} from '../ports/race.repository';
import { SettleRaceUseCase } from './settle-race.use-case';

/**
 * LOBİ/TURNUVA YARIŞINDA OYUNCU KONTROLÜ (01.10.2026, migration 0054).
 *
 * Kontrollü (`player_control`) bir lobi yarışı kilitlenince (`locking`)
 * `live_starts_at`ten itibaren sunucuda gerçek zamanlı akar. Her katılımcı
 * yalnızca KENDİ atına komut verir; komut vermeyen ya da bağlantısı kopan
 * oyuncunun atını jokey yapay zekâsı sürer (kopma DB'ye dokunmaz).
 *
 * Görüntü ve kesinleşme AYNI kurulumu kullanır (`SettleRaceUseCase.buildRun`):
 * ekranda koşan yarış ile kesinleşen yarış ayrışamaz. Kesinleşme ancak
 * yarış bitince olur (erken çağrı 409); zamanlayıcı da bitince kesinleştirir.
 */
@Injectable()
export class LobbyLiveRaceUseCase {
  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(SettleRaceUseCase) private readonly settleRace: SettleRaceUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async current(playerId: string, now = new Date()): Promise<InteractiveRaceView | null> {
    const raceId = await this.raceRepository.findLiveLobbyRaceIdForPlayer(playerId);
    return raceId === null ? null : this.view(playerId, raceId, now);
  }

  async view(playerId: string, raceId: string, now = new Date()): Promise<InteractiveRaceView> {
    const context = await this.findParticipating(playerId, raceId);
    return this.toView(context, playerId, now);
  }

  async command(
    playerId: string,
    raceId: string,
    rawControl: unknown,
    now = new Date(),
  ): Promise<InteractiveRaceView> {
    const control: PlayerControlInput = parsePlayerControlInput(rawControl);
    const context = await this.findParticipating(playerId, raceId);
    if (context.status !== 'locking') {
      throw new InteractiveRaceClosedError(raceId);
    }
    const run = await this.buildRun(context, now);
    const entryCount = run.timeline.finalResult.length;
    // Hedef, başka oyuncuların gösterilmemiş komutlarından ETKİLENMEZ (önek
    // değişmezliği) — bu yüzden kilit dışında hesaplanabilir; güvenlik payı
    // hesap ile yazım arasındaki zamanı karşılar.
    const target = commandTargetSegment(
      run.timeline,
      entryCount,
      liveElapsedMs(context.liveStartsAt, now, this.config.interactiveRace),
      this.config.interactiveRace,
    );
    if (target >= segmentCountOf(run.timeline, entryCount)) {
      throw new InteractiveRaceClosedError(raceId);
    }
    const written = await this.raceRepository.updateLobbyEntryCommands(
      raceId,
      playerId,
      (current, status) => {
        if (status !== 'locking') {
          throw new InteractiveRaceClosedError(raceId);
        }
        return applyPlayerControl(current, target, control, this.config.race.playerControl);
      },
    );
    if (written === null) {
      throw new InteractiveRaceNotFoundError(raceId);
    }
    return this.view(playerId, raceId, now);
  }

  /**
   * Yarış bittiyse kesinleştirir (crank). Başka bir oyuncu ya da zamanlayıcı
   * önce davrandıysa (`RACE_NOT_SETTLEABLE`) sorun değildir: güncel görünüm
   * döner. Erken çağrı `INTERACTIVE_RACE_NOT_FINISHED` (409) ile düşer.
   */
  async finish(playerId: string, raceId: string, now = new Date()): Promise<InteractiveRaceView> {
    await this.findParticipating(playerId, raceId);
    try {
      await this.settleRace.execute(raceId);
    } catch (error) {
      if (!(error instanceof RaceNotSettleableError)) {
        throw error;
      }
    }
    return this.view(playerId, raceId, now);
  }

  private async findParticipating(
    playerId: string,
    raceId: string,
  ): Promise<LobbySettlementContext> {
    const context = await this.raceRepository.findLobbySettlementContext(raceId);
    // Kontrollü olmayan, henüz kilitlenmemiş ya da katılımcısı olmadığın
    // yarış 404 — varlık sızdırılmaz.
    if (
      context === null ||
      !context.playerControl ||
      (context.status !== 'locking' && context.status !== 'finished') ||
      !context.entrants.some((entrant) => entrant.playerId === playerId)
    ) {
      throw new InteractiveRaceNotFoundError(raceId);
    }
    return context;
  }

  private async buildRun(context: LobbySettlementContext, now: Date) {
    const tournament = await this.raceRepository.findTournamentInfo(context.raceId);
    return this.settleRace.buildRun(context.raceId, context, tournament === null, now);
  }

  private async toView(
    context: LobbySettlementContext,
    playerId: string,
    now: Date,
  ): Promise<InteractiveRaceView> {
    const run = await this.buildRun(context, now);
    const { timeline } = run;
    const entryCount = timeline.finalResult.length;
    const total = segmentCountOf(timeline, entryCount);
    const finished = context.status === 'finished';
    const elapsed = liveElapsedMs(context.liveStartsAt, now, this.config.interactiveRace);
    const revealed = finished
      ? total
      : revealedSegmentCount(
          timeline,
          entryCount,
          elapsed,
          this.config.interactiveRace.revealLeadMs,
        );
    const me = context.entrants.find((entrant) => entrant.playerId === playerId)!;
    const humanLabels = new Set(context.entrants.map((entrant) => entrant.horseId));
    let humanIndex = 0;
    let botIndex = 0;
    const entrants = timeline.finalResult
      .map((entry) => entry.horseId)
      .sort()
      .map((label) => {
        const isPlayer = label === me.horseId;
        const displayName = isPlayer
          ? 'Senin atın'
          : humanLabels.has(label)
            ? `Oyuncu ${(humanIndex += 1)}`
            : `Rakip ${(botIndex += 1)}`;
        return { label, displayName, isPlayer };
      });

    const outcome = finished
      ? await this.raceRepository.findLobbyOutcome(context.raceId, playerId)
      : null;
    return {
      raceId: context.raceId,
      status: finished ? 'finished' : 'running',
      serverNow: now.toISOString(),
      startsAt: (context.liveStartsAt ?? now).toISOString(),
      timeScale: this.config.interactiveRace.timeScale,
      distanceMeters: context.distanceMeters,
      surface: context.surface as RaceSurface,
      weather: context.weather as RaceWeather,
      segmentCount: total,
      revealedSegments: revealed,
      nextCommandSegment: finished || revealed >= total ? null : revealed,
      playerLabel: me.horseId,
      entrants,
      segments: timeline.segments.slice(0, revealed * entryCount),
      myCommands: me.playerCommands,
      canFinish:
        !finished && liveRemainingMs(context, timeline, now, this.config.interactiveRace) <= 0,
      result: null,
      outcome:
        outcome === null
          ? null
          : {
              ...outcome,
              xpGained: computeRaceXp(
                outcome.finishPosition,
                this.config.progression.xpRewards.player,
              ),
            },
      kind: 'lobby',
    };
  }
}
