import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadOnboardingConfig } from '@at-sevdalisi/game-config';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * 15.10.2026 — S6: "Sıradaki adım" (`GET /onboarding`). Adımlar mevcut
 * tablolardan türetilir; gerçek uçlarla bir iş yapılınca o adım tamamlanır ve
 * sıradaki adım ilerler. Kimlik yalnızca token'dan gelir.
 */
const CONFIG = loadOnboardingConfig();

describe('Sıradaki adım (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function onboarding(player: RegisteredTestPlayer) {
    const response = await request(app.getHttpServer())
      .get('/api/v1/onboarding')
      .set('Authorization', player.authHeader)
      .expect(200);
    return response.body.data as {
      steps: Array<{ key: string; done: boolean; href: string; title: string }>;
      completedCount: number;
      totalCount: number;
      nextKey: string | null;
    };
  }

  it('yeni oyuncu: config sırasıyla bütün adımlar, hiçbiri yapılmamış, sıradaki ilk adım', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'İlk Gün');
    const view = await onboarding(player);
    expect(view.steps.map((step) => step.key)).toEqual(CONFIG.steps.map((step) => step.key));
    expect(view.steps.every((step) => !step.done)).toBe(true);
    expect(view.completedCount).toBe(0);
    expect(view.totalCount).toBe(CONFIG.steps.length);
    expect(view.nextKey).toBe(CONFIG.steps[0]!.key);
  });

  it('gerçek bir bakım ve pratik yarış ilgili adımları tamamlar; sıradaki adım ilerler', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Adım Adım');
    await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/care`)
      .set('Authorization', player.authHeader)
      .send({ actionType: 'groom' })
      .expect(200);
    let view = await onboarding(player);
    expect(view.steps.find((step) => step.key === 'care')!.done).toBe(true);
    expect(view.nextKey).not.toBe('care');

    await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    view = await onboarding(player);
    expect(view.steps.find((step) => step.key === 'race')!.done).toBe(true);
    expect(view.completedCount).toBe(2);
    // Başka bir oyuncunun işi bu oyuncuya sayılmaz.
    const other = await registerTestPlayerWithStarterHorse(app, 'Başka Biri');
    expect((await onboarding(other)).completedCount).toBe(0);
  });

  it('kimlik doğrulanmadan 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/onboarding').expect(401);
  });
});
