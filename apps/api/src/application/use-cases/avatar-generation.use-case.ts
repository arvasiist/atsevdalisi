import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AdminAvatarJobView,
  AvatarGenerationJobView,
  AvatarGenerationStatusView,
} from '@at-sevdalisi/shared-types';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import { assertStaffPermission } from '../../domain/admin/staff';
import {
  AiAvatarNotFoundError,
  AvatarConsentRequiredError,
  AvatarGenerationUnavailableError,
  AvatarJobInProgressError,
  AvatarJobNotFoundError,
} from '../../domain/avatar/errors';
import { isTerminalAvatarJob, isValidGlb } from '../../domain/avatar/generation-job';
import { SELFIE_EXTENSIONS, validateSelfie } from '../../domain/avatar/selfie';
import {
  AVATAR_GENERATION_PROVIDER,
  type AvatarGenerationProvider,
} from '../ports/avatar-generation.provider';
import { AVATAR_JOB_REPOSITORY, type AvatarJobRecord, type AvatarJobRepository } from '../ports/avatar-job.repository';
import { AVATAR_STORAGE, type AvatarStorage, type StoredObject } from '../ports/avatar-storage';
import { MODERATION_REPOSITORY, type ModerationRepository } from '../ports/moderation.repository';

const generation = loadAvatarConfig().generation;
const MS_PER_MINUTE = 60_000;
const THUMBNAIL_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;

