import { Inject, Injectable } from '@nestjs/common';
import type { RaceLobbyView } from '@at-sevdalisi/shared-types';
import { validateEntryReady, type EntryReadyInput } from '../../domain/race/lobby';
import { InvalidEntryReadyInputError } from '../../domain/race/errors';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

/**
 * READY düğmesi — oyuncunun KENDİ katılım durumunu `ready`/`not_ready`
 * yapması (brief §6, §42 PHASE 3).
 *
 * **`POST /races/:id/ready` — BURASI BİR PARA YOLU DEĞİLDİR.** Bakiye,
 * ödül havuzu ve deftere dokunulmaz; `IdempotencyInterceptor` de YOKTUR ve
 * bu bilinçlidir: aynı değeri iki kez yazmak sonucu değiştirmez
 * (`checkEntryReadyable` mevcut duruma bakmaz — gerekçesi o arayüzün doc
 * yorumunda). Ücretli bir yarışta `ready` demek, ödenmiş ücreti geri
 * almaz; ücret ZATEN katılım anında (PHASE 1b) alınmıştır.
 *
 * **İŞİN TAMAMI DEVREDİLİR.** Durum denetimleri (`yarış hâlâ scheduled mı`,
 * `katılım iptal edilmiş mi`) `RaceRepository.setEntryReady` içinde, yarış
 * satırı `FOR UPDATE` ile KİLİTLİYKEN yapılır — `join-race.use-case` ile
 * AYNI gerekçe (TOCTOU): kontrol buraya taşınsaydı, "yarış başlamamış"
 * cevabı ile `UPDATE` arasında yarış başlayabilirdi.
 *
 * Burada YALNIZCA `validateEntryReady` (SAF domain fonksiyonu) koşar —
 * `status` alanı `ready`/`not_ready` dışındaysa `InvalidEntryReadyInputError`
 * (400) ve hiçbir satır yazılmaz. `cancelled`'ın bu uçtan SEÇİLEMEMESİ
 * kritiktir: katılım iptali bir İADE politikası gerektirir ve ayrı bir
 * iştir (bkz. `READY_SETTABLE_STATUSES`).
 *
 * `playerId` **`CurrentPlayer()`'DAN GELİR, GÖVDEDEN ASLA** (CLAUDE.md
 * kural 1): başkasının katılım satırını değiştirmek bu uçtan MÜMKÜN
 * DEĞİLDİR.
 */
@Injectable()
export class SetEntryReadyUseCase {
  constructor(
    // `@Inject()` AÇIK — CLAUDE.md kural 5: Vitest/esbuild `design:paramtypes`
    // üretmediği için tipe dayalı örtük DI sessizce `undefined` çözer ve
    // yalnızca CI'da patlar.
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
  ) {}

  async execute(raceId: string, playerId: string, input: EntryReadyInput): Promise<RaceLobbyView> {
    const { problems, value } = validateEntryReady(input);
    if (value === null) {
      throw new InvalidEntryReadyInputError(problems);
    }

    return this.raceRepository.setEntryReady({
      raceId,
      playerId,
      status: value.status,
      // `now` ÇAĞIRAN tarafından geçirilir ve `checkEntryReadyable`'a
      // gider: saf fonksiyonun gizli bir zaman kaynağı olmaması ilkesi
      // (`join-race.use-case`'teki AYNI not).
      now: new Date(),
    });
  }
}
