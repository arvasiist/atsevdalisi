import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ClaimDailyRewardUseCase } from '../../src/application/use-cases/claim-daily-reward.use-case';
import { FeedHorseUseCase } from '../../src/application/use-cases/feed-horse.use-case';
import { AppModule } from '../../src/app.module';

/**
 * ## Neden bu test var (27.09.2026 — gerçek bir CI arızasından sonra)
 *
 * "Yem sistemi" dilimi `FeedHorseUseCase`'e ve `ClaimDailyRewardUseCase`'e
 * YENİ bir bağımlılık (`FEED_INVENTORY_REPOSITORY`) ekledi, ama provider
 * kayıtları eski modüllerde (`CareModule`, `EconomyModule`) kaldı. Sonuç:
 * Nest bu iki use-case'i HİÇ çözemedi, dolayısıyla `AppModule`'ü bootstrap
 * eden **17 e2e dosyasının tamamı** düştü.
 *
 * Arızanın BELİRTİSİ son derece yanıltıcıydı: CI annotation'larında görünen
 * tek şey 10 dosyanın `afterAll`'ında
 * `TypeError: Cannot read properties of undefined (reading 'close')`
 * olmasıydı — yani hata bir "teardown" sorunu gibi görünüyordu. Gerçek
 * nedeni ise `beforeAll`'daki DI çözümlemesiydi (`app` hiç oluşmadığı için
 * `afterAll` ikincil bir hataya düşüyordu).
 *
 * NEDEN BİRİM TESTLER YAKALAMADI: modül grafiği yalnızca
 * `Test.createTestingModule(...).compile()` sırasında kurulur. O ana kadar
 * koşan hiçbir domain/uygulama testi bu grafiğe dokunmuyordu — yani hata
 * SINIF OLARAK "yalnızca CI'da çıkan" türdendi (bkz. CLAUDE.md'deki
 * `@Inject()` tuzağının kardeşi).
 *
 * BU TEST O BOŞLUĞU KAPATIR: `AppModule`'ün DI grafiğini `.compile()` ile
 * kurar. `.init()` ÇAĞIRILMAZ — böylece PostgreSQL/Redis'e HİÇ bağlanılmaz
 * (bağlantılar `onModuleInit`/ilk sorguda açılır), test yerelde de
 * koşabilir. Yani bu, projenin "e2e yerelde koşamaz" kısıtından MUAF olan,
 * ama tam olarak e2e'yi kıran hatayı yakalayan bir testtir.
 *
 * KAPSAM SINIRI (dürüstçe): bu test yalnızca "her sağlayıcı çözülebiliyor
 * mu" sorusunu cevaplar. Çalışma zamanı davranışını, SQL'i, HTTP
 * sözleşmelerini veya iş mantığını DOĞRULAMAZ — onlar için hâlâ gerçek
 * e2e/CI gerekir.
 */
describe('AppModule — DI grafiği (birim, altyapı GEREKTİRMEZ)', () => {
  it('AppModule tüm sağlayıcılarıyla eksiksiz kurulur (eksik provider/yanlış modül kapsamı yok)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    // `compile()` çözülemeyen bir bağımlılıkta zaten fırlatır; buraya
    // gelindiyse grafik sağlamdır. Aşağıdaki iki kontrol ise "boş ama
    // hatasız" bir yanlış-pozitifi engeller: arızanın GERÇEKLEŞTİĞİ iki
    // use-case, modül kapsamları DIŞINDAN da çözülebilmeli
    // (`strict: false` — token'ı sağlayan modül, çağıranın kendi modülü
    // olmayabilir; `CareModule`/`EconomyModule` vakasında tam olarak bu).
    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(FeedHorseUseCase, { strict: false })).toBeInstanceOf(FeedHorseUseCase);
    expect(moduleRef.get(ClaimDailyRewardUseCase, { strict: false })).toBeInstanceOf(ClaimDailyRewardUseCase);

    // Sızıntı yok: `DatabaseModule`'ün `PgPoolLifecycle`'ı ve
    // `RedisModule`'ün `RedisClientLifecycle`'ı burada kapanır
    // (`pool.end()` / `redis.disconnect()`) — ikisi de bağlantı kurmadan
    // güvenle çağrılabilir.
    await moduleRef.close();
  });
});
