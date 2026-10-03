import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  RaceEntrantSnapshot,
  RaceEntry,
  RaceSegmentSnapshot,
  RaceSettlementResult,
  RaceSurface,
  RaceTimeline,
  RaceWeather,
} from '@at-sevdalisi/shared-types';
import { generateBotEntrants } from '../../domain/race/bot-generator';
import { resolveFieldComposition } from '../../domain/race/field-composition';
import { checkRaceSettleable, nextGatePosition } from '../../domain/race/lobby';
import {
  computePrizePayouts,
  resolvePrizeDistribution,
} from '../../domain/race/prize-distribution';
import {
  RACE_ENGINE_VERSION,
  RACE_RULESET_VERSION,
  simulateRace,
} from '../../domain/race/race-engine';
import {
  InteractiveRaceNotFinishedError,
  RaceNotFoundError,
  RaceNotSettleableError,
} from '../../domain/race/errors';
import { liveRemainingMs, toPlayerCommandMaps } from '../../domain/race/interactive-race';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { EntrantSnapshotBuilder } from '../services/entrant-snapshot.builder';
import {
  RACE_REPOSITORY,
  type LobbySettlementContext,
  type RaceRepository,
  type SettleLobbyRealEntryResult,
} from '../ports/race.repository';

/**
 * `POST /races/:id/settle` (§42 PHASE 13.14) — ÜCRETLİ LOBİ YARIŞINI KOŞAR
 * VE ÖDÜLÜ DAĞITIR.
 *
 * **BU DİLİM PROJEDEKİ EN BÜYÜK DÜRÜST BOŞLUĞU KAPATIR (PROJE_DURUMU.md
 * §13.13.2).** Ondan önce: oyuncu giriş ücretini ödüyor, para
 * `races.prize_pool`'a giriyor ve HİÇBİR ZAMAN geri dönmüyordu — çünkü
 * `races.status = 'finished'` yalnızca pratik yarış ve PvP yollarında
 * yazılıyordu; lobi yarışını koşturan bir kod yoktu. Aynı eksiklik
 * `race_finished`/`prize_won` bildirimlerinin de üretilememesinin
 * sebebiydi.
 *
 * **KİM ÇAĞIRIR: HERHANGİ BİR KİMLİĞİ DOĞRULANMIŞ OYUNCU.** Uç bir "crank"
 * (zamanlayıcı görevi) gibi çalışır — çağıranın yarışla bir ilgisi olmak
 * zorunda DEĞİLDİR. Bunun nedeni basit: bu projede **zamanlanmış görev
 * altyapısı yok** (cron/worker yok — `race_starting` bildiriminin de
 * üretilememesinin sebebi AYNI). Yarışı yalnızca katılımcılarından birine
 * açsaydık, tüm katılımcılar oyunu kapattığında yarış sonsuza kadar
 * `scheduled` kalır ve para havuzda kilitlenirdi. Crank deseni bunu
 * çözer: yarışı İLK gören koşturur, geri kalanlar 409 alır.
 *
 * **BU YÜZDEN İDEMPOTENCY-Key KULLANILMAZ.** Çift ödemeyi engelleyen şey
 * anahtar değil, DURUM GEÇİŞİDİR: kilit altındaki `checkRaceSettleable`
 * ilk çağrıdan sonra `NOT_SCHEDULED` döner. Ayrı bir anahtar altyapısı
 * eklemek, zaten yapısal olarak imkânsız bir şeyi ikinci kez engellemek
 * olurdu.
 *
 * **KATILIMCI SAYISI `minPlayers`'A TAKILMAZ — bilinçli.** Gerekçenin
 * tamamı `checkRaceSettleable` doc yorumundadır: `startTime` geçtikten
 * sonra ayrılma da kapandığı için "8 oyuncu dolmadı, koşmaz" demek,
 * ödenen ücretleri kalıcı olarak yakmak olurdu. Kalan koltuklar
 * `aiFillEnabled` İSE botlarla dolar; değilse yarış **daha az atla**
 * koşar (bkz. `domain/race/field-composition.ts`).
 *
 * **AÇIK PENCERE KAPANDI (PHASE 1, migration 0042).** Burada eskiden şu
 * yazıyordu: "snapshot, katılım anında değil KOŞMA anında alınır; crank
 * deseni yüzünden bu an `startTime`'dan saniyeler/dakikalar sonra olabilir,
 * yani oyuncu `startTime` ile kesinleşme arasında atını eğitip sonucu
 * etkileyebilir. Kapatmanın yolu `startTime` anında snapshot'ı donduran bir
 * zamanlayıcıdır — projede YOK."
 *
 * **Artık VAR.** `RaceLockScheduler` (`infrastructure/scheduler/`) her
 * `tickSeconds` saniyede bir `LockRaceUseCase`i çağırır; o da
 * `startTime`ı gelmiş yarışları `locking`e geçirip snapshot'ı VE seed'i
 * `races.simulation_seed` / `race_entries.horse_snapshot` içine DONDURUR.
 * Bu use-case artık o dondurulmuş değerleri TÜKETİR (`context.
 * simulationSeed`, `entrant.horseSnapshot`).
 *
 * **`null` DONDURMA HÂLÂ MÜMKÜNDÜR ve bu bir gerileme değildir:**
 * `lockScheduler.enabled = false` iken, ya da yarış `startTime`ından ÖNCE
 * elle kesinleştirildiğinde (ki bu meşrudur — `checkRaceSettleable`
 * yalnızca "başlamış mı" der, "kilitlenmiş mi" demez) dondurma hiç
 * yapılmamıştır. O hâlde bu use-case eski davranışına düşer ve snapshot'ı
 * kendisi kurar. Yani pencere "her zaman açık" değil, "zamanlayıcı
 * çalışmıyorsa açık"tır — ve `lockScheduler.enabled`ın `false` yapılması
 * bilinçli bir tercihtir, bir arıza değildir.
 */
