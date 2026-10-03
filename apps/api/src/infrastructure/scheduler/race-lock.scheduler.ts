import { SchedulerLeaderService } from './scheduler-leader';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { LockRaceUseCase, type LockDueRacesResult } from '../../application/use-cases/lock-race.use-case';
import { SettleDueRacesUseCase, type SettleDueRacesResult } from '../../application/use-cases/settle-due-races.use-case';
import { AppConfigService } from '../config/config.service';

/**
 * `startTime`ı gelmiş lobi yarışlarını periyodik olarak kilitleyen
 * zamanlayıcı (§42 PHASE 1, migration 0042).
 *
 * **30.09.2026 — ARTIK KESİNLEŞTİRİR DE.** Her tur iki adımdır: (1) vadesi
 * gelen `scheduled` yarışları kilitle (READY şartı burada uygulanır), (2)
 * `locking` yarışları kesinleştir (`SettleDueRacesUseCase`). İkinci adım
 * olmadan kilitlenen yarışların ödülü hiç dağıtılmıyordu. Sınıfın adı
 * geriye dönük uyum için korunmuştur.
 *
 * **PROJEDEKİ İLK ZAMANLAYICIDIR — ve bu yüzden kuralları burada yazılıdır.**
 * `race_starting` bildiriminin üreticisiz kalmasının ve "snapshot `startTime`
 * anında alınmıyor" açık penceresinin TEK sebebi, projede zamanla tetiklenen
 * hiçbir işin olmamasıydı. Bu sınıf o boşluğu kapatır.
 *
 * **BEŞ KARAR — her biri bir tuzak:**
 *
 * 1. **`setInterval` DEĞİL `setTimeout` ZİNCİRİ.** `setInterval` bir tur
 *    `tickSeconds`ten uzun sürerse turları ÜST ÜSTE bindirir; `async` bir
 *    geri çağrıda bu, aynı yarışların birden çok kez işlenmesi demektir.
 *    Zincir, bir sonraki turu ANCAK öncekisi bittiğinde kurar — yavaş bir
 *    tur hız kaybettirir, doğruluk kaybettirmez. (Kilitleme zaten idempotent
 *    olduğu için bu bir GÜVENLİK değil TASARRUF kararıdır; ama gereksiz
 *    yükü hiç üretmemek daha iyidir.)
 *
 * 2. **`unref()` ŞARTTIR.** Zamanlayıcı, Node sürecini ayakta TUTMAMALIDIR:
 *    `unref()` olmadan, kapanmakta olan bir süreç (test, CLI aracı, `npm
 *    run migrate`) açık bir zamanlayıcı yüzünden bekler.
 *
 * 3. **`NODE_ENV === 'test'` İKEN KAPALI.** e2e testler kilidi KENDİ
 *    kontrol etmelidir: `tick()`i elle çağırırlar. Arka planda kendi
 *    kendine koşan bir zamanlayıcı, testin kurulumu ile iddiası arasına
 *    girer ve CI'da RASTGELE düşen bir test üretirdi. **Bu, kilidin test
 *    edilmediği anlamına GELMEZ:** testler `tick()`i çağırdığı için
 *    çalışan kod yolu birebir aynıdır, yalnızca SAAT testin elindedir.
 *
 * 4. **YENİDEN GİRİŞ KİLİDİ (`isTicking`).** 1. maddedeki zincir bunu zaten
 *    engeller ama kilit İKİNCİ bir kapıdır: `tick()` PUBLIC'tir ve bir test
 *    ya da ileride bir yönetim ucu onu elle çağırabilir. İki eşzamanlı tur,
 *    kilit altında zaten zararsızdır (ikincisi `false` alır) — ama yine de
 *    gereksiz snapshot kurulumunu (at başına ~4 sorgu) üretmemek doğrudur.
 *
 * 5. **HATA YUTULUR, TUR ÖLMEZ.** `tick()` bir tur; tur içindeki hata
 *    (ör. veritabanı koptu) yakalanmazsa `async` geri çağrıda
 *    "unhandled rejection" olur ve Node sürümüne göre SÜRECİ ÖLDÜREBİLİR.
 *    Zamanlayıcının bir kez düşüp bir daha çalışmaması, kilitlenmeyen
 *    yarışlar demektir. Bu yüzden hata günlüklenir ve zincir DEVAM eder.
 *    (`LockRaceUseCase.execute` zaten yarış başına yakalar; buradaki
 *    yakalama TUR seviyesindedir — ör. `findRacesDueForLock` düşerse.)
 *
 * **`tick()` `void` DÖNER, `Promise` DEĞİL:** çağıranın beklemek zorunda
 * olmadığı bir iştir ve dönen sözü beklememek "unhandled rejection"
 * riskini doğurur. Bu yüzden söz YUTULUR ve içeride günlüklenir. Testler
 * beklemek isterse `tickNow()`u kullanır.
 */
/** Bir zamanlayıcı turunun sonucu: kilit adımı + kesinleşme adımı. */
export interface SchedulerTickResult extends LockDueRacesResult {
  settlement: SettleDueRacesResult;
}

