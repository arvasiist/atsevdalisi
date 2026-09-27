import { Inject, Injectable } from '@nestjs/common';
import type { LeaderboardRowView } from '@at-sevdalisi/shared-types';
import { buildLeaderboard, sumRankingScores } from '../../domain/ranking/leaderboard';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { LEADERBOARD_REPOSITORY, type LeaderboardRepository } from '../ports/leaderboard.repository';

/**
 * Sıralama tablosunda gösterilecek en fazla satır sayısı. Bilinçli olarak
 * ADLANDIRILMIŞ bir sabittir (CLAUDE.md "SİHİRLİ SAYI YOK"). Uç noktaya bir
 * `limit` parametresi EKLENMEDİ: kullanıcı girdisiyle sınırı değiştirmek
 * doğrulama/kırpma kuralları gerektirirdi ve arayüzün böyle bir denetime
 * ihtiyacı yok. Sıralamanın tamamı gerektiğinde (örn. "senin sıran" bir
 * sayfada gösterilecekse) önce `LeaderboardRepository` ölçeklenmelidir.
 */
const LEADERBOARD_TOP_N = 50;

/**
 * brief §43 "Global" sıralama. Bu use-case KURAL İÇERMEZ — puanlama ve
 * sıralama `domain/ranking/`'de yaşar; burada yalnızca üç şey yapılır:
 * repository'den ham kayıtları al, domain fonksiyonlarına ver, sonucu
 * API'nin dışa açtığı görünüme (`LeaderboardRowView`) çevir.
 *
 * Sıralama CANLI hesaplanır (her istekte). Sebep: kalıcı bir `leaderboards`
 * tablosu `database/migrations/0009_create_indexes.up.sql:23`'te BİLİNÇLİ
 * olarak FAZ 7'ye bırakılmıştır; o tablo gelene kadar canlı hesaplama, boş
 * bir "yakında" ekranı yerine GERÇEK veriyi gösterir. Bu bir ara çözümdür,
 * gizlenmez.
 */
@Injectable()
export class GetLeaderboardUseCase {
  constructor(
    @Inject(LEADERBOARD_REPOSITORY) private readonly leaderboardRepository: LeaderboardRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(): Promise<LeaderboardRowView[]> {
    const records = await this.leaderboardRepository.findAllFinishedRaceRecords();

    // İki harita da AYNI `records` listesinden üretilir; bu yüzden aşağıdaki
    // `get(...)` çağrıları hiçbir zaman boş dönmez. Bir `?? 0` varsayılanı
    // yazmak, gerçekte olamayacak bir durumu gizleyip hatayı sessizleştirirdi.
    const totals = sumRankingScores(records, this.config.online);
    const displayNames = new Map(records.map((record) => [record.playerId, record.displayName]));
    const totalsByPlayer = new Map(totals.map((total) => [total.playerId, total]));

    const ranked = buildLeaderboard(
      totals.map((total) => ({
        playerId: total.playerId,
        scope: 'global' as const,
        scopeKey: null,
        score: total.score,
        updatedAt: total.lastFinishedAt,
      })),
    );

    return ranked.slice(0, LEADERBOARD_TOP_N).map((entry) => ({
      rank: entry.rank,
      playerId: entry.playerId,
      displayName: displayNames.get(entry.playerId)!,
      score: entry.score,
      raceCount: totalsByPlayer.get(entry.playerId)!.raceCount,
    }));
  }
}
