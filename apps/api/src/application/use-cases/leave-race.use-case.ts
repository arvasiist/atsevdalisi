import { Inject, Injectable } from '@nestjs/common';
import type { RaceLobbyView } from '@at-sevdalisi/shared-types';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

/**
 * Oyuncunun katıldığı bir lobi yarışından AYRILMASI — giriş ücretinin
 * İADESİ (brief §20 `REFUND`, §42 PHASE 4c).
 *
 * **BURASI GERÇEK BİR PARA YOLUDUR — ama TERS yönden.** `JoinRaceUseCase`
 * parayı ALIR ve havuzu BÜYÜTÜR; bu use-case parayı GERİ VERİR ve havuzu
 * KÜÇÜLTÜR. İkisi de `races.prize_pool`'u ve `economy_transactions`'ı
 * etkilediği için aynı disipline tabidir (CLAUDE.md kural 7): tek
 * transaction, `SELECT ... FOR UPDATE`, aynı transaction'da defter kaydı.
 *
 * **`REFUND` ailesinin bu projedeki İLK ve TEK üreticisidir.** O aile
 * `packages/shared-types/src/economy.ts`'te baştan beri tanımlıydı ama onu
 * üreten hiçbir yol yoktu — brief §20 onu açıkça sayar, bu yüzden eksiklik
 * `docs/WALLET_SYSTEM.md` §2'de dürüstçe listelenmişti. Bu use-case o
 * boşluğu kapatır.
 *
 * **BU USE-CASE'İN İŞİ YİNE NEREDEYSE TAMAMEN DEVRETMEKTİR.** Ayrılmanın
 * bütün durum kontrolleri (yarış hâlâ `scheduled` mı, başladı mı, katılım
 * zaten iptal edilmiş mi), iade tutarının belirlenmesi ve para hareketi
 * `RaceRepository.leaveLobbyRace` içinde TEK bir transaction'da yapılır.
 * Sebep `JoinRaceUseCase`'tekiyle AYNIdır (TOCTOU): kontroller buraya
 * taşınsaydı, "yarış başlamamış" cevabı ile iade arasında geçen sürede
 * yarış başlayabilir ve KOŞMUŞ bir yarıştan para iade edilirdi.
 *
 * Dolayısıyla burada YALNIZCA `now` üretilir ve repository çağrılır.
 * **Gövde YOKTUR, dolayısıyla doğrulanacak alan da yoktur:** ayrılma
 * isteğinin tek parametresi yoldan gelen `raceId`'dir ve o
 * `ParseUUIDPipe`'dan geçer (gövde alanlarının aksine pipe'lar esbuild
 * altında da çalışır — CLAUDE.md kural 5).
 *
 * `playerId` **`CurrentPlayer()`'DAN GELİR, GÖVDEDEN ASLA** — ayrılan kişi
 * isteği yapan oyuncudur. Gövdeden bir `playerId` kabul etmek doğrudan bir
 * kimlik sahteleme (IDOR) kapısı olurdu: bir oyuncu başkasını yarıştan
 * atıp parasını iade ettirebilirdi (CLAUDE.md kural 1).
 */
@Injectable()
export class LeaveRaceUseCase {
  constructor(
    // `@Inject()` AÇIK — CLAUDE.md kural 5: Vitest/esbuild `design:paramtypes`
    // üretmediği için tipe dayalı örtük DI sessizce `undefined` çözer ve
    // yalnızca CI'da patlar.
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
  ) {}

  /**
   * `idempotencyKey` başlıktan geçirilir ve İADE defter satırına yazılır —
   * `JoinRaceUseCase` ile AYNI gerekçe: interceptor aynı anahtarla gelen
   * ikinci isteği bu metoda HİÇ ulaştırmaz, ama anahtarın
   * `economy_transactions`'a yazılması denetim izini kalıcı kılar.
   *
   * `now` ÇAĞIRAN tarafından geçirilir — `validateRaceCreation`/
   * `JoinRaceUseCase` ile AYNI ilke: saf fonksiyonun gizli bir zaman
   * kaynağı olmaması ve karşılaştırmanın test edilebilir olması.
   */
  async execute(raceId: string, playerId: string, idempotencyKey: string | null): Promise<RaceLobbyView> {
    return this.raceRepository.leaveLobbyRace({
      raceId,
      playerId,
      now: new Date(),
      idempotencyKey,
    });
  }
}
