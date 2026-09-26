import { Inject, Injectable } from '@nestjs/common';
import type { HorseMarketValueView } from '@at-sevdalisi/shared-types';
import { calculateMarketValue, type MarketValueInput } from '../../domain/market/market';
import { calculateAgeInMonths, getGrowthFactor } from '../../domain/horse/age-curve';
import { FORM_SAMPLE_SIZE } from '../../domain/race/entrant-snapshot';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

/**
 * `GET /horses/:id/market-value` (bu turda EKLENDİ) — `docs/AUDIT_REPORT.md`'nin
 * "§25 Stable görsel yönetim ekranı" bulgusunun "piyasa değeri tahmini
 * (`calculateMarketValue()` domain'de VAR ama hiçbir yerden ÇAĞRILMIYOR —
 * ayrı dilim)" notunun kapatılması. `domain/market/market.ts`'in
 * `calculateMarketValue` fonksiyonu brief §30'dan beri YAZILMIŞTI ama bu
 * use-case'e kadar HİÇBİR application/api katmanı onu ÇAĞIRMIYORDU.
 *
 * Bu use-case BİLİNÇLİ olarak `RaceModule`'de barındırılır (bkz.
 * `race.module.ts`'e eklenen sağlayıcı), `HorseModule`'de veya
 * `MarketModule`'de DEĞİL: hem `HORSE_REPOSITORY` hem `RACE_REPOSITORY`'ye
 * ihtiyaç duyar, `RaceModule` ZATEN `HorseModule`'ü import eder (bkz. o
 * modülün kendi `RACE_REPOSITORY`'yi sağlaması) — ama `HorseModule`
 * `RaceModule`'ü import EDEMEZ (ZATEN `RaceModule → HorseModule`
 * yönünde bir bağımlılık var, tersi DÖNGÜSEL olurdu) ve `MarketModule`
 * de `RaceModule`'ü import EDEMEZ (`RaceModule` ZATEN `MarketModule`'ü
 * import ediyor, bkz. `race.module.ts` — tersi de DÖNGÜSEL olurdu).
 * `RaceModule` bu üç modülün kesişiminde YAŞAYAN TEK yer olduğundan yeni
 * bir modül İCAT ETMEK yerine burası kullanıldı.
 *
 * `raceHistory`/`pedigreeQualityScore` girdileri: proje şu an bir
 * "pedigree kalite puanı" saf fonksiyonu ÜRETMİYOR (bkz. `domain/
 * breeding/pedigree.ts` — ağaç GÖRSELLEŞTİRME var, tek bir 0-100 puana
 * SIKIŞTIRAN bir fonksiyon YOK), bu yüzden `pedigreeQualityScore: null`
 * geçilir (bkz. `MarketValueInput`'in doc yorumu — bu, UYDURULMUŞ bir
 * `50` DEĞİL, "bilinmiyor" durumunun `calculateMarketValue`'nin KENDİSİNİN
 * beklediği dürüst temsili). `raceHistory` için `FORM_SAMPLE_SIZE`
 * (`domain/race/entrant-snapshot.ts`, "Current Form" R3 dilimiyle AYNI
 * sabit — YENİ bir örneklem büyüklüğü İCAT EDİLMEZ) kadar en son
 * SONUÇLANMIŞ yarış kullanılır.
 */
@Injectable()
export class GetHorseMarketValueUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    // CI #163 kırmızı (bu turda BULUNDU VE DÜZELTİLDİ) — `docs/ARCHITECTURE.md`
    // §9.1 Hata 6'nın TAM OLARAK uyardığı hata: bu parametre açık bir
    // `@Inject()` OLMADAN (örtük tip-tabanlı enjeksiyonla) bırakılmıştı —
    // Vitest/esbuild `emitDecoratorMetadata` gerektiren bu örtük çözümlemeyi
    // DESTEKLEMEDİĞİNDEN `appConfig` çalışma zamanında `undefined` kalıyordu,
    // bu da `this.appConfig.horseGrowth` erişiminde 500'e neden oluyordu
    // (e2e testler bunu YAKALADI — CI #163'ün 3 test hatası). Düzeltme:
    // `run-practice-race.use-case.ts`'in KENDİSİNİN uyguladığı AYNI desen
    // (`@Inject(AppConfigService)`).
    @Inject(AppConfigService) private readonly appConfig: AppConfigService,
  ) {}

  async execute(horseId: string): Promise<HorseMarketValueView> {
    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }

    const recentResults = await this.raceRepository.findRecentResultsByHorseId(horseId, FORM_SAMPLE_SIZE);
    const ageMonths = calculateAgeInMonths(new Date(horse.birthDate));
    const ageGrowthFactor = getGrowthFactor(ageMonths, this.appConfig.horseGrowth);

    const input: MarketValueInput = {
      quality: horse.quality,
      potential: horse.potential,
      ageGrowthFactor,
      raceHistory:
        recentResults.length > 0
          ? {
              racesRun: recentResults.length,
              wins: recentResults.filter((result) => result.finishPosition === 1).length,
            }
          : null,
      // Bkz. dosya başı doc yorumu — henüz bir pedigree-kalite fonksiyonu yok.
      pedigreeQualityScore: null,
      health: horse.health,
    };

    const estimatedValue = calculateMarketValue(input, this.appConfig.economy);

    return { horseId, estimatedValue };
  }
}
