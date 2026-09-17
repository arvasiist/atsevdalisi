'use client';

/**
 * Sıralama — `packages/shared-types/src/online.ts`'te `LeaderboardEntry`/
 * `RankedLeaderboardEntry` türleri ve `apps/api/src/domain/ranking/
 * leaderboard.ts` saf domain mantığı mevcut, ama HİÇBİR HTTP controller'ı
 * yok (bkz. Faz 2 araştırma notları) — sahte bir sıralama tablosu
 * UYDURMAK yerine dürüst bir "yakında" durumu.
 */

import { ComingSoon } from '../../components/ui/ComingSoon';

export default function LeaderboardPage(): React.ReactElement {
  return (
    <ComingSoon
      icon="🏆"
      title="Sıralama"
      description="Küresel, ülke ve kulüp bazlı sıralamalar yakında burada olacak."
    />
  );
}
