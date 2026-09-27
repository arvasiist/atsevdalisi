import { Inject, Injectable } from '@nestjs/common';
import type { RaceLobbyView } from '@at-sevdalisi/shared-types';
import { normalizeLobbyListLimit } from '../../domain/race/lobby';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';
import { AppConfigService } from '../../infrastructure/config/config.service';

/**
 * Lobi listesi — katılabilecek yarışlar (brief §5 "doluluk", §42 PHASE 3).
 *
 * **BU USE-CASE NEREDEYSE BİR GEÇİŞTİR — ve bu bilinçlidir.** Tek karar
 * `limit`in nasıl normalize edileceğidir; geri kalanı
 * `RaceRepository.listLobbyRaces`'e devredilir. Okuma yolunda iş kuralı
 * yoktur: "hangi yarışlar listelenir" sorusunun cevabı `races.status`
 * filtresidir ve o da sabittir (lobi = `scheduled`).
 *
 * **`status` NEDEN SABİT `scheduled`:** lobi, "şu an katılabileceğin
 * yarışlar" listesidir. `finished`/`cancelled` yarışları listelemek
 * oyuncuya hiçbir şey kazandırmaz — geçmiş sonuçlar için zaten
 * `GET /horses/:id/results` ve `GET /races/:id/timeline` vardır. Filtreyi
 * sorgu parametresi yapmak, istemciye `status=in_progress` gibi anlamsız
 * bir seçim sunmak olurdu. İhtiyaç doğduğunda (ör. "geçmiş yarışlar"
 * sekmesi) AYRI bir uç olarak eklenir.
 *
 * **`GET /races` BİR PARA YOLU DEĞİLDİR:** hiçbir şey yazmaz, bu yüzden
 * `Idempotency-Key` de, transaction da yoktur. Yalnızca `@RateLimit`
 * vardır — sınırsız bırakmak, `LIMIT` kırpmasına rağmen veritabanını
 * tekrarlı taramaya sokmanın yoludur (brief §16).
 */
@Injectable()
export class ListLobbyRacesUseCase {
  constructor(
    // `@Inject()` AÇIK — CLAUDE.md kural 5.
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    // `limit` sınırları `config/race-lobby.config.json`'dadır — CLAUDE.md
    // "SİHİRLİ SAYI YOK". `AppConfigModule` `@Global()` olduğu için ek
    // modül importu gerekmez.
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * `rawLimit` HAM sorgu parametresidir (`?limit=...`) ve **`unknown`**'dır:
   * sorgu parametreleri her zaman metindir ve `@Query()` değerleri de
   * esbuild altında doğrulanmaz (CLAUDE.md kural 5). `normalizeLobbyListLimit`
   * hem tipini hem aralığını güvenli hâle getirir — hatalı girdi 400 değil,
   * varsayılana düşer (gerekçesi o fonksiyonun doc yorumunda).
   */
  async execute(rawLimit: unknown): Promise<RaceLobbyView[]> {
    const limit = normalizeLobbyListLimit(rawLimit, this.config.raceLobby);
    return this.raceRepository.listLobbyRaces({ status: 'scheduled', limit });
  }
}
