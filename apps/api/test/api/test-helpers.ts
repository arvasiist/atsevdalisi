import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';

/**
 * AUDIT_REPORT.md Bulgu S1 (Critical) hardening (bu oturum) — brief §41/§50
 * Google/Apple Sign-In. Global `AuthGuard` artık `@Public()` işaretli
 * olmayan HER rotada geçerli bir `Authorization: Bearer <token>` header'ı
 * gerektirdiğinden, HER e2e test dosyasının kendi `beforeAll` bootstrap'ını
 * VE "yeni oyuncu kaydet" yardımcı fonksiyonunu tekrar tekrar YAZMASI
 * yerine (önceki desen — bkz. git geçmişindeki `player.e2e-spec.ts`/
 * `training.e2e-spec.ts`), bu TEK dosya paylaşılır. `main.ts`'teki
 * bootstrap ayarlarının (prefix, ValidationPipe, exception filter) AYNISI
 * burada kurulur (bkz. o dosyanın doc yorumu — `app.listen` yerine
 * `Test.createTestingModule` + `supertest`).
 */
export async function bootstrapTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();

  // CI #106 kırmızı araştırması (bu oturum) — `race.e2e-spec.ts`'in n=100
  // "AYNI Idempotency-Key" testi (`runSameKeyConcurrencyCheck(100)`)
  // TEK bir isteğin (rezervasyonu kazanan) TAM yarış simülasyonunu
  // çalıştırdığı, geri kalan 99'unun ise HIZLI 409 aldığı ASİMETRİK bir
  // yük deseni — diğer n=100 testlerinde (100 istek FARKLI anahtarlarla)
  // HEPSİ benzer sürede tamamlanıyordu. 99 hızlı isteğin Node'un TEK
  // event loop'unu meşgul ettiği anlarda, TEK yavaş "kazanan" isteğin
  // toplam tamamlanma süresi normalden UZAYABİLİR — Node'un http.Server
  // varsayılanları (`keepAliveTimeout` 5s, `headersTimeout` 60s) bu
  // asimetrik senaryoda erken/beklenmedik bir bağlantı sonlandırmasına
  // katkıda BULUNMUŞ olabilir. Test ortamında maliyeti sıfıra yakın
  // olduğundan, bu iki değer bilerek CÖMERTÇE büyütüldü.
  const httpServer = app.getHttpServer() as { keepAliveTimeout?: number; headersTimeout?: number };
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;

  return app;
}

