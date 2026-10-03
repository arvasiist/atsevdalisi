import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { checkRaceLockable } from '../../domain/race/lobby';
import { RACE_ENGINE_VERSION, RACE_RULESET_VERSION } from '../../domain/race/race-engine';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { EntrantSnapshotBuilder } from '../services/entrant-snapshot.builder';
import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

/** Bir turda kilitlenen / atlanan yarışların özeti — çağıran günlükler. */
export interface LockDueRacesResult {
  /** `scheduled`dan `locking`e gerçekten geçen yarışlar. */
  locked: string[];
  /** Bakıldı ama kilitlenmeyenler (yarış yok / durum uygun değil / kadro değişti). */
  skipped: { raceId: string; reason: string }[];
}

/**
 * `startTime`ı gelmiş lobi yarışlarını `locking`e geçirir ve O ANI
 * DONDURUR (§42 PHASE 1, migration 0042).
 *
 * **BU USE-CASE'İN TEK İŞİ VAR: YARIŞI ADİL HÂLE GETİRMEK.** Öncesinde
 * kesinleşme (`SettleRaceUseCase`) snapshot'ı ve seed'i KOŞMA anında
 * üretiyordu; o an `startTime`dan saniyeler/dakikalar sonra olabildiği
 * için, oyuncu `startTime` ile kesinleşme arasında atını eğitip sonucu
 * etkileyebiliyordu. Artık dondurma `startTime`a en yakın anda yapılır.
 *
 * **ZAMANLAYICI DEĞİLDİR — TETİKLENMEZ.** Bu sınıf "şimdi kilitlenecek
 * ne var" sorusunu SORAR ve cevaplar; ne zaman sorulacağı
 * `RaceLockScheduler`ın işidir. Ayrım bilinçlidir: bu sayede e2e testler
 * gerçek kodu koştururken SAATİ kendileri kontrol eder (zamanlayıcıyı
 * `NODE_ENV=test` altında kapatıp `tick()`i elle çağırarak) — uyku/yarış
 * koşulu içeren bir test, CI'da rastgele düşen bir test olurdu.
 *
 * **TEK YARIŞIN HATASI TURU DÜŞÜRMEZ.** `execute` her yarışı kendi
 * `try`/`catch`i içinde işler: bir yarışın bozuk verisi (ör. atı silinmiş
 * bir katılım satırı → `HorseNotFoundError`) diğer yarışların
 * kilitlenmesini engellememelidir. Aksi hâlde tek bir bozuk satır TÜM
 * lobiyi kilitler ve para havuzları kalıcı olarak kilitlenirdi.
 *
 * **KİLİTLENEMEYEN YARIŞ SESSİZCE ATLANIR — ve bu bilinçlidir.** Sebep
 * ayrımı (`RaceLockRejection`) yalnızca GÜNLÜĞE yazılır, davranışı
 * değiştirmez; her durumda yapılacak şey aynıdır: hiçbir şey. Ama
 * günlüklenir, çünkü "kilitlenmedi" durumunun beklenmedik bir sebebi
 * (ör. `startTime` geçmiş ama durum hâlâ `scheduled` DEĞİL) sessiz
 * kalırsa fark edilmesi imkânsız olurdu.
 */
@Injectable()
export class LockRaceUseCase {
  private readonly logger = new Logger(LockRaceUseCase.name);

  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(EntrantSnapshotBuilder) private readonly entrantSnapshotBuilder: EntrantSnapshotBuilder,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * Bir tur: `now` anında kilitlenmesi gereken yarışları bulur ve
   * kilitler. `now` PARAMETREDİR (içeride `new Date()` çağrılmaz) —
   * determinizm ve test edilebilirlik; `SettleRaceUseCase`in aksine burada
   * saat gerçekten dışarıdan gelmelidir çünkü kilit kararı saate bağlıdır.
   */
  async execute(now: Date): Promise<LockDueRacesResult> {
    const dueIds = await this.raceRepository.findRacesDueForLock({
      now,
      limit: this.config.raceLobby.lockScheduler.batchSize,
    });

    const result: LockDueRacesResult = { locked: [], skipped: [] };
    for (const raceId of dueIds) {
      try {
        const outcome = await this.lockOne(raceId, now);
        if (outcome === null) {
          result.locked.push(raceId);
        } else {
          result.skipped.push({ raceId, reason: outcome });
        }
      } catch (error) {
        // Yarış BAŞINA yakalanır (yukarıdaki doc yorumu). `Error` dışı bir
        // fırlatma da olabilir (`throw 'x'`) — mesaj bu yüzden `String`e
        // çevrilir, `error.message` diye okunmaz.
        const message = error instanceof Error ? error.message : String(error);
        result.skipped.push({ raceId, reason: message });
        this.logger.error(`Yarış ${raceId} kilitlenemedi: ${message}`);
      }
    }
    return result;
  }

