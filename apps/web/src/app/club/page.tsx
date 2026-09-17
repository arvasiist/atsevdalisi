'use client';

/**
 * Kulüp — `apps/api/src/domain/club/club.ts` saf domain mantığı mevcut
 * ama HİÇBİR HTTP controller'ı yok (bkz. Faz 2 araştırma notları).
 */

import { ComingSoon } from '../../components/ui/ComingSoon';

export default function ClubPage(): React.ReactElement {
  return (
    <ComingSoon
      icon="🎽"
      title="Kulüp"
      description="Bir kulübe katıl veya kendi kulübünü kur; birlikte turnuvalara gir. Yakında burada olacak."
    />
  );
}
