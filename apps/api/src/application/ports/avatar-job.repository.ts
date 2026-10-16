import type { AdminAvatarJobView, AvatarJobStatus } from '@at-sevdalisi/shared-types';

export const AVATAR_JOB_REPOSITORY = Symbol('AVATAR_JOB_REPOSITORY');

export interface AvatarJobRecord {
  id: string;
  playerId: string;
  status: AvatarJobStatus;
  provider: string;
  providerJobId: string | null;
  selfieKey: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

export interface AiAvatarRecord {
  playerId: string;
  jobId: string;
  modelKey: string;
  thumbnailKey: string | null;
  updatedAt: Date;
}

/** Kilit altında okunan işe göre karar veren geri çağrının dönüşü. */
export type AvatarJobMutation =
  | { kind: 'skip' }
  | {
      kind: 'update';
      status: AvatarJobStatus;
      providerJobId?: string;
      errorCode?: string | null;
      clearSelfie?: boolean;
      /** `ready` geçişinde oyuncunun AI avatarı AYNI transaction'da değişir (§45). */
      aiAvatar?: { modelKey: string; thumbnailKey: string | null };
    };

export interface AvatarJobMutationResult {
  job: AvatarJobRecord;
  /** `ready` geçişinde yerinden edilen ESKİ avatar (dosyaları commit SONRASI silinir). */
  replaced: AiAvatarRecord | null;
}

export interface AvatarJobRepository {
  /** Etkin iş varsa (kısmi tekil indeks) `'active_exists'`. */
  create(input: {
    id: string;
    playerId: string;
    provider: string;
    consentVersion: string;
    selfieKey: string;
    now: Date;
  }): Promise<AvatarJobRecord | 'active_exists'>;
  findLatestForPlayer(playerId: string): Promise<AvatarJobRecord | null>;
  findForPlayer(playerId: string, jobId: string): Promise<AvatarJobRecord | null>;
  /** İlerletilecek etkin işler (en eski güncelleme önce). */
  findActive(limit: number): Promise<AvatarJobRecord[]>;
  /** İş satırı `FOR UPDATE` kilitlenir, `decide` kilit altında karar verir. */
  mutate(
    jobId: string,
    now: Date,
    decide: (job: AvatarJobRecord) => AvatarJobMutation,
  ): Promise<AvatarJobMutationResult | null>;
  findAiAvatar(playerId: string): Promise<AiAvatarRecord | null>;
  /** AI avatar satırını + oyuncunun bütün iş kayıtlarını siler; silinecek depo anahtarlarını döner. */
  purgeForPlayer(playerId: string): Promise<string[]>;
  listForAdmin(limit: number): Promise<AdminAvatarJobView[]>;
}
