'use client';

/**
 * Çiftlik — `apps/api/src/domain/farm/farm.ts` saf domain mantığı olarak
 * mevcut ama HİÇBİR HTTP controller'ı yok (bkz. Faz 2 araştırma notları).
 * Bir backend endpoint'i olmadan bu ekran gerçek veriyle çalışamaz —
 * dürüst bir "yakında" durumu.
 */

import { ComingSoon } from '../../components/ui/ComingSoon';

export default function FarmPage(): React.ReactElement {
  return (
    <ComingSoon
      icon="🌾"
      title="Çiftlik"
      description="Yem üretimi ve kaynak yönetimi için çiftlik ekranı yakında burada olacak."
    />
  );
}