  /**
   * Tek yarışı kilitler. `null` = kilitlendi; `string` = atlanma sebebi.
   *
   * **AKIŞ — ve neden bu sıra:** (1) bağlam kilitsiz okunur, (2) durum
   * ÖNCE burada denetlenir, (3) snapshot'lar kurulur, (4) repository
   * hepsini tek transaction'da yazar ve durumu KİLİT ALTINDA TEKRAR
   * denetler.
   *
   * (2) gereklidir çünkü `findRacesDueForLock` yalnızca bir ADAY listesi
   * döner; burada yapılan denetim, çoktan kilitlenmiş/iptal edilmiş bir
   * yarış için PAHALI snapshot kurulumunu (at başına ~4 sorgu) hiç
   * yapmamayı sağlar. Asıl garanti (4)'tedir.
   *
   * (3) kilitten ÖNCE yapılır ve bu GÜVENLİDİR: `startTime` geçtikten
   * sonra katılma (`checkRaceJoinable`) ve ayrılma (`checkRaceLeavable`)
   * da kapalıdır, yani kadro bu okuma ile kilit arasında değişemez.
   * Değişirse repository tripwire'ı `Error` fırlatır ve o hata `execute`
   * tarafından yakalanıp "atlandı" olarak raporlanır — sessizce YANLIŞ
   * kadro dondurulmaz.
   */
  private async lockOne(raceId: string, now: Date): Promise<string | null> {
    // READY ŞARTI (30.09.2026) — snapshot kurulmadan ÖNCE: hazır demeyen
    // katılımlar iptal edilip ücretleri iade edilir, böylece aşağıdaki
    // bağlam ve kadro tripwire'ı yalnızca hazır katılımları görür. Hiç hazır
    // oyuncu kalmadıysa yarış iptal edilmiştir ve kilitlenecek bir şey yoktur.
    // TURNUVA (30.09.2026): final botsuz koşulur; `minParticipants`in altında
    // hazır oyuncu kalırsa kalanlar da iade edilip turnuva iptal olur.
    const tournament = await this.raceRepository.findTournamentInfo(raceId);
    const dropped = await this.raceRepository.dropUnreadyLobbyEntries({
      raceId,
      now,
      minRemaining: tournament === null ? 1 : this.config.online.tournament.minParticipants,
    });
    if (dropped.raceCancelled) {
      return 'NO_READY_PARTICIPANTS';
    }

    const context = await this.raceRepository.findLobbySettlementContext(raceId);
    if (context === null) {
      return 'RACE_NOT_FOUND';
    }

    const rejection = checkRaceLockable(
      {
        status: context.status,
        startTime: context.startTime,
        joinedPlayers: context.joinedPlayers,
      },
      now,
    );
    if (rejection !== null) {
      return rejection;
    }

    const entrantSnapshots: {
      entryId: string;
      snapshot: RaceEntrantSnapshot;
      jockeyId: string | null;
    }[] = [];
    for (const entrant of context.entrants) {
      // PHASE 6.2 — builder jokeyi de çözer ve `jockeyId`yi AYNI sonuçta
      // döner: snapshot'a giren `jockeySkillComposite` ile `race_entries.
      // jockey_id`nin iki ayrı okumadan doğması imkânsız hâle gelir.
      const built = await this.entrantSnapshotBuilder.build(
        entrant,
        context.surface,
        context.distanceMeters,
      );
      entrantSnapshots.push({
        entryId: entrant.entryId,
        snapshot: built.snapshot,
        jockeyId: built.jockeyId,
      });
    }

    const locked = await this.raceRepository.lockLobbyRace({
      raceId,
      now,
      // SEED BURADA DOĞAR (eskiden kesinleşmede doğuyordu). `randomUUID()`
      // `Math.random()` DEĞİLDİR — CLAUDE.md'nin yasağı simülasyonun
      // İÇİNDEKİ rastgelelik içindir: motor `deriveRandom(seed, ...)` ile
      // determinist olmalıdır, ama seed'in KENDİSİ elbette rastgele
      // olmalıdır (yoksa sonuç önceden hesaplanabilirdi). `raceId`yi seed
      // yapmak bu yüzden YASAK olurdu.
      simulationSeed: randomUUID(),
      engineVersion: RACE_ENGINE_VERSION,
      rulesetVersion: RACE_RULESET_VERSION,
      configVersion: this.config.race.version,
      weatherConfigVersion: this.config.weather.version,
      entrantSnapshots,
      liveCountdownSeconds: this.config.interactiveRace.startCountdownSeconds,
    });

    // `false` = kilit altında durum uygun değildi (başka bir örnek önce
    // davrandı). Bu bir hata DEĞİLDİR — beklenen yarış durumudur.
    return locked ? null : 'NOT_LOCKABLE_UNDER_LOCK';
  }
}