/**
 * `online.tournament.prizeDistributionByPlacement` (`{"1":0.5,"2":0.3,...}`)
 * → sıra dizisi (`[0.5, 0.3, ...]`). TEK kaynak config'tir; `economy` içinde
 * ikinci bir turnuva dağılımı TANIMLANMAZ. Sıra anahtarları 1'den ardışık
 * olmalıdır — boşluk varsa orada kesilir (eksik sıra ödül almaz).
 */
export function tournamentShares(byPlacement: Record<string, number>): number[] {
  const shares: number[] = [];
  for (let placement = 1; byPlacement[String(placement)] !== undefined; placement += 1) {
    shares.push(byPlacement[String(placement)] as number);
  }
  return shares;
}

@Injectable()
export class SettleRaceUseCase {
  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(EntrantSnapshotBuilder) private readonly entrantSnapshotBuilder: EntrantSnapshotBuilder,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(raceId: string): Promise<RaceSettlementResult> {
    const now = new Date();
    // READY ŞARTI (30.09.2026) — `scheduled` bir yarış kilitlenmeden doğrudan
    // kesinleştirilirse (zamanlayıcı kapalıyken ya da ondan önce gelen bir
    // crank) aynı kural burada da uygulanır: hazır demeyenler iade edilip
    // düşülür. `locking` yarışta bu çağrı hiçbir şey yapmaz (kilit anında
    // zaten uygulandı). Hiç hazır oyuncu kalmadıysa yarış artık
    // `cancelled`dır ve aşağıdaki `checkRaceSettleable` 409 döner.
    // TURNUVA (30.09.2026, migration 0045): final BOTSUZ koşulur, ödül
    // `online.tournament.prizeDistributionByPlacement`ten dağıtılır ve
    // `minParticipants`in altında hazır oyuncu varsa turnuva iptal olur.
    const tournament = await this.raceRepository.findTournamentInfo(raceId);
    await this.raceRepository.dropUnreadyLobbyEntries({
      raceId,
      now,
      minRemaining: tournament === null ? 1 : this.config.online.tournament.minParticipants,
    });

    const context = await this.raceRepository.findLobbySettlementContext(raceId);
    if (context === null) {
      throw new RaceNotFoundError(raceId);
    }

    // Durum denetimi BURADA da yapılır (repository kilit altında TEKRAR
    // yapar): geçersiz bir istek, aşağıdaki PAHALI simülasyon (onlarca
    // katılımcı × yüzlerce segment) hiç koşmadan reddedilmelidir —
    // `RunPracticeRaceUseCase`'in kademe doğrulamasını en başa almasıyla
    // AYNI gerekçe. Asıl garanti repository'dedir; burası bir kapıdır.
    const rejection = checkRaceSettleable(
      {
        status: context.status,
        startTime: context.startTime,
        joinedPlayers: context.joinedPlayers,
      },
      now,
    );
    if (rejection !== null) {
      throw new RaceNotSettleableError(rejection);
    }

    // SEED — ÖNCE DONDURULMUŞ OLANA BAKILIR (PHASE 1, migration 0042).
    // `LockRaceUseCase` seed'i `startTime` anında üretip `races.
    // simulation_seed`e yazdıysa AYNEN o kullanılır: yeni bir seed üretmek,
    // dondurulmuş snapshot'larla eşleşmeyen bir koşu demekti — iki farklı
    // "aynı yarış" ve iki farklı sonuç.
    //
    // `null` ise (zamanlayıcı hiç çalışmadı — ör. `lockScheduler.enabled =
    // false`, ya da yarış `startTime`dan önce elle kesinleştirildi) seed
    // BURADA üretilir; bu, PHASE 1 öncesi davranışın AYNISIDIR ve yalnızca
    // "dondurma yapılmadıysa" geçerlidir. `raceId`'yi seed yapmak YASAK
    // olurdu: `raceId` herkese açıktır, dolayısıyla sonuç önceden
    // hesaplanabilirdi.
    const tournamentAiFill = tournament === null;
    const run = await this.buildRun(raceId, context, tournamentAiFill, now);
    const { simulationSeed, realEntryResults, botEntries, segments, timeline } = run;

    // 01.10.2026 — kontrollü yarış ANCAK canlı koşu bitince kesinleşir (bkz.
    // `LobbyLiveRaceUseCase`). Erken çağrı (crank ya da zamanlayıcı) 409.
    if (context.playerControl) {
      const remaining = liveRemainingMs(context, timeline, now, this.config.interactiveRace);
      if (remaining > 0) {
        throw new InteractiveRaceNotFinishedError(
          remaining / this.config.interactiveRace.timeScale,
        );
      }
    }

    const shares =
      tournament === null
        ? (resolvePrizeDistribution(this.config.economy, this.config.raceLobby.prizeDistributionId)
            ?.shares ?? [])
        : tournamentShares(this.config.online.tournament.prizeDistributionByPlacement);
    const payouts = computePrizePayouts(context.prizePool, shares);

    return this.raceRepository.settleLobbyRace({
      raceId,
      expectedPrizePool: context.prizePool,
      simulationSeed,
      engineVersion: RACE_ENGINE_VERSION,
      rulesetVersion: RACE_RULESET_VERSION,
      configVersion: this.config.race.version,
      weatherConfigVersion: this.config.weather.version,
      raceName: context.raceName,
      realEntries: realEntryResults,
      botEntries,
      segments,
      payouts,
      now,
    });
  }

