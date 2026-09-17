'use client';

/**
 * Antrenman — domain mantığı `apps/api/src/domain/training/` altında
 * mevcut ve `POST /horses/:id/train` bağlı (bkz. `docs/API.md` "Antrenman"
 * bölümü), ANCAK bu ekranın kendisi (antrenman türü/yoğunluk seçimi,
 * sonuç görselleştirmesi) Faz 2 kapsamının dışında bırakıldı — Faz 2
 * yalnızca Ana Sayfa + Ahırım'ı kapsıyordu (bkz. görsel kalite planı).
 * Sahte bir antrenman ekranı UYDURMAK yerine dürüst bir "yakında" durumu.
 */

import { ComingSoon } from '../../components/ui/ComingSoon';

export default function TrainingPage(): React.ReactElement {
  return (
    <ComingSoon
      icon="🏋️"
      title="Antrenman"
      description="Hız, sprint, dayanıklılık ve daha fazlası için antrenman programları yakında burada olacak."
    />
  );
}
