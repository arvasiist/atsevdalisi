import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { BreedingResultView } from '@at-sevdalisi/shared-types';
import { assertBreedingConfigIsValid, pickFoalGender } from '../../domain/breeding/breeding';
import { validateHorseName } from '../../domain/horse/validation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { BREEDING_REPOSITORY, type BreedingRepository } from '../ports/breeding.repository';
import { FarmEffectsService } from './farm-effects.service';

/**
 * Çiftleştirme (proje sahibinin talebi — soy ağacı veri zincirinin ÜÇÜNCÜ
 * parçası; okuma yolu `GetHorsePedigreeUseCase`). `POST /players/:id/breeding`.
 *
 * **Akış — sıra ÖNEMLİDİR:**
 *   1. `assertBreedingConfigIsValid` — bozuk config "hiç çiftleştirme
 *      yapılamaz" ya da "cooldown sessizce kapalı" gibi görünmez bir duruma
 *      dönüşmesin diye, HİÇBİR ŞEY yapılmadan ÖNCE
 *      (`SendGiftUseCase`'in `assertGiftConfigIsValid` adımıyla AYNI gerekçe).
 *   2. `validateHorseName` — tay adı. HAM gövde değeri üzerinde çalışır
 *      (CLAUDE.md "Kardeş tuzak": DTO dekoratörleri Vitest/esbuild altında
 *      atlanır, gövdedeki değer `string` olduğu iddia edilen bir `number`
 *      olabilir → `validateHorseName` kendi tip kontrolünü yapar).
 *   3. Kimlikler + rastgelelik ÜRETİLİR (`randomUUID`/`Math.random()`).
 *      Domain katmanı `Math.random()` ÇAĞIRAMAZ (`pickStarterHorseGender`
 *      ile AYNI kural), bu yüzden tay cinsiyeti burada seçilir.
 *   4. `breed` — **PARA YOLU**, tek transaction.
 *
 * **Kısrak sahipliği ve uygunluk BURADA kontrol EDİLMEZ.** Bunlar
 * `PostgresBreedingRepository.breed`'in İÇİNDE, KİLİTLİ satırlarla verilir;
 * buradaki tek fayda hızlı bir hata mesajı olurdu, ama kısrağı burada
 * okumak ikinci bir doğruluk kaynağı (ve TOCTOU penceresi) yaratırdı —
 * `SendGiftUseCase`'in arkadaşlık ön kontrolünden BİLİNÇLİ bir sapma:
 * orada ön kontrolün DB'de karşılığı olamayacak bir kural vardı, burada
 * yok (sahiplik ve uygunluk kilitli satırdan okunuyor).
 */
@Injectable()
export class BreedHorsesUseCase {
  constructor(
    @Inject(BREEDING_REPOSITORY) private readonly breedingRepository: BreedingRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(FarmEffectsService) private readonly farmEffects: FarmEffectsService,
  ) {}

  async execute(
    playerId: string,
    mareId: string,
    stallionId: string,
    rawFoalName: unknown,
    idempotencyKey: string | null,
  ): Promise<BreedingResultView> {
    assertBreedingConfigIsValid(this.config.genetics);

    // Tay adı: domain doğrulaması (tip + uzunluk) HAM değer üzerinde
    // çalışır ve DOĞRULANMIŞ + `trim()`'lenmiş ismi DÖNER — böylece burada
    // ne `as string` iddiası ne de ikinci bir `trim()` gerekir.
    const foalName = validateHorseName(rawFoalName);

    const foalId = randomUUID();
    // SEED = pairId (bkz. `ExecuteBreedingInput` doc yorumu): tayın statları
    // `breeding_pairs.id` satırından yeniden üretilebilir kalır.
    const pairId = randomUUID();

    // 01.10.2026 — üreme merkezi tayın doğum sağlık riskini düşürür (kısrak sahibi = çağıran).
    const { birthHealthRiskMultiplier } = await this.farmEffects.effectsFor(playerId);

    return this.breedingRepository.breed({
      playerId,
      mareId,
      stallionId,
      foalId,
      pairId,
      foalName,
      foalGender: pickFoalGender(Math.random()),
      now: new Date(),
      idempotencyKey,
      birthHealthRiskMultiplier,
    });
  }
}
