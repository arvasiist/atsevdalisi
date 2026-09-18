import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { AppConfigService } from '../config/config.service';

export const PG_POOL = Symbol('PG_POOL');

/**
 * Birden fazla ifadeyi tek bir atomik işlemde çalıştırır (BEGIN/COMMIT,
 * hata durumunda ROLLBACK). FAZ 1 wiring, dördüncü dilim (bu oturum) —
 * ilk kullanım: `PostgresHorseRepository.save()` (bir at ve ona ait
 * `horse_stats` satırının BİRLİKTE var olması gerekir, bkz.
 * docs/ROADMAP.md "Dördüncü dilim: Antrenman"). `pool.query(...)` yerine
 * AYNI bağlantı (`PoolClient`) üzerinden çalışır — aksi halde her `query()`
 * çağrısı havuzdan farklı bir bağlantı alabileceğinden `BEGIN`/`COMMIT`
 * ayrı bağlantılara gidebilir ve transaction hiçbir şeyi kapsamaz.
 */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  // CI #100 kırmızısının GERÇEK kök nedeni (bu oturum, izolasyon 3/3 sonrası
  // bulundu) — `pool.on('error', ...)` (bkz. bu dosyanın altındaki
  // `PG_POOL` factory yorumu) YALNIZCA havuzda BOŞTA bekleyen client'ların
  // 'error' event'ini yutar (node-postgres README "Pool" — pool bunu
  // SADECE idle client'lar için VEKALETEN dinler). `pool.connect()` ile
  // ÇIKARILMIŞ (checked-out) bir client, kullanımda olduğu SÜRECE bu
  // vekaletin KAPSAMI DIŞINDADIR — KENDİ 'error' dinleyicisi olmalıdır,
  // yoksa Node'un EventEmitter kuralı (dinleyicisiz 'error' → fırlatılan
  // exception) devreye girer ve backend bağlantıyı resetlediğinde (ör.
  // n=50/100 GERÇEK eşzamanlı yük altında, n=10'da neredeyse hiç
  // gözlenmeyen ama n arttıkça olasılığı artan bir ECONNRESET) TÜM
  // worker thread'i çökertir — gözlemlenen "Error: read ECONNRESET" +
  // ardından `afterAll`'daki `app.close()`'un (çöken client hiçbir zaman
  // aşağıdaki `finally`'ye ulaşıp `release()` çağıramadığından `pool.end()`
  // sonsuza dek bekler) 10000ms'de "Hook timed out" ile patlaması TAM
  // OLARAK bu ikili belirtiyle örtüşür. Dinleyici eklemek, sorguyu
  // BEKLEYEN promise'in (`client.query(...)`) yine de normal şekilde
  // reddedilmesini ENGELLEMEZ — sadece EventEmitter'ın kendi başına
  // sürecı çökertmesini önler; asıl hata aşağıdaki `catch`'e düzgünce
  // düşer.
  client.on('error', () => undefined);
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    client.release();
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Bağlantı zaten kopmuşsa (ör. ECONNRESET) ROLLBACK'in KENDİSİ de
      // başarısız olur — bu ikincil hata asıl hatayı MASKELEMEMELİDİR,
      // bilerek yutulur (asıl hata aşağıda zaten fırlatılıyor).
    }
    // Bozuk olabilecek bir client'ı `release()`'e hata VERMEDEN
    // çağırmak, onu havuzun BOŞTA bekleyen dizisine GERİ KOYAR — bir
    // SONRAKİ tamamen alakasız isteğin ÖLÜ bir bağlantı almasına ve AYNI
    // ECONNRESET'i zincirleme tetiklemesine yol açabilir (node-postgres
    // README "Client#release" — `release(err)` çağrısı havuza bu
    // client'ı ATMASINI, yeniden KULLANMAMASINI söyler).
    client.release(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * CI #93/#94 kırmızı araştırması (bu oturum) — ham `pg.Pool` nesnesinin
 * KENDİ Nest yaşam döngüsü kancası (`onModuleDestroy`) YOKTUR. Bu yüzden
 * her e2e test dosyasının `afterAll`'da çağırdığı `app.close()`, o
 * dosyanın `bootstrapTestApp()` ile açtığı havuzun TCP bağlantılarını
 * ASLA kapatmıyordu — 11 e2e dosyası `--no-file-parallelism` ile AYNI
 * Vitest süreci içinde sırayla çalıştığından, her dosyanın sızan
 * bağlantıları BİRİKİYORDU. T1 (bu oturum) n=50/100 GERÇEK eşzamanlı
 * istek içeren yeni testler eklemeden önce her dosya en fazla birkaç
 * bağlantı açıyordu (fark edilmeyecek kadar küçük bir sızıntı); T1
 * testleri artık 3 dosyada `max: 10`'a kadar GERÇEKTEN dolduruyor —
 * CI'daki `postgres:16-alpine` servis konteynerinin `max_connections`
 * sınırına (varsayılan 100) toplam sızıntının yaklaşması/dayanması,
 * sıradaki bir e2e dosyasının İLK sorgusunda "sorry, too many clients
 * already" ile HIZLI ve tutarlı şekilde patlamasına yol açabilir — bu da
 * gözlemlenen belirtiyle (Test adımı yavaş bir timeout DEĞİL, hızlı ve
 * istikrarlı şekilde exit code 1 ile başarısız oluyor, iki koşuda da
 * neredeyse AYNI kısa sürede) tam olarak örtüşüyor. `PgPoolLifecycle`
 * bunu `onModuleDestroy`'da GERÇEKTEN kapatarak giderir.
 */
@Injectable()
class PgPoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * PostgreSQL connection pool. Domain katmanı bu modülü asla doğrudan
 * import etmez (bkz. docs/ARCHITECTURE.md §4); sadece Infrastructure
 * katmanındaki repository implementasyonları kullanır.
 *
 * Kritik işlemler (para, mülkiyet) için transaction/row-locking kuralları
 * docs/SECURITY.md §5'te tanımlıdır.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const pool = new Pool({
          connectionString: config.env.databaseUrl,
        });
        // CI #95 kırmızı (bu oturum, devam eden araştırma) — `pg.Pool` bir
        // EventEmitter'dır ve havuzdaki BOŞTA bekleyen (idle) bir client'ın
        // bağlantısı backend tarafından KOPARSA (örn. yoğun n=50/100
        // eşzamanlı yük altında Postgres'in bir bağlantıyı sonlandırması)
        // `'error'` event'i yayınlar. Node'un KENDİ kuralı: bir
        // EventEmitter'ın 'error' için HİÇBİR dinleyicisi yoksa, bu event
        // fırlatılan bir exception'a dönüşür ve TÜM SÜRECİ (dolayısıyla
        // tüm Vitest çalışmasını, henüz çalışmamış test dosyaları dahil)
        // ÇÖKERTİR — bu da gözlemlenen "Test adımı hızlı ve istikrarlı
        // şekilde exit code 1" belirtisiyle örtüşen, iyi belgelenmiş bir
        // node-postgres tuzağıdır (bkz. node-postgres README "Pool" başlığı
        // altındaki resmi uyarı). Dinleyici eklemek bu event'i sessizce
        // yutar (havuz zaten arka planda o client'ı düşürüp gerektiğinde
        // yenisini açar) — sürecin çökmesini ÖNLER.
        pool.on('error', () => undefined);
        return pool;
      },
    },
    PgPoolLifecycle,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
