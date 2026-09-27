import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { RaceLobbyView } from '@at-sevdalisi/shared-types';
import { validateRaceCreation, type RaceCreationInput } from '../../domain/race/lobby';
import { InvalidRaceDefinitionError, RaceLimitReachedError } from '../../domain/race/errors';
import { RACE_ENGINE_VERSION, RACE_RULESET_VERSION } from '../../domain/race/race-engine';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

/**
 * Oyuncunun kendi yarışını açması (brief §1-§7, §42 PHASE 1).
 *
 * **`POST /races`** — ücretli/ücretsiz yarış oluşturma. Brief §1'in saydığı
 * alanların (ad, at sayısı, giriş ücreti, maksimum oyuncu, başlangıç
 * zamanı, pist, mesafe, yarış tipi) TAMAMI burada işlenir.
 *
 * **BU BİR PARA YOLU *DEĞİLDİR* — VE BU AYRIM KRİTİKTİR.** Yarış
 * OLUŞTURMAK hiçbir bakiye hareketi üretmez: `entry_fee` yalnızca `races`
 * satırına YAZILIR, tahsil edilmez. Giriş ücreti yarışa KATILIRKEN alınır
 * (PHASE 1b, `POST /races/:id/join`). Bu yüzden bu use-case'te
 * `IdempotencyInterceptor` YOKTUR: brief §54'ün zorunlu kıldığı
 * `Idempotency-Key`, para/ödül/envanter DEĞİŞTİREN uçlar içindir ve burada
 * iki kez çalışmak yalnızca iki yarış kaydı açar — ki bu zaten
 * `maxOpenRacesPerPlayer` tavanıyla sınırlıdır ve kullanıcının kendi
 * hatasıdır (istemci zaman aşımından sonra tekrar deneyip iki kez
 * ödemediği için telafi edilmesi gereken bir kayıp doğmaz). Bunu
 * `POST /horses`/`POST /players` gibi diğer "kaynak oluştur, para
 * taşıma" uçlarıyla AYNI sınıflandırma izler.
 *
 * **SIRA ÖNEMLİDİR:**
 *   1. `validateRaceCreation` — SAF domain fonksiyonu, DB'ye HİÇ
 *      dokunulmadan önce. Sorun varsa `InvalidRaceDefinitionError` (400)
 *      ve HİÇBİR satır yazılmaz.
 *   2. `createLobbyRace` — tavan kontrolü + yazma, TEK transaction'da.
 *      Tavan aşılmışsa `RaceLimitReachedError` (409).
 *
 * **NEDEN DOĞRULAMA REPOSITORY'DE DEĞİL:** repository'nin işi "verileni
 * yazmak"tır; iş kuralı bilmez. `races` tablosunun kendi CHECK kısıtları
 * (migration 0006 + 0036) zaten SON savunma hattıdır ama onlar ham
 * Postgres hataları üretir (`23514 check_violation`) ve istemci 400 yerine
 * 500 görürdü. Kullanıcıya anlamlı bir mesaj verebilmek için doğrulamanın
 * domain'de, kullanıcı dilinde olması ŞARTTIR.
 */
@Injectable()
export class CreateRaceUseCase {
  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * `playerId` **`CurrentPlayer()`'DAN GELİR, GÖVDEDEN ASLA** — yarışı
   * açan kişi isteği yapan oyuncudur; gövdeden bir `createdBy` kabul etmek
   * doğrudan bir kimlik sahteleme (IDOR) kapısı olurdu (CLAUDE.md
   * "SUNUCU OTORİTESİ"). Bu yüzden `input` içinde böyle bir alan YOKTUR.
   */
  async execute(playerId: string, input: RaceCreationInput): Promise<RaceLobbyView> {
    const { raceLobby } = this.config;

    // `now` ÇAĞIRAN tarafından geçirilir — bkz. `validateRaceCreation` doc
    // yorumu (saf fonksiyonun gizli bir zaman kaynağı olmaması ilkesi).
    const { problems, value } = validateRaceCreation(input, raceLobby, new Date());
    if (value === null) {
      throw new InvalidRaceDefinitionError(problems);
    }

    const result = await this.raceRepository.createLobbyRace({
      // `id` BURADA doğar — `run-practice-race.use-case.ts` ile AYNI desen
      // (repository kimlik üretmez, bkz. `CreateLobbyRaceInput` doc yorumu).
      id: randomUUID(),
      createdBy: playerId,
      name: value.name,
      fieldSize: value.fieldSize,
      maxPlayers: value.maxPlayers,
      entryFee: value.entryFee,
      raceType: value.raceType,
      startTime: value.startTime,
      surface: value.surface,
      weather: value.weather,
      distanceMeters: value.distanceMeters,
      tribuneFee: value.tribuneFee,
      spectatorCapacity: value.spectatorCapacity,
      prizePool: value.prizePool,
      // **`null` — VE BU BİLİNÇLİDİR.** Lobi yarışının seed'i, yarış
      // KOŞARKEN üretilir. Erken üretilseydi yarışı açan kişi seed'i
      // okuyup (bkz. `GET /races/:id/timeline` yanıtı) sonucu önceden
      // hesaplayabilirdi — ücretli bir yarışta doğrudan para kazanma
      // yolu. Tam gerekçe: `CreateLobbyRaceInput.simulationSeed` doc
      // yorumu.
      simulationSeed: null,
      // Bu dört sürüm alanı `NOT NULL`'dır (migration 0021/0024 DEFAULT'u
      // bilerek kaldırdı) ve henüz KOŞMAMIŞ bir yarış için "bu yarışın
      // koşacağı BEKLENEN sürüm" anlamına gelir; yarış gerçekten simüle
      // edildiğinde GERÇEK sürümlerle üzerine yazılır. Bu yüzden
      // `run-practice-race` ile AYNI kaynaklardan okunur.
      engineVersion: RACE_ENGINE_VERSION,
      rulesetVersion: RACE_RULESET_VERSION,
      configVersion: this.config.race.version,
      weatherConfigVersion: this.config.weather.version,
      // Tavan kontrolü PORT'tan geçer çünkü sayım ile `INSERT` AYNI
      // transaction'da olmak zorundadır — bkz. `CreateLobbyRaceResult`
      // doc yorumu.
      maxOpenRaces: raceLobby.maxOpenRacesPerPlayer,
    });

    if (!result.ok) {
      throw new RaceLimitReachedError(raceLobby.maxOpenRacesPerPlayer);
    }

    return result.race;
  }
}
