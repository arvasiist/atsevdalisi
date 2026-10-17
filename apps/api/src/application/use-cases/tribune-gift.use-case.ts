import { Inject, Injectable } from '@nestjs/common';
import type {
  CollectTribuneGiftsResult,
  RaceTribuneGiftsView,
  SendTribuneGiftResult,
  TribuneGiftInboxView,
} from '@at-sevdalisi/shared-types';
import { loadGrandstandConfig, loadQuestsConfig } from '@at-sevdalisi/game-config';
import {
  InvalidTribuneGiftError,
  isRaceOpenForTribuneGifts,
  resolveTribuneGift,
  tribuneGiftOwnerShare,
} from '../../domain/grandstand/tribune-gift';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { RaceNotFoundError } from '../../domain/race/errors';
import { friendGiftDayStart } from '../../domain/social/friend-gift';
import { TRIBUNE_GIFT_NOTIFIER, type TribuneGiftNotifier } from '../ports/tribune-gift-notifier';
import { TRIBUNE_GIFT_REPOSITORY, type TribuneGiftRepository } from '../ports/tribune-gift.repository';
import { GetRaceTimelineUseCase } from './get-race-timeline.use-case';

const config = loadGrandstandConfig().tribuneGifts;
/** Oyunun TEK takvim saat dilimi — günlük sınır Türkiye gününde sıfırlanır. */
const TIMEZONE_OFFSET_MINUTES = loadQuestsConfig().timezoneOffsetMinutes;

/**
 * TRİBÜN HEDİYESİ (08.10.2026). Yetki kapısı tribünle AYNIDIR
 * (`assertCanWatch`: katılımcı VEYA ücretsiz tribün VEYA bilet) — ikinci bir
 * izleme kuralı yazılmaz. İstemci yalnızca at + hediye anahtarı gönderir;
 * fiyat, pay ve alıcı sunucudadır.
 */
@Injectable()
export class TribuneGiftUseCase {
  constructor(
    @Inject(TRIBUNE_GIFT_REPOSITORY) private readonly repository: TribuneGiftRepository,
    @Inject(TRIBUNE_GIFT_NOTIFIER) private readonly notifier: TribuneGiftNotifier,
    @Inject(GetRaceTimelineUseCase) private readonly timeline: GetRaceTimelineUseCase,
  ) {}

  async board(raceId: string, playerId: string, now: Date = new Date()): Promise<RaceTribuneGiftsView> {
    await this.timeline.assertCanWatch(raceId, playerId);
    const facts = await this.repository.findForRace(
      raceId,
      playerId,
      friendGiftDayStart(now, TIMEZONE_OFFSET_MINUTES),
      config.recentLimit,
    );
    if (facts === null) throw new RaceNotFoundError(raceId);
    const perHorse = new Map<string, Record<string, number>>();
    for (const row of facts.perHorse) {
      const counts = perHorse.get(row.horseId) ?? {};
      counts[row.giftKey] = row.count;
      perHorse.set(row.horseId, counts);
    }
    return {
      raceId,
      open: isRaceOpenForTribuneGifts(facts.status, facts.startTime, now, config.giftWindowHours),
      items: config.items.map((item) => ({
        key: item.key,
        name: item.name,
        emoji: item.emoji,
        price: item.price,
        ownerAmount: tribuneGiftOwnerShare(item.price, config.ownerSharePercent),
      })),
      recipients: facts.recipients,
      perHorse: [...perHorse.entries()].map(([horseId, counts]) => ({ horseId, counts })),
      recent: facts.recent,
      sentToday: facts.sentToday,
      dailyLimit: config.dailyLimit,
    };
  }

  /** 17.10.2026 (brief §17) — çağıranın hediye kutusu (yalnızca kendisi). */
  async inbox(playerId: string): Promise<TribuneGiftInboxView> {
    const view = await this.repository.inbox(playerId, config.recentLimit);
    if (view === null) throw new PlayerNotFoundError(playerId);
    const order = new Map(config.items.map((item, index) => [item.key, index]));
    return {
      ...view,
      pendingByGift: [...view.pendingByGift].sort(
        (a, b) => (order.get(a.giftKey) ?? order.size) - (order.get(b.giftKey) ?? order.size),
      ),
    };
  }

  /**
   * Bekleyen bütün payları toplar — tek defter satırı. Tekrar çağrı sıfır
   * toplar (Idempotency-Key gerekmez: tekrarın ikinci kez ödeyeceği satır yok).
   */
  async collect(playerId: string, now: Date = new Date()): Promise<CollectTribuneGiftsResult> {
    return this.repository.collect(playerId, now);
  }

  async send(
    raceId: string,
    playerId: string,
    horseId: string,
    rawGiftKey: unknown,
    idempotencyKey: string | null,
    now: Date = new Date(),
  ): Promise<SendTribuneGiftResult> {
    const item = resolveTribuneGift(rawGiftKey, config);
    if (item === null) throw new InvalidTribuneGiftError();
    await this.timeline.assertCanWatch(raceId, playerId);
    const ownerAmount = tribuneGiftOwnerShare(item.price, config.ownerSharePercent);
    const outcome = await this.repository.send({
      raceId,
      horseId,
      senderId: playerId,
      giftKey: item.key,
      price: item.price,
      ownerAmount,
      dailyLimit: config.dailyLimit,
      dayStart: friendGiftDayStart(now, TIMEZONE_OFFSET_MINUTES),
      giftWindowHours: config.giftWindowHours,
      idempotencyKey,
      now,
    });
    // Yayın COMMIT'ten SONRA — geri alınan hediye tribüne düşmesin.
    this.notifier.notifyTribuneGift({
      raceId,
      tribuneGiftId: outcome.tribuneGiftId,
      giftKey: item.key,
      horseId,
      horseName: outcome.horseName,
      senderDisplayName: outcome.senderDisplayName,
      createdAt: outcome.createdAt.toISOString(),
    });
    return {
      tribuneGiftId: outcome.tribuneGiftId,
      giftKey: item.key,
      price: item.price,
      ownerAmount,
      balanceAfter: outcome.senderBalanceAfter,
    };
  }
}