function toView(job: AvatarJobRecord): AvatarGenerationJobView {
  return {
    id: job.id,
    status: job.status,
    errorCode: job.errorCode,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

/**
 * SELFIE → AI AVATAR HATTI (07.10.2026, Faz 8-B, brief §38–49).
 *
 * - Sağlayıcı yoksa (`null`) talep 503 ile DÜŞER ve selfie HİÇ saklanmaz.
 * - Rıza sürümü config'tedir; istemci kabul ettiği sürümü gönderir.
 * - İş HTTP isteğinde koşmaz: istek selfie'yi depolar + `requested` yazar;
 *   `advance()` (zamanlayıcı, lider kilidiyle) sağlayıcıyla konuşur.
 * - `ready` geçişi oyuncunun AI avatarını AYNI transaction'da değiştirir;
 *   eski modelin dosyaları ancak commit'ten SONRA silinir (§45).
 * - Selfie iş bitince (başarı/başarısızlık/iptal) silinir (§48).
 */
@Injectable()
export class AvatarGenerationUseCase {
  private readonly logger = new Logger(AvatarGenerationUseCase.name);

  constructor(
    @Inject(AVATAR_GENERATION_PROVIDER) private readonly provider: AvatarGenerationProvider | null,
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage,
    @Inject(AVATAR_JOB_REPOSITORY) private readonly jobs: AvatarJobRepository,
    @Inject(MODERATION_REPOSITORY) private readonly moderation: ModerationRepository,
  ) {}

  async status(playerId: string): Promise<AvatarGenerationStatusView> {
    const [latest, ai] = await Promise.all([this.jobs.findLatestForPlayer(playerId), this.jobs.findAiAvatar(playerId)]);
    return {
      available: this.provider !== null,
      consentVersion: generation.consentVersion,
      maxUploadBytes: generation.maxUploadBytes,
      acceptedTypes: [...generation.acceptedTypes],
      minDimension: generation.minDimension,
      currentJob: latest ? toView(latest) : null,
      aiAvatar: ai ? { updatedAt: ai.updatedAt.toISOString() } : null,
    };
  }

  async request(
    playerId: string,
    input: { consentVersion: unknown; file: { bytes: Uint8Array; mimetype: string | undefined } | null },
    now: Date = new Date(),
  ): Promise<AvatarGenerationJobView> {
    // Sıra bilinçlidir: sağlayıcı yoksa dosyaya hiç bakılmaz, hiçbir şey yazılmaz.
    const provider = this.provider;
    if (provider === null) throw new AvatarGenerationUnavailableError();
    if (input.consentVersion !== generation.consentVersion) throw new AvatarConsentRequiredError();
    const type = validateSelfie(input.file?.bytes ?? new Uint8Array(), input.file?.mimetype, generation);
    const jobId = randomUUID();
    const selfieKey = `selfies/${jobId}.${SELFIE_EXTENSIONS[type]}`;
    await this.storage.put(selfieKey, input.file!.bytes, type);
    const created = await this.jobs.create({
      id: jobId,
      playerId,
      provider: provider.name,
      consentVersion: generation.consentVersion,
      selfieKey,
      now,
    });
    if (created === 'active_exists') {
      await this.storage.delete(selfieKey);
      throw new AvatarJobInProgressError();
    }
    return toView(created);
  }

  async cancel(playerId: string, jobId: string, now: Date = new Date()): Promise<AvatarGenerationJobView> {
    const job = await this.jobs.findForPlayer(playerId, jobId);
    if (!job) throw new AvatarJobNotFoundError();
    const result = await this.jobs.mutate(jobId, now, (current) =>
      ['requested', 'analyzing', 'generating'].includes(current.status)
        ? { kind: 'update', status: 'cancelled', errorCode: null, clearSelfie: true }
        : { kind: 'skip' },
    );
    if (!result) throw new AvatarJobNotFoundError();
    if (result.job.status === 'cancelled') {
      await this.deleteQuietly(job.selfieKey);
      if (job.providerJobId && this.provider) {
        await this.provider.cancel(job.providerJobId).catch((error: unknown) => this.warn('iptal', job.id, error));
      }
    }
    return toView(result.job);
  }

  /** Oyuncunun AI avatar MODELİ — yalnızca sahibine (imzalı URL'nin yerel karşılığı: yetkili uç). */
  async model(playerId: string): Promise<StoredObject> {
    const ai = await this.jobs.findAiAvatar(playerId);
    const object = ai ? await this.storage.get(ai.modelKey) : null;
    if (!object) throw new AiAvatarNotFoundError();
    return object;
  }

  /**
   * Gizlilik silmesi (§48): etkin iş iptal edilir, AI avatar + bütün iş
   * kayıtları ve depodaki dosyalar silinir. Manuel avatar etkilenmez.
   */
  async purge(playerId: string, now: Date = new Date()): Promise<{ deletedObjects: number }> {
    const latest = await this.jobs.findLatestForPlayer(playerId);
    if (latest && !isTerminalAvatarJob(latest.status) && latest.status !== 'processing') {
      await this.cancel(playerId, latest.id, now);
    }
    const keys = await this.jobs.purgeForPlayer(playerId);
    await Promise.all(keys.map((key) => this.deleteQuietly(key)));
    return { deletedObjects: keys.length };
  }

  async listForAdmin(actorId: string): Promise<AdminAvatarJobView[]> {
    assertStaffPermission(await this.moderation.findRole(actorId), 'avatar_jobs.view');
    return this.jobs.listForAdmin(generation.adminListLimit);
  }

  /** Zamanlayıcı turu: etkin işleri birer adım ilerletir. Bir işin hatası diğerlerini durdurmaz. */
  async advance(now: Date = new Date()): Promise<{ advanced: number }> {
    if (this.provider === null) return { advanced: 0 };
    let advanced = 0;
    for (const job of await this.jobs.findActive(generation.batchSize)) {
      try {
        if (await this.advanceOne(this.provider, job, now)) advanced += 1;
      } catch (error) {
        this.warn('ilerletme', job.id, error);
      }
    }
    return { advanced };
  }

  private async advanceOne(provider: AvatarGenerationProvider, job: AvatarJobRecord, now: Date): Promise<boolean> {
    if (now.getTime() - job.createdAt.getTime() > generation.jobTimeoutMinutes * MS_PER_MINUTE) {
      return this.fail(job, 'TIMEOUT', now, provider);
    }
    if (job.status === 'requested') {
      const selfie = job.selfieKey ? await this.storage.get(job.selfieKey) : null;
      if (!selfie) return this.fail(job, 'SELFIE_MISSING', now, provider);
      const { providerJobId } = await provider.generate({ image: selfie.bytes, contentType: selfie.contentType });
      return this.move(job.id, now, 'requested', { kind: 'update', status: 'analyzing', providerJobId });
    }
    if (job.status === 'analyzing' || job.status === 'generating') {
      const state = await provider.getStatus(job.providerJobId!);
      if (state.state === 'failed') return this.fail(job, sanitizeReason(state.reason), now, provider);
      if (state.state === 'generating' && job.status === 'analyzing') {
        return this.move(job.id, now, 'analyzing', { kind: 'update', status: 'generating' });
      }
      if (state.state === 'ready') {
        if (!(await this.move(job.id, now, job.status, { kind: 'update', status: 'processing' }))) return false;
        return this.finish(provider, { ...job, status: 'processing' }, now);
      }
      return false;
    }
    if (job.status === 'processing') return this.finish(provider, job, now);
    return false;
  }

  /** Modeli indir, doğrula, depola; oyuncunun avatarını değiştir. Doğrulanamayan model avatar OLMAZ. */
  private async finish(provider: AvatarGenerationProvider, job: AvatarJobRecord, now: Date): Promise<boolean> {
    const result = await provider.download(job.providerJobId!);
    if (!isValidGlb(result.model, generation.maxModelBytes)) return this.fail(job, 'INVALID_MODEL', now, provider);
    const modelKey = `models/${job.id}.glb`;
    await this.storage.put(modelKey, result.model, 'model/gltf-binary');
    let thumbnailKey: string | null = null;
    if (result.thumbnail) {
      thumbnailKey = `thumbnails/${job.id}.${THUMBNAIL_EXTENSIONS[result.thumbnail.contentType]}`;
      await this.storage.put(thumbnailKey, result.thumbnail.bytes, result.thumbnail.contentType);
    }
    const mutation = await this.jobs.mutate(job.id, now, (current) =>
      current.status === 'processing'
        ? { kind: 'update', status: 'ready', clearSelfie: true, aiAvatar: { modelKey, thumbnailKey } }
        : { kind: 'skip' },
    );
    if (mutation?.job.status !== 'ready') {
      // Başka bir tur bitirmiş ya da iş sonlanmış: bu turun yazdığı dosyalar artık sahipsiz.
      await this.deleteQuietly(modelKey);
      await this.deleteQuietly(thumbnailKey);
      return false;
    }
    await this.deleteQuietly(job.selfieKey);
    if (mutation.replaced) {
      await this.deleteQuietly(mutation.replaced.modelKey);
      await this.deleteQuietly(mutation.replaced.thumbnailKey);
    }
    return true;
  }

  private async fail(job: AvatarJobRecord, code: string, now: Date, provider: AvatarGenerationProvider): Promise<boolean> {
    const result = await this.jobs.mutate(job.id, now, (current) =>
      isTerminalAvatarJob(current.status)
        ? { kind: 'skip' }
        : { kind: 'update', status: 'failed', errorCode: code, clearSelfie: true },
    );
    if (result?.job.status !== 'failed') return false;
    await this.deleteQuietly(job.selfieKey);
    if (code === 'TIMEOUT' && job.providerJobId) {
      await provider.cancel(job.providerJobId).catch((error: unknown) => this.warn('iptal', job.id, error));
    }
    return true;
  }

  private async move(
    jobId: string,
    now: Date,
    expected: AvatarJobRecord['status'],
    update: { kind: 'update'; status: AvatarJobRecord['status']; providerJobId?: string },
  ): Promise<boolean> {
    const result = await this.jobs.mutate(jobId, now, (current) => (current.status === expected ? update : { kind: 'skip' }));
    return result?.job.status === update.status;
  }

  private async deleteQuietly(key: string | null): Promise<void> {
    if (!key) return;
    await this.storage.delete(key).catch((error: unknown) => this.warn('dosya silme', key, error));
  }

  private warn(step: string, id: string, error: unknown): void {
    // Kimlik + adım; selfie içeriği/anahtar/sağlayıcı yanıtı loglanmaz.
    this.logger.warn(`Avatar ${step} başarısız (${id}): ${error instanceof Error ? error.name : 'hata'}`);
  }
}

/** Sağlayıcının hata nedenini kısa, büyük harfli bir koda indirger (serbest metin istemciye sızmaz). */
export function sanitizeReason(reason: string): string {
  const code = reason.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return code || 'PROVIDER_FAILED';
}
