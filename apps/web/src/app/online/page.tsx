'use client';

/**
 * Online — PvP eşleştirme domain mantığı (`apps/api/src/domain/online/`)
 * ve `savePvpMatch` persistence katmanı mevcut, ancak bir eşleştirme
 * ekranı (matchmaking queue UI) Faz 2 kapsamının dışında bırakıldı.
 */

import { ComingSoon } from '../../components/ui/ComingSoon';

export default function OnlinePage(): React.ReactElement {
  return (
    <ComingSoon
      icon="🌐"
      title="Online"
      description="Diğer oyunculara karşı gerçek zamanlı PvP yarışları yakında burada olacak."
    />
  );
}
