import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AvatarGenerationStatusView } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import {
  AVATAR_GENERATION_PROVIDER,
  type AvatarGenerationProvider,
  type AvatarProviderResult,
  type AvatarProviderState,
} from '../../src/application/ports/avatar-generation.provider';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AvatarGenerationScheduler } from '../../src/infrastructure/scheduler/avatar-generation.scheduler';
import { glbBytes, pngBytes } from '../domain/avatar/fixtures';
import { bootstrapTestApp, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * SELFIE → AI AVATAR HATTI (07.10.2026, Faz 8-B, migration 0067).
 *
 * Gerçek sağlayıcı YOK; e2e onu `FakeAvatarProvider` ile taklit eder (Google
 * doğrulayıcısıyla aynı desen). Kanıtlananlar:
 *  1. Sağlayıcı yokken hat kapalı: 503 ve HİÇBİR şey saklanmaz.
 *  2. Rıza ve dosya doğrulaması; oyuncu başına tek etkin iş.
 *  3. İş zamanlayıcıda ilerler (HTTP'de değil); hazır olunca model sahibine
 *     verilir, selfie depodan SİLİNİR.
 *  4. Yeniden üretim başarısız olursa (sağlayıcı hatası / bozuk model) ESKİ
 *     avatar korunur (§45); başarılıysa eski modelin dosyası silinir.
 *  5. İptal, başkasının işi (404), zaman aşımı, gizlilik silmesi, hesap
 *     silmesi, yönetim listesi (anahtar sızdırmaz).
 */
class FakeAvatarProvider implements AvatarGenerationProvider {
  readonly name = 'fake-3d';
  readonly received: Uint8Array[] = [];
  readonly cancelled: string[] = [];
  private counter = 0;
  readonly states = new Map<string, AvatarProviderState>();
  readonly results = new Map<string, AvatarProviderResult>();

  async generate(input: { image: Uint8Array }): Promise<{ providerJobId: string }> {
    this.received.push(input.image);
    const id = `fake-${++this.counter}`;
    this.states.set(id, { state: 'analyzing' });
    return { providerJobId: id };
  }

  async getStatus(id: string): Promise<AvatarProviderState> {
    return this.states.get(id) ?? { state: 'failed', reason: 'unknown job' };
  }

  async download(id: string): Promise<AvatarProviderResult> {
    return this.results.get(id) ?? { model: glbBytes({ asset: { version: '2.0' }, extras: { id } }), thumbnail: null };
  }

  async cancel(id: string): Promise<void> {
    this.cancelled.push(id);
  }

  lastId(): string {
    return `fake-${this.counter}`;
  }
}

const config = loadAvatarConfig().generation;

describe('AI avatar hattı — sağlayıcı YOK (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    delete process.env.AVATAR_PROVIDER;
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  it('durum "kullanılamıyor"; yükleme 503 ve hiçbir iş satırı yazılmaz', async () => {
    const player = await registerTestPlayer(app, 'Selfie Kapalı');
    const status = (
      await request(app.getHttpServer()).get('/api/v1/avatar/generation').set('Authorization', player.authHeader).expect(200)
    ).body.data as AvatarGenerationStatusView;
    expect(status).toMatchObject({ available: false, currentJob: null, aiAvatar: null });
    const response = await request(app.getHttpServer())
      .post('/api/v1/avatar/generation')
      .set('Authorization', player.authHeader)
      .field('consentVersion', config.consentVersion)
      .attach('selfie', Buffer.from(pngBytes(800, 800)), { filename: 'ben.png', contentType: 'image/png' })
      .expect(503);
    expect(response.body.error.code).toBe('AVATAR_GENERATION_UNAVAILABLE');
    const rows = await pool.query('SELECT 1 FROM avatar_generation_jobs WHERE player_id = $1', [player.playerId]);
    expect(rows.rows).toHaveLength(0);
  });
});

describe('AI avatar hattı — sahte sağlayıcıyla (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let scheduler: AvatarGenerationScheduler;
  let storageDir: string;
  const provider = new FakeAvatarProvider();

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'avatar-e2e-'));
    process.env.AVATAR_STORAGE_DIR = storageDir;
    app = await bootstrapTestApp((builder) => builder.overrideProvider(AVATAR_GENERATION_PROVIDER).useValue(provider));
    pool = app.get<Pool>(PG_POOL);
    scheduler = app.get(AvatarGenerationScheduler);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AVATAR_STORAGE_DIR;
    await rm(storageDir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  const status = async (player: RegisteredTestPlayer): Promise<AvatarGenerationStatusView> =>
    (await http().get('/api/v1/avatar/generation').set('Authorization', player.authHeader).expect(200)).body.data;
  const upload = (player: RegisteredTestPlayer, options: { consent?: string | null; bytes?: Uint8Array; type?: string } = {}) => {
    const call = http().post('/api/v1/avatar/generation').set('Authorization', player.authHeader);
    if (options.consent !== null) call.field('consentVersion', options.consent ?? config.consentVersion);
    return call.attach('selfie', Buffer.from(options.bytes ?? pngBytes(800, 800)), {
      filename: 'kullanici/../../adi.png',
      contentType: options.type ?? 'image/png',
    });
  };
  const files = async (folder: string) => (existsSync(join(storageDir, folder)) ? readdir(join(storageDir, folder)) : []);
  const jobRow = async (jobId: string) =>
    (await pool.query('SELECT status, selfie_key, error_code FROM avatar_generation_jobs WHERE id = $1', [jobId])).rows[0];
  const model = (player: RegisteredTestPlayer) =>
    http().get('/api/v1/avatar/ai/model').set('Authorization', player.authHeader).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });

  /** İşi hazır olana kadar ilerletir (her tur bir adım). */
  async function runToReady(): Promise<void> {
    await scheduler.tickNow(); // requested → analyzing
    provider.states.set(provider.lastId(), { state: 'generating' });
    await scheduler.tickNow(); // analyzing → generating
    provider.states.set(provider.lastId(), { state: 'ready' });
    await scheduler.tickNow(); // generating → processing → ready
  }

  it('rıza yoksa 400; bozuk/küçük dosya 422 (SELFIE_REJECTED); dosya adı yol OLMAZ', async () => {
    const player = await registerTestPlayer(app, 'Selfie Doğrulama');
    expect((await upload(player, { consent: null }).expect(400)).body.error.code).toBe('AVATAR_CONSENT_REQUIRED');
    expect((await upload(player, { consent: 'eski-surum' }).expect(400)).body.error.code).toBe('AVATAR_CONSENT_REQUIRED');
    expect((await upload(player, { bytes: pngBytes(100, 100) }).expect(422)).body.error.code).toBe('SELFIE_REJECTED');
    expect((await upload(player, { bytes: new TextEncoder().encode('GIF89a..........') , type: 'image/gif' }).expect(422)).body.error.code).toBe('SELFIE_REJECTED');
    const rows = await pool.query('SELECT 1 FROM avatar_generation_jobs WHERE player_id = $1', [player.playerId]);
    expect(rows.rows).toHaveLength(0);
    expect(await files('selfies')).toHaveLength(0);
  });

  it('tam akış: istek (202) → zamanlayıcı → hazır; model sahibine; selfie silinir; ikinci etkin iş 409', async () => {
    const player = await registerTestPlayer(app, 'Selfie Akış');
    const selfie = pngBytes(900, 900);
    const job = (await upload(player, { bytes: selfie }).expect(202)).body.data;
    expect(job.status).toBe('requested');
    expect(await files('selfies')).toContain(`${job.id}.png`);
    expect((await upload(player).expect(409)).body.error.code).toBe('AVATAR_JOB_IN_PROGRESS');
    await model(player).expect(404);

    await runToReady();
    expect(Buffer.from(provider.received.at(-1)!).equals(Buffer.from(selfie))).toBe(true);
    expect(await jobRow(job.id)).toEqual({ status: 'ready', selfie_key: null, error_code: null });
    expect(await files('selfies')).not.toContain(`${job.id}.png`);
    const view = await status(player);
    expect(view.currentJob?.status).toBe('ready');
    expect(view.aiAvatar).not.toBeNull();
    const response = await model(player).expect(200);
    expect(response.headers['content-type']).toContain('model/gltf-binary');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect((response.body as Buffer).subarray(0, 4).toString()).toBe('glTF');

    // Başka bir oyuncu bu modeli alamaz (kendi avatarı yok → 404).
    const stranger = await registerTestPlayer(app, 'Selfie Yabancı');
    await model(stranger).expect(404);
  });

  it('yeniden üretim BAŞARISIZ → eski avatar korunur; başarılı → eski model dosyası silinir', async () => {
    const player = await registerTestPlayer(app, 'Selfie Yenileme');
    const first = (await upload(player).expect(202)).body.data;
    await runToReady();
    const firstModel = (await model(player).expect(200)).body as Buffer;

    // Sağlayıcı yüzü bulamadı.
    const failed = (await upload(player).expect(202)).body.data;
    await scheduler.tickNow();
    provider.states.set(provider.lastId(), { state: 'failed', reason: 'face not found' });
    await scheduler.tickNow();
    expect(await jobRow(failed.id)).toMatchObject({ status: 'failed', error_code: 'FACE_NOT_FOUND', selfie_key: null });
    expect(((await model(player).expect(200)).body as Buffer).equals(firstModel)).toBe(true);

    // Sağlayıcı bozuk bir dosya döndü.
    const broken = (await upload(player).expect(202)).body.data;
    await scheduler.tickNow();
    provider.results.set(provider.lastId(), { model: new TextEncoder().encode('bu bir model değil'), thumbnail: null });
    provider.states.set(provider.lastId(), { state: 'ready' });
    await scheduler.tickNow();
    expect((await jobRow(broken.id)).error_code).toBe('INVALID_MODEL');
    expect(((await model(player).expect(200)).body as Buffer).equals(firstModel)).toBe(true);

    // Başarılı yenileme: yeni model, eski dosya depodan silinir.
    const second = (await upload(player).expect(202)).body.data;
    await runToReady();
    expect(((await model(player).expect(200)).body as Buffer).equals(firstModel)).toBe(false);
    const models = await files('models');
    expect(models).toContain(`${second.id}.glb`);
    expect(models).not.toContain(`${first.id}.glb`);
  });

  it('iptal: sahibi iptal eder (selfie silinir, sağlayıcıya iletilir); başkası 404; zaman aşımı failed', async () => {
    const player = await registerTestPlayer(app, 'Selfie İptal');
    const other = await registerTestPlayer(app, 'Selfie Başkası');
    const job = (await upload(player).expect(202)).body.data;
    await scheduler.tickNow();
    await http().post(`/api/v1/avatar/generation/${job.id}/cancel`).set('Authorization', other.authHeader).expect(404);
    const cancelled = await http()
      .post(`/api/v1/avatar/generation/${job.id}/cancel`)
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    expect(provider.cancelled).toContain(provider.lastId());
    expect(await files('selfies')).not.toContain(`${job.id}.png`);

    const slow = (await upload(player).expect(202)).body.data;
    await scheduler.tickNow(new Date(Date.now() + (config.jobTimeoutMinutes + 1) * 60_000));
    expect(await jobRow(slow.id)).toMatchObject({ status: 'failed', error_code: 'TIMEOUT' });
  });

  it('gizlilik silmesi: AI avatar + işler + dosyalar gider; manuel avatar kalır', async () => {
    const player = await registerTestPlayer(app, 'Selfie Silme');
    const job = (await upload(player).expect(202)).body.data;
    await runToReady();
    const deleted = await http().delete('/api/v1/avatar/ai').set('Authorization', player.authHeader).expect(200);
    expect(deleted.body.data.deletedObjects).toBeGreaterThan(0);
    await model(player).expect(404);
    expect(await files('models')).not.toContain(`${job.id}.glb`);
    expect((await status(player)).currentJob).toBeNull();
    await http().get('/api/v1/avatar').set('Authorization', player.authHeader).expect(200);
  });

  it('hesap silinince AI avatar dosyaları ve kayıtları silinir', async () => {
    const player = await registerTestPlayer(app, 'Selfie Hesap');
    const job = (await upload(player).expect(202)).body.data;
    await runToReady();
    await http()
      .post('/api/v1/account/delete')
      .set('Authorization', player.authHeader)
      .send({ confirmUsername: player.username })
      .expect(200);
    expect(await files('models')).not.toContain(`${job.id}.glb`);
    const rows = await pool.query(
      'SELECT (SELECT COUNT(*) FROM avatar_generation_jobs WHERE player_id = $1)::int AS jobs, (SELECT COUNT(*) FROM player_ai_avatars WHERE player_id = $1)::int AS ai',
      [player.playerId],
    );
    expect(rows.rows[0]).toEqual({ jobs: 0, ai: 0 });
  });

  it('yönetim listesi: yönetici olmayan 403; yönetici görür, depo anahtarı/sağlayıcı iş kimliği YOK', async () => {
    const player = await registerTestPlayer(app, 'Selfie Liste');
    await upload(player).expect(202);
    await http().get('/api/v1/admin/avatar-jobs').set('Authorization', player.authHeader).expect(403);
    const admin = await registerTestPlayer(app, 'Selfie Yönetici');
    await pool.query('UPDATE players SET is_admin = true WHERE id = $1', [admin.playerId]);
    const list = (await http().get('/api/v1/admin/avatar-jobs').set('Authorization', admin.authHeader).expect(200)).body
      .data as Array<Record<string, unknown>>;
    const mine = list.find((row) => row.playerId === player.playerId)!;
    expect(mine).toMatchObject({ status: 'requested', provider: 'fake-3d', username: player.username });
    expect(Object.keys(mine).sort()).toEqual(
      ['createdAt', 'errorCode', 'finishedAt', 'id', 'playerId', 'provider', 'status', 'updatedAt', 'username'].sort(),
    );
  });
});
