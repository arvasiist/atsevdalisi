import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { RaceLobbyView } from '@at-sevdalisi/shared-types';
import { validateRaceJoin, type RaceJoinInput } from '../../domain/race/lobby';
import { InvalidRaceJoinInputError } from '../../domain/race/errors';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

/**
 * Oyuncunun bir lobi yarışına KATILMASI (brief §2/§3/§6, §42 PHASE 1b).
 *
 * **`POST /races/:id/join` — BURASI GERÇEK BİR PARA YOLUDUR.** Brief §2
 * gereği giriş ücreti katılım anında tahsil edilir ve aynı anda
 * `races.prize_pool`'a eklenir. Bu yüzden uç `IdempotencyInterceptor` ile
 * korunur (`RunPracticeRace`/`market buy`/`grandstand ticket` ile AYNI
 * sınıflandırma): istemci zaman aşımından sonra aynı isteği tekrarlarsa
 * İKİNCİ kez ücret alınmamalıdır.
 *
 * **BU USE-CASE'İN İŞİ NEREDEYSE TAMAMEN DEVRETMEKTİR — ve bu bilinçlidir.**
 * Katılımın bütün durum kontrolleri (yarış katılabilir mi, kontenjan doldu
 * mu, at oyuncunun mu, at sakat mı, zaten katılmış mı) ile para hareketi
 * `RaceRepository.joinLobbyRace` içinde TEK bir transaction'da yapılır.
 * Sebep TOCTOU'dur: kontroller buraya taşınsaydı, "kontenjan müsait"
 * cevabı ile `INSERT` arasında geçen sürede yarış dolabilir ya da
 * başlayabilirdi — ve burada kaybedilen şey para değil, ADALETTİR
 * (havuzu şişiren fazladan bir katılımcı).
 *
 * Dolayısıyla burada YALNIZCA iki şey yapılır:
 *   1. `validateRaceJoin` — SAF domain fonksiyonu, DB'ye HİÇ dokunmadan
 *      önce. Sorun varsa `InvalidRaceJoinInputError` (400) ve hiçbir satır
 *      yazılmaz. `raceId` burada doğrulanmaz: o, URL'den gelir ve
 *      `ParseUUIDPipe` tarafından zaten elenmiştir (gövde alanlarının
 *      aksine, pipe'lar esbuild altında da çalışır — pipe SINIFI açıkça
 *      verilir, `design:paramtypes`'a bağlı değildir).
 *   2. `entryId` üretimi (`randomUUID()`) — `create-race`/`run-practice-race`
 *      ile AYNI desen: kimlik tek bir yerde, uygulama katmanında doğar;
 *      repository kimlik üretmez.
 *
 * `playerId` **`CurrentPlayer()`'DAN GELİR, GÖVDEDEN ASLA** — katılan kişi
 * isteği yapan oyuncudur. Gövdeden bir `playerId` kabul etmek doğrudan bir
 * kimlik sahteleme (IDOR) kapısı olurdu: bir oyuncu başkasının adına
 * ücretli yarışa girip onu borçlandırabilirdi (CLAUDE.md kural 1).
 * `RaceJoinInput`'ta böyle bir alan YOKTUR (bkz. o arayüzün doc yorumu).
 */
@Injectable()
export class JoinRaceUseCase {
  constructor(
    // `@Inject()` AÇIK — CLAUDE.md kural 5: Vitest/esbuild `design:paramtypes`
    // üretmediği için tipe dayalı örtük DI sessizce `undefined` çözer ve
    // yalnızca CI'da patlar.
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
  ) {}

  /**
   * `idempotencyKey` başlıktan geçirilir ve defter satırına yazılır:
   * interceptor aynı anahtarla gelen ikinci isteği bu metoda HİÇ
   * ulaştırmaz, ama anahtarın `economy_transactions`'a yazılması denetim
   * izini kalıcı kılar (Redis/Postgres önbelleği bir gün silinse bile
   * "bu düşüm hangi isteğe aitti" sorusu cevaplanabilir kalır).
   */
  async execute(
    raceId: string,
    playerId: string,
    input: RaceJoinInput,
    idempotencyKey: string | null,
  ): Promise<RaceLobbyView> {
    const { problems, value } = validateRaceJoin(input);
    if (value === null) {
      throw new InvalidRaceJoinInputError(problems);
    }

    return this.raceRepository.joinLobbyRace({
      raceId,
      playerId,
      horseId: value.horseId,
      entryId: randomUUID(),
      tacticalStyle: value.tacticalStyle,
      riskLevel: value.riskLevel,
      // `now` ÇAĞIRAN tarafından geçirilir — `validateRaceCreation`'daki
      // AYNI ilke (saf fonksiyonun gizli bir zaman kaynağı olmaması).
      // Burada ayrıca yarışın BAŞLAMA anıyla karşılaştırılır
      // (`checkRaceJoinable`), yani test edilebilir olması şarttır.
      now: new Date(),
      idempotencyKey,
    });
  }
}
