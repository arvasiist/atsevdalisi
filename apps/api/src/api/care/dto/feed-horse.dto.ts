import { IsIn } from 'class-validator';
import type { FeedType } from '@at-sevdalisi/shared-types';
import { FEED_TYPES } from '../../../domain/care/validation';

/**
 * `POST /horses/:id/feed` gövde şeması (docs/API.md §4). `perform-care-action.dto.ts`
 * ile AYNI desen ve AYNI gerekçe.
 */
export class FeedHorseDto {
  @IsIn(FEED_TYPES)
  feedType!: FeedType;
}