  /**
   * 01.10.2026 — kesinleşmenin "yarışı kur ve koştur" kısmı (yazmaz). Canlı
   * kontrollü yarışın görüntüsü (`LobbyLiveRaceUseCase`) AYNI fonksiyonu
   * kullanır: ekranda koşan yarış ile kesinleşen yarış ayrışamaz. Kilitli
   * bir yarışta (tohum + snapshot donmuş) sonuç yalnızca oyuncu komutlarına
   * bağlıdır.
   */
  async buildRun(
    raceId: string,
    context: LobbySettlementContext,
    aiFillEnabled: boolean,
    now: Date,
  ): Promise<{
    simulationSeed: string;
    realEntryResults: SettleLobbyRealEntryResult[];
    botEntries: RaceEntry[];
    segments: RaceSegmentSnapshot[];
    timeline: RaceTimeline;
  }> {
    const simulationSeed = context.simulationSeed ?? randomUUID();

    // KULVARLAR — gerçek katılımcılarınki katılım anında çekilmişti
    // (`nextGatePosition`); botlar ve (eski satırlarda) eksik kalanlar
    // burada, aynı "en küçük boş numara" kuralıyla tamamlanır.
    const usedGatePositions = context.entrants
      .map((entrant) => entrant.gatePosition)
      .filter((position): position is number => position !== null);

    const entrantSnapshots: RaceEntrantSnapshot[] = [];
    const realEntryResults: SettleLobbyRealEntryResult[] = [];
    for (const entrant of context.entrants) {
      // DONDURULMUŞ SNAPSHOT VARSA O KULLANILIR (PHASE 1, migration 0042).
      // `LockRaceUseCase` `startTime` anında yazdıysa atın o andan sonraki
      // gelişimi (antrenman, bakım, ekipman) sonucu DEĞİŞTİREMEZ — açık
      // pencere kapandı. `null` ise eski davranış: koşma anında kurulur.
      //
      // PHASE 6.2 — JOKEY DE AYNI KURALA TABİDİR: dondurulmuşsa
      // `entrant.jockeyId` AYNEN kullanılır, canlı `jockeys` tablosundan
      // YENİDEN çözülmez. Aksi hâlde oyuncu kilit ile kesinleşme arasında
      // jokey değiştirip sonuç ekranında koşmayan bir jokeyi gösterebilirdi.
      let jockeyId: string | null;
      let snapshot: RaceEntrantSnapshot;
      if (entrant.horseSnapshot === null) {
        const built = await this.entrantSnapshotBuilder.build(
          entrant,
          context.surface,
          context.distanceMeters,
        );
        snapshot = built.snapshot;
        jockeyId = built.jockeyId;
      } else {
        snapshot = entrant.horseSnapshot;
        jockeyId = entrant.jockeyId;
      }
      entrantSnapshots.push(snapshot);

      let gatePosition = entrant.gatePosition;
      if (gatePosition === null) {
        gatePosition = nextGatePosition(usedGatePositions);
        usedGatePositions.push(gatePosition);
      }

      realEntryResults.push({
        entryId: entrant.entryId,
        horseId: entrant.horseId,
        horseSnapshot: snapshot,
        // Aşağıda simülasyondan DOLDURULUR; burada yalnızca yer tutucu.
        finalTimeMs: 0,
        finishPosition: 0,
        performanceScore: 0,
        gatePosition,
        // PHASE 6.2 — snapshot'la AYNI kaynaktan (yukarıdaki dallanma).
        jockeyId,
      });
    }

    // SAHA KOMPOZİSYONU — `aiFillEnabled` BURADA OKUNUR (§42 PHASE 2).
    // Öncesinde bu değer HİÇBİR KOD TARAFINDAN OKUNMUYORDU: `false`
    // yapılsa bile saha yine botlarla doluyordu ve bunu hiçbir şey
    // söylemiyordu. Kural `domain/race/field-composition.ts`te saf bir
    // fonksiyondur; burada yalnızca tüketilir.
    const composition = resolveFieldComposition(
      { fieldSize: context.fieldSize, humanCount: context.entrants.length },
      {
        fieldSizes: this.config.raceLobby.fieldSizes,
        aiFillEnabled: aiFillEnabled ? this.config.raceLobby.aiFillEnabled : false,
      },
    );
    if (!composition.ok) {
      // `NO_PARTICIPANTS` yolu zaten `checkRaceSettleable` tarafından
      // kesilir; buraya düşen bir ret, VERİTABANINDA bozuk bir satır
      // olduğu anlamına gelir (ör. `races.field_size` doğrudan SQL ile
      // değiştirilmiş). Sıfırla devam etmek — eski davranış — sessizce
      // YANLIŞ bir saha koştururdu.
      throw new Error(
        `Yarış ${raceId} için saha kompozisyonu geçersiz: ${composition.reason} (fieldSize=${context.fieldSize}, oyuncu=${context.entrants.length}).`,
      );
    }

    const botEntrants = generateBotEntrants(composition.composition.bots, simulationSeed);
    const botEntries: RaceEntry[] = botEntrants.map((bot) => {
      const gatePosition = nextGatePosition(usedGatePositions);
      usedGatePositions.push(gatePosition);
      return {
        id: randomUUID(),
        raceId,
        horseId: null,
        botLabel: bot.horseId,
        jockeyId: null,
        gatePosition,
        tacticalStyle: bot.tactic.racingStyle,
        riskLevel: bot.tactic.riskLevel,
        // Botun snapshot'ı ZATEN koştuğu hâldir (`generateBotEntrants` onu
        // simülasyon için üretir) — gerçek atlardan farklı olarak ayrıca
        // yüklenmesi gereken bir satırı yoktur.
        horseSnapshot: bot,
        finalTimeMs: null,
        finishPosition: null,
        performanceScore: null,
        createdAt: now.toISOString(),
      };
    });

    const timeline = simulateRace({
      raceId,
      simulationSeed,
      distanceMeters: context.distanceMeters,
      // `context.surface`/`context.weather` VERİTABANINDAN gelen `string`tir
      // (`race.repository` portu bilinçli olarak `string` taşır — repository
      // domain tiplerini bilmez). Daraltma BURADA yapılır: `races` sütunları
      // `validateRaceCreation`'dan geçmiş değerler tutar, yani bu bir
      // varsayım değil bir sözleşmedir.
      surface: context.surface as RaceSurface,
      weather: context.weather as RaceWeather,
      // `RaceSimulationInput` YALNIZCA `temperatureC` taşır — rüzgâr/nem
      // alanları race engine'de YOKTUR (`race-engine.ts` imzası). `races`
      // tablosundaki `wind_kmh`/`humidity_pct` sütunları başka bir amaçla
      // (ileride motor genişlerse) durur; buraya geçirilmeye çalışılırsa
      // tsc zaten reddeder (yaşandı: TS2353).
      temperatureC: context.temperatureC,
      entries: [...entrantSnapshots, ...botEntrants],
      raceConfig: this.config.race,
      weatherConfig: this.config.weather,
      // 01.10.2026 — oyuncu komutları (kontrollü yarış; diğerlerinde hepsi boş → etkisiz).
      playerCommands: toPlayerCommandMaps(
        context.entrants.map((entrant) => ({
          horseId: entrant.horseId,
          commands: entrant.playerCommands,
        })),
      ),
    });

    // SİMÜLASYON ETİKETİ → KALICI `race_entries.id` EŞLEMESİ
    // (`RunPracticeRaceUseCase`'teki AYNI desen).
    const entryIdByLabel = new Map<string, string>([
      ...context.entrants.map((entrant): [string, string] => [entrant.horseId, entrant.entryId]),
      ...botEntries.map((entry): [string, string] => [entry.botLabel as string, entry.id]),
    ]);

    for (const result of realEntryResults) {
      const finish = timeline.finalResult.find(
        (finishEntry) => entryIdByLabel.get(finishEntry.horseId) === result.entryId,
      );
      if (finish === undefined) {
        // Motor her katılımcı için bir sonuç üretir; eksikse bu bir
        // bütünlük hatasıdır ve sıfırlarla devam etmek sessizce yanlış
        // sonuç yazardı.
        throw new Error(`Simülasyon ${result.horseId} için sonuç üretmedi.`);
      }
      result.finalTimeMs = finish.finishTimeMs;
      result.finishPosition = finish.finishPosition;
      result.performanceScore = finish.performanceScore;
    }

    for (const entry of botEntries) {
      const finish = timeline.finalResult.find(
        (finishEntry) => finishEntry.horseId === entry.botLabel,
      );
      entry.finalTimeMs = finish?.finishTimeMs ?? null;
      entry.finishPosition = finish?.finishPosition ?? null;
      entry.performanceScore = finish?.performanceScore ?? null;
    }

    const segments: RaceSegmentSnapshot[] = timeline.segments.map((segment) => ({
      ...segment,
      raceEntryId: entryIdByLabel.get(segment.raceEntryId) ?? segment.raceEntryId,
    }));

    // ÖDÜL TUTARLARI — `pool` DIŞARIDAN verilir ve burada `races.prize_pool`
    // sütunudur (kademe yarışındaki `entryFee × fieldSize` DEĞİL; bkz.
    // `prize-distribution.ts` doc yorumu). Paylar config'ten gelir.
    return { simulationSeed, realEntryResults, botEntries, segments, timeline };
  }
}