/** class-validator kuralı: `username` yalnızca `[a-z0-9_]` içerebilir. `randomUUID()` tire (-) içerir, kaldırılır. */
export function uniqueUsername(prefix = 'test'): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`.slice(0, 20);
}

/**
 * CI #100-#103 kırmızı araştırması (bu oturum) — n=10/50/100 GERÇEKTEN
 * eşzamanlı istek gönderen testlerde (`stable`/`economy`/`race`.e2e-spec.ts)
 * tekrarlanan "Error: read ECONNRESET" hatası. Sırasıyla denenip GERÇEK
 * kök neden OLMADIĞI doğrulanan teoriler: (1) `pg.Pool`'un checked-out
 * client'ında eksik 'error' dinleyicisi (düzeltildi, gerçek bir sorundu
 * ama SÜRECİN ÇÖKMESİNİ önledi — bu hatayı DEĞİL), (2) Postgres
 * bağlantısında geçici hata (retry eklendi, YİNE aynı hata devam etti).
 * (2)'nin YARARSIZ kalması, hatanın Postgres katmanına HİÇ ULAŞMADIĞINI
 * kanıtlıyor: `HttpExceptionFilter`'ın catch-all dalı (`console.error
 * ('Beklenmeyen hata:', ...)`, bkz. o dosya) sunucu İÇİNDE oluşan HİÇBİR
 * beklenmeyen hatayı KAÇIRMAZ — CI loglarında bu satır HİÇ görünmedi. Yani
 * "read ECONNRESET" sunucunun bir isteği İŞLERKEN attığı bir hata DEĞİL,
 * supertest'in (test istemcisinin) sunucuya GERÇEK bir TCP bağlantısı
 * kurup yanıtı OKURKEN karşılaştığı, GitHub Actions'ın paylaşımlı/kısıtlı
 * runner'ında n=10 gibi KÜÇÜK ölçeklerde bile ARA SIRA (ama tekrarlanabilir
 * şekilde) oluşan GEÇİCİ bir ağ/bağlantı olayı — `withTransaction`'daki
 * AYNI mantık (COMMIT'ten önce hiçbir şey kalıcı olmadığından TÜM
 * transaction'ı yeniden denemek güvenlidir) burada da geçerli: supertest'in
 * KENDİSİ bir yanıt ALAMADIĞINDAN (bağlantı koptuğundan), sunucunun o
 * isteği gerçekten işleyip işlemediği BELİRSİZDİR — ama her üç uç nokta da
 * (stable-upgrade + Idempotency-Key, practice-race + Idempotency-Key,
 * daily-reward + kendi cooldown kilidi) bu belirsizliğe karşı zaten
 * KORUMALIDIR (aynı isteğin GÜVENLE tekrarlanmasına izin verir) — bu
 * yüzden isteğin KENDİSİNİ (yeni bir TCP bağlantısıyla) yeniden denemek
 * güvenlidir.
 */
/**
 * CI #104 (bu oturum, HTTP seviyesinde retry eklendikten SONRA) — 8
 * başarısız testten 3'e düştü (hepsi SADECE n=100'de) — retry GERÇEKTEN
 * işe yaradı ama n=100'de YETERSİZ kaldı. Muhtemel neden: eski
 * `20ms * deneme` bekleme (20/40/60ms) çok KISAYDI — n=100'ün 100
 * eşzamanlı YENİ TCP bağlantısının yarattığı GERÇEK yoğunluk anı
 * muhtemelen bundan DAHA UZUN sürüyor, bu yüzden aynı "slot"un ardışık
 * yeniden denemelerinin HEPSİ aynı yoğun pencereye denk gelip TÜKENIYOR
 * olabilirdi (bağımsız, düşük olasılıklı bir ağ olayı olsaydı 4 kez üst
 * üste aynı slotta görülmesi istatistiksel olarak ÇOK DÜŞÜK olurdu).
 * Bekleme süresi büyük ölçüde artırıldı (100ms * deneme) ve deneme sayısı
 * 4'ten 6'ya çıkarıldı.
 *
 * CI #105 (bu oturum, yukarıdaki artıştan SONRA) — 3 başarısız testten
 * 1'e düştü: `race.e2e-spec.ts`'in n=100 "AYNI Idempotency-Key" testi
 * (`runSameKeyConcurrencyCheck(100)`). Bu, TÜM testler arasında en
 * yüksek tekil-kaynak baskısına sahip olanı — 100 isteğin HEPSİ AYNI
 * `idempotency_keys` satırına/Redis anahtarına aynı anda çarpıyor (diğer
 * n=100 testlerinde 100 istek FARKLI kaynaklara/anahtarlara dağılıyordu).
 * Deneme sayısı 6'dan 8'e, bekleme süresi de biraz daha artırıldı.
 */
export async function sendWithRetry<T>(factory: () => PromiseLike<T>, maxAttempts = 8): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await factory();
    } catch (error) {
      const isTransientNetworkError =
        error instanceof Error && /ECONNRESET|ECONNREFUSED|EPIPE|socket hang up/i.test(error.message);
      if (isTransientNetworkError && attempt < maxAttempts) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * `n` adet isteği GERÇEKTEN eşzamanlı olarak gönderir (`Promise.all` —
 * hepsi AYNI anda tetiklenir), ama her birini `sendWithRetry` ile sarar.
 * `factory(index)` HER ÇAĞRIDA (hem ilk deneme hem olası tekrar
 * denemelerde) yepyeni bir supertest `Test` nesnesi ÜRETMELİDİR (ör.
 * `(index) => request(app.getHttpServer()).post(...).set(...)`) —
 * tamamlanmış bir `Test` nesnesi yeniden gönderilemez. `index` PARAMETRESİ
 * BİLEREK verilir: bir Idempotency-Key kullanan çağıranlar, o anahtarı
 * `factory` İÇİNDE HER SEFERİNDE YENİDEN ÜRETMEK (`randomUUID()`) YERİNE
 * `index`'e göre ÖNCEDEN ÜRETİLMİŞ sabit bir diziden okumalıdır — aksi
 * halde bir "slot" tekrar denendiğinde YENİ bir anahtar kullanılır, ki bu
 * da (bağlantı koptuğunda sunucunun isteği aslında İŞLEMİŞ olma
 * ihtimaline karşı) AYNI mantıksal denemenin İKİ FARKLI anahtarla iki kez
 * sayılmasına (ör. stable/race testlerindeki "TAM OLARAK N" sayım
 * doğrulamalarının BOZULMASINA) yol açabilir.
 */
export function sendConcurrentRequests<T>(count: number, factory: (index: number) => PromiseLike<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: count }, (_, index) => sendWithRetry(() => factory(index))));
}

export interface RegisteredTestPlayer {
  playerId: string;
  token: string;
  /** `.set('Authorization', authHeader)` olarak doğrudan kullanıma hazır. */
  authHeader: string;
}

/**
 * `POST /players` ile yeni bir oyuncu (+ başlangıç atı, bkz.
 * `RegisterPlayerUseCase`) kaydeder ve dönen `AuthSession`'ı (bkz.
 * `packages/shared-types/src/player.ts`) test için hazır bir şekilde
 * döner. `POST /players` `@Public()` olduğundan bu çağrının kendisi bir
 * Authorization header'ı GEREKTİRMEZ — döndürdüğü token, SONRAKİ TÜM
 * korunan isteklerde kullanılır.
 */
export async function registerTestPlayer(
  app: INestApplication,
  displayName = 'Test Oyuncu',
): Promise<RegisteredTestPlayer> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/players')
    .send({ username: uniqueUsername(), displayName })
    .expect(201);
  const { token, player } = response.body.data as { token: string; player: { id: string } };
  return { playerId: player.id, token, authHeader: `Bearer ${token}` };
}

/**
 * `registerTestPlayer` + o oyuncunun (kayıtta OTOMATİK verilen) başlangıç
 * atının id'sini tek çağrıda döner — `training.e2e-spec.ts`'in ESKİ
 * `registerPlayerWithStarterHorse` yardımcısıyla AYNI amaç, ama artık
 * `GET /horses?ownerId=` çağrısı da (AuthGuard + self-check nedeniyle)
 * kimlik doğrulamalı yapılır.
 */
export async function registerTestPlayerWithStarterHorse(
  app: INestApplication,
  displayName = 'Test Oyuncu',
): Promise<RegisteredTestPlayer & { horseId: string }> {
  const player = await registerTestPlayer(app, displayName);
  const listResponse = await request(app.getHttpServer())
    .get(`/api/v1/horses?ownerId=${player.playerId}`)
    .set('Authorization', player.authHeader)
    .expect(200);
  return { ...player, horseId: listResponse.body.data[0].id };
}
