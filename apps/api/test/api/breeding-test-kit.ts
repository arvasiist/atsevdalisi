import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { BREEDING_RANDOM, type BreedingRandomSource } from '../../src/application/ports/breeding.repository';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { BreedingScheduler } from '../../src/infrastructure/scheduler/breeding.scheduler';
import { bootstrapTestApp, type RegisteredTestPlayer } from './test-helpers';

/**
 * 16.10.2026 — çiftleştirme merkezi e2e kiti. Döllenme zarı ve tay cinsiyeti
 * `BREEDING_RANDOM` sağlayıcısından gelir; testte sırası belli bir kuyruğa
 * bağlanır (kuyruk boşsa 0 = döllenme TUTAR, cinsiyet ilk seçenek).
 * **Test kısayolu** — üretimde kriptografik kaynaktır.
 */
export class ScriptedBreedingRandom implements BreedingRandomSource {
  private readonly queue: number[] = [];

  push(...values: number[]): void {
    this.queue.push(...values);
  }

  next(): number {
    return this.queue.shift() ?? 0;
  }
}

export interface BreedingKit {
  app: INestApplication;
  pool: Pool;
  random: ScriptedBreedingRandom;
  scheduler: BreedingScheduler;
}

export async function bootstrapBreedingApp(): Promise<BreedingKit> {
  const random = new ScriptedBreedingRandom();
  const app = await bootstrapTestApp((builder) => builder.overrideProvider(BREEDING_RANDOM).useValue(random));
  return { app, pool: app.get<Pool>(PG_POOL), random, scheduler: app.get(BreedingScheduler) };
}

/**
 * Yetişkin (60 oyun ayı), emekli bir at yazar + `horse_stats`. Doğurganlık ve
 * sağlık verilebilir (döllenme olasılığını testte belirlemek için).
 * **Test kısayolu** — üretimde at kayıt, mağaza ya da doğumla gelir.
 */
export async function insertBreedingHorse(
  pool: Pool,
  ownerId: string,
  name: string,
  gender: 'mare' | 'stallion',
  options: { quality?: number; potential?: number; breed?: string; retired?: boolean; fertility?: number; health?: number } = {},
): Promise<string> {
  const horseId = randomUUID();
  const birthDate = new Date();
  birthDate.setMonth(birthDate.getMonth() - 60);
  const retired = options.retired ?? true;
  await pool.query(
    `INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, quality, potential, status, retired_at, fertility, health)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 = 'retired' THEN now() END, $10, $11)`,
    [
      horseId,
      ownerId,
      name,
      gender,
      options.breed ?? 'hinis',
      birthDate.toISOString().slice(0, 10),
      options.quality ?? 70,
      options.potential ?? 80,
      retired ? 'retired' : 'active',
      options.fertility ?? 70,
      options.health ?? 100,
    ],
  );
  await pool.query('INSERT INTO horse_stats (horse_id) VALUES ($1)', [horseId]);
  return horseId;
}

export async function setMoney(pool: Pool, playerId: string, money: number): Promise<void> {
  await pool.query('UPDATE players SET money = $2 WHERE id = $1', [playerId, money]);
}

export async function moneyOf(pool: Pool, playerId: string): Promise<number> {
  const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
  return Number(result.rows[0]!.money);
}

export function api(kit: BreedingKit, player: RegisteredTestPlayer) {
  const server = kit.app.getHttpServer();
  return {
    get: (path: string) => request(server).get(`/api/v1${path}`).set('Authorization', player.authHeader),
    post: (path: string, body: object = {}, idempotencyKey: string | null = randomUUID()) => {
      const call = request(server).post(`/api/v1${path}`).set('Authorization', player.authHeader);
      return (idempotencyKey ? call.set('Idempotency-Key', idempotencyKey) : call).send(body);
    },
    put: (path: string, body: object) => request(server).put(`/api/v1${path}`).set('Authorization', player.authHeader).send(body),
    delete: (path: string) => request(server).delete(`/api/v1${path}`).set('Authorization', player.authHeader),
  };
}
