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
/**
 * CI #101 kırmızısı (bu oturum, checked-out client 'error' dinleyicisi
 * eklendikten SONRA) — o düzeltme süreç çökmesini gerçekten ÖNLEDİ (artık
 * 508 testin TAMAMI çalışıp düzgün bir özetle bitiyor, önceki gibi
 * yarıda KESİLMİYOR) ama ALTTAKİ "read ECONNRESET" GERÇEK bir bağlantı
 * kopması olduğundan hâlâ o TEK isteği başarısız kılıyor. Dikkat çekici
 * yeni veri: `economy.e2e-spec.ts`'in n=10'u BİLE etkilendi (`stable`'ın
 * İZOLE n=10'u CI #99'da tertemiz geçmişti) — yani bu, "yalnızca ÇOK
 * BÜYÜK n'de olur" DEĞİL, GitHub Actions'ın paylaşımlı/kısıtlı runner'ında
 * (Postgres servis konteynerine `localhost` üzerinden bağlanan) HERHANGİ
 * bir gerçek eşzamanlı bağlantı patlamasında ARA SIRA (ama tekrarlanabilir
 * şekilde) oluşabilen GEÇİCİ bir ağ olayı. Üretim ortamında da (bulut
 * sağlayıcılar arası bağlantılar, kısa kesintiler) AYNI sınıf hata
 * gerçekleşebilir — bu yüzden doğru çözüm "neden hiç olmasın" değil,
 * "geçici bir bağlantı hatasında GÜVENLE yeniden dene"dir: `fn` (SELECT
 * FOR UPDATE + saf hesaplama + yazma) hiçbir şeyi COMMIT'ten ÖNCE kalıcı
 * hale getirmez, bu yüzden TÜM transaction'ı yepyeni bir bağlantıyla
 * baştan denemek güvenlidir (yarım kalan bir yazma RİSKİ YOKTUR).
 */
const TRANSIENT_CONNECTION_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
]);

function isTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (code && TRANSIENT_CONNECTION_ERROR_CODES.has(code)) {
    return true;
  }
  return /connection terminated|terminating connection|read ECONNRESET|write ECONNRESET/i.test(error.message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_TRANSACTION_ATTEMPTS = 3;

export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
    let client: PoolClient;
    try {
      // CI #102 kırmızısı (bu oturum, retry eklendikten SONRA da devam
      // etti) — bu satır ÖNCEKİ sürümde `try` bloğunun DIŞINDAYDI: eğer
      // `pool.connect()`'in KENDİSİ (henüz bir client bile elde
      // edilmeden, yeni bir fiziksel bağlantı KURULURKEN) geçici bir ağ
      // hatasıyla reddederse, bu retry döngüsünün TAMAMINI atlayıp
      // `withTransaction`'dan doğrudan fırlıyordu — retry mantığı SADECE
      // client alındıktan SONRAKİ hatalar için çalışıyordu. Şimdi
      // `pool.connect()` da retry kapsamına alındı.
      client = await pool.connect();
    } catch (error) {
      if (isTransientConnectionError(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
        lastError = error;
        await delay(25 * attempt);
        continue;
      }
      throw error;
    }
    // CI #100 kırmızısının GERÇEK kök nedeni (bu oturum, izolasyon 3/3
    // sonrası bulundu) — `pool.on('error', ...)` (bkz. bu dosyanın
    // altındaki `PG_POOL` factory yorumu) YALNIZCA havuzda BOŞTA bekleyen
    // client'ların 'error' event'ini yutar (node-postgres README "Pool" —
    // pool bunu SADECE idle client'lar için VEKALETEN dinler).
    // `pool.connect()` ile ÇIKARILMIŞ (checked-out) bir client, kullanımda
    // olduğu SÜRECE bu vekaletin KAPSAMI DIŞINDADIR — KENDİ 'error'
    // dinleyicisi olmalıdır, yoksa Node'un EventEmitter kuralı
    // (dinleyicisiz 'error' → fırlatılan exception) devreye girer ve
    // backend bağlantıyı resetlediğinde TÜM worker thread'i çökertir.
    // Dinleyici eklemek, sorguyu BEKLEYEN promise'in (`client.query(...)`)
    // yine de normal şekilde reddedilmesini ENGELLEMEZ — sadece
    // EventEmitter'ın kendi başına süreci çökertmesini önler; asıl hata
    // aşağıdaki `catch`'e düzgünce düşer.
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
        // bilerek yutulur (asıl hata aşağıda zaten fırlatılıyor/denenıyor).
      }
      // Bozuk olabilecek bir client'ı `release()`'e hata VERMEDEN
      // çağırmak, onu havuzun BOŞTA bekleyen dizisine GERİ KOYAR — bir
      // SONRAKİ tamamen alakasız isteğin ÖLÜ bir bağlantı almasına ve AYNI
      // ECONNRESET'i zincirleme tetiklemesine yol açabilir (node-postgres
      // README "Client#release" — `release(err)` çağrısı havuza bu
      // client'ı ATMASINI, yeniden KULLANMAMASINI söyler).
      client.release(error instanceof Error ? error : new Error(String(error)));

      if (isTransientConnectionError(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
        lastError = error;
        // Sabit küçük bir bekleme (havuzun yeni/temiz bir bağlantı
        // hazırlaması ve anlık ağ dalgalanmasının geçmesi için) — n=50/100
        // testlerinin AÇIK timeout'ları (15-60s) bu birkaç x10ms'lik
        // bekleme(ler)i rahatlıkla karşılar.
        await delay(25 * attempt);
        continue;
      }
      throw error;
    }
  }
  // Buraya asla ulaşılmaz (döngü ya `return` eder ya `throw` eder) —
  // TypeScript'in "not all code paths return a value" uyarısını
  // susturmak için, son denemenin hatasını fırlatır.
  throw lastError;
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
          // AUDIT_AND_HARDENING (bu oturum, `withTransaction` retry
          // düzeltmesiyle BİRLİKTE) — node-postgres'in varsayılanı
          // `max: 10`'dur. n=50/100 GERÇEK eşzamanlı testlerde 10
          // bağlantı, aynı satırın `FOR UPDATE` kilidini bekleyen
          // istekler tarafından hızla DOLDURULUP geri kalan onlarca
          // isteği havuzun KENDİ kuyruğunda beklemeye zorluyordu — bu
          // TEK BAŞINA bir hataya yol açmaz, ama kuyruktaki bekleme
          // süresini/gerçek eşzamanlı bağlantı sayısını gereksiz yere
          // artırarak GEÇİCİ ağ hatalarına (bkz. `withTransaction`
          // yorumu) maruz kalma PENCERESİNİ büyütür. 20, CI'daki
          // `postgres:16-alpine`'ın varsayılan `max_connections`
          // (100) sınırının hâlâ ÇOK altında.
          max: 20,
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
