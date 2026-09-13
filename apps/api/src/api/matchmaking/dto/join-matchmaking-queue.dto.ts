import { IsUUID } from 'class-validator';

/**
 * `POST /matchmaking/queue` gövde şeması (docs/API.md §9). `CreateMarketListingDto`
 * ile AYNI desen — yalnızca FORMAT ön-kontrolüdür; `playerId` BİLEREK
 * BURADA YOK (bkz. `JoinMatchmakingQueueUseCase` doc yorumu — atın
 * `ownerId`'sinden türetilir).
 */
export class JoinMatchmakingQueueDto {
  @IsUUID()
  horseId!: string;
}
