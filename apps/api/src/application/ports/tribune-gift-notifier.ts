import type { TribuneGiftEvent } from '@at-sevdalisi/shared-types';

/** Tribün hediyesi yayını — yarış odasındaki herkese (`race.tribuneGift`). */
export interface TribuneGiftNotifier {
  notifyTribuneGift(event: TribuneGiftEvent): void;
}

export const TRIBUNE_GIFT_NOTIFIER = Symbol('TRIBUNE_GIFT_NOTIFIER');
