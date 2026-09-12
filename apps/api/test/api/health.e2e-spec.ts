import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';

/**
 * FAZ 0 test altyapısı örneği: en basit uçtan uca (e2e) test.
 * npm install sonrası `npm run test` ile çalışır (bu ortamda npm registry
 * erişimi kısıtlı olduğundan çalıştırılamamıştır, bkz. ARCHITECTURE.md §9).
 *
 * FAZ 1 wiring (bu oturum, CI düzeltmesi): `describe`/`it`/`expect`/
 * `beforeAll`/`afterAll` artık AÇIKÇA `vitest`'ten içe aktarılıyor —
 * proje kök `vitest.config.ts`'i `globals: false` kullanıyor (diğer tüm
 * spec dosyaları zaten böyle yazılmıştı), bu dosya ise bu düzeltmeden
 * önce global fonksiyonlara güveniyordu. Bu, bu dosyanın hiçbir CI
 * çalıştırmasında GERÇEKTEN koşmamış olması (bkz. docs/ROADMAP.md "FAZ 1
 * wiring" — glob eşleşme kusuru) yüzünden fark edilmemiş, ikinci bir
 * gizli hataydı.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health (GET) servis ayakta olduğunu döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