@Injectable()
export class RaceLockScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RaceLockScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  /** `onModuleDestroy` sonrası kurulacak yeni turu engeller (kapanış yarışı). */
  private isStopped = false;

  constructor(
    @Inject(SchedulerLeaderService) private readonly leader: SchedulerLeaderService,
    @Inject(LockRaceUseCase) private readonly lockRaceUseCase: LockRaceUseCase,
    @Inject(SettleDueRacesUseCase) private readonly settleDueRacesUseCase: SettleDueRacesUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.raceLobby.lockScheduler.enabled) {
      this.logger.log('Yarış kilitleme zamanlayıcısı KAPALI (lockScheduler.enabled = false).');
      return;
    }
    if (this.config.env.nodeEnv === 'test') {
      // Gerekçe: sınıf doc yorumu, karar 3.
      this.logger.log('Yarış kilitleme zamanlayıcısı test ortamında kapalı; `tick()` elle çağrılmalıdır.');
      return;
    }
    this.scheduleNext();
    this.logger.log(
      `Yarış kilitleme zamanlayıcısı başladı (her ${this.config.raceLobby.lockScheduler.tickSeconds} sn).`,
    );
  }

  onModuleDestroy(): void {
    this.isStopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Tek tur — ATOMİK OLARAK TAMAMLANIR ve dönen söz BEKLENEBİLİR.
   *
   * Testlerin ve (ileride) bir yönetim ucunun gireceği kapı budur: `tick()`
   * ile aynı işi yapar ama sonucu döner. Yeniden giriş kilidi ORTAKTIR —
   * yani bir tur koşarken çağrılırsa `null` döner ve İKİNCİ bir tur
   * başlatmaz.
   */
  async tickNow(now: Date = new Date()): Promise<SchedulerTickResult | null> {
    if (this.isTicking) {
      return null;
    }
    this.isTicking = true;
    try {
      const result = await this.lockRaceUseCase.execute(now);
      if (result.locked.length > 0) {
        this.logger.log(`Kilitlenen yarışlar: ${result.locked.join(', ')}`);
      }
      // OTOMATİK KESİNLEŞME (30.09.2026) — kilidin ARDINDAN, aynı turda.
      // Bu adım olmadan kilitlenen yarışlar `locking`de kalıyor ve giriş
      // ücretleri havuzda süresiz bekliyordu (bkz. `SettleDueRacesUseCase`).
      // Aynı turda koşması, yeni kilitlenen yarışın da hemen kesinleşmesini
      // sağlar; önceki turlardan kalan (ör. süreç yeniden başladı) `locking`
      // yarışlar da burada toplanır.
      const settlement = await this.settleDueRacesUseCase.execute();
      if (settlement.settled.length > 0) {
        this.logger.log(`Kesinleşen yarışlar: ${settlement.settled.join(', ')}`);
      }
      return { ...result, settlement };
    } finally {
      // `finally` ŞARTTIR: `return`/`throw` yolunda da kilit bırakılmalıdır,
      // aksi hâlde tek bir hata zamanlayıcıyı KALICI olarak kilitlerdi
      // (bir daha hiçbir yarış kilitlenmez ve bunu hiçbir şey söylemez).
      this.isTicking = false;
    }
  }

  /** Ateşle-ve-unut turu — zamanlayıcının kendi kullandığı yol. */
  tick(): void {
    void this.tickNow().catch((error: unknown) => {
      // Gerekçe: sınıf doc yorumu, karar 5.
      this.logger.error(
        `Yarış kilitleme turu düştü: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /**
   * Bir sonraki turu kurar — `setTimeout` zinciri (karar 1) ve `unref`
   * (karar 2).
   *
   * `tickSeconds` config'ten gelir (CLAUDE.md kural 6 — sihirli sayı yok).
   * Saniye ölçeğindedir çünkü `startTime`in hassasiyeti saat ölçeğindedir;
   * daha sık koşmak yalnızca boş sorgu üretirdi.
   */
  private scheduleNext(): void {
    const delayMs = this.config.raceLobby.lockScheduler.tickSeconds * 1000;
    this.timer = setTimeout(() => {
      this.timer = null;
      // `tick()` hatayı kendi içinde yutar; buradaki `finally` benzeri akış
      // şu sırayla olur: tur biter → yeni tur kurulur. Turun bitişini
      // BEKLEMEK için `tickNow()`in sözü kullanılır.
      // Yalnızca lider örnek koşar (çok örnekte çift iş olmasın — `scheduler-leader.ts`).
      void this.leader
        .runIfLeader(() => this.tickNow())
        .catch((error: unknown) => {
          this.logger.error(
            `Yarış kilitleme turu düştü: ${error instanceof Error ? error.message : String(error)}`,
          );
        })
        .finally(() => {
          // Kapanış yarışı: `onModuleDestroy` bu tur koşarken çağrıldıysa
          // YENİ tur KURULMAZ (aksi hâlde kapanan bir modül sonsuza kadar
          // kendini yeniden programlardı).
          if (!this.isStopped) {
            this.scheduleNext();
          }
        });
    }, delayMs);
    // Gerekçe: sınıf doc yorumu, karar 2.
    this.timer.unref?.();
  }
}
