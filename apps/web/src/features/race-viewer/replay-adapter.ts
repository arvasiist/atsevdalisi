/**
 * "AT SEVDALISI — Master Development Brief" §22 "PHASE 12 — REPLAY" (bu
 * dosya bu turda EKLENDİ — `docs/AUDIT_REPORT.md`'nin "MISSING FEATURES"
 * listesindeki "§22 Replay (bağımsız gözatma): ... ayrı bir 'geçmiş
 * yarışları ara/izle' kütüphane ekranı HÂLÂ YOK" bulgusunun kapatılması).
 *
 * `GET /races/:id/timeline` (`RaceTimelineController`) `RaceTimelineView`
 * döner — bu, `RaceViewer.tsx`'in beklediği `RaceTimeline` şeklinden
 * KASITLI OLARAK FARKLIDIR (bkz. her iki tipin `packages/shared-types/src/
 * race.ts`'teki doc yorumları): `RaceTimelineView.entrants[]` her
 * katılımcının (gerçek at VEYA bot) segmentlerini/sonucunu KENDİ İÇİNDE
 * tutar (`entryId` anahtarıyla), `RaceTimeline` ise TEK bir düz
 * `segments`/`finalResult` dizisi bekler (`raceEntryId`/`horseId`
 * anahtarıyla — bkz. `RaceViewer.tsx`'in `computeHorseVisualsAt` doc
 * yorumu: "İkinci parametrenin adı 'horseId' olsa da OPAK bir anahtar
 * olarak kullanılır"). Bu dosya SAF bir DÖNÜŞÜM katmanıdır — YENİ bir
 * hesaplama/iş kuralı İÇERMEZ, yalnızca `RaceTimelineView`'in ZATEN VAR
 * OLAN alanlarını `RaceTimeline`'ın beklediği şekle YENİDEN DÜZENLER —
 * bu yüzden `track-path.ts`/`photo-finish.ts` ile AYNI şekilde bu
 * sandbox'ta gerçek `tsc --noEmit` + `tsx` ile doğrulanabilir (framework/
 * DOM bağımsız, bkz. `apps/web/tsconfig.logic.json`).
 *
 * Anahtar seçimi: her katılımcının `entryId`'si (asla `null` değildir,
 * `race_entries.id`) "at kimliği" (opak anahtar) olarak kullanılır —
 * gerçek `horseId` DEĞİL, çünkü bot katılımcılarda `horseId` `null`dur
 * (bkz. `RaceTimelineEntrantView`'in doc yorumu) ve `RaceViewer`'ın
 * pipeline'ı (leaderboard/kamera/HUD) HERHANGİ bir string'i opak bir
 * kimlik olarak kabul eder — `RaceSegmentSnapshot.raceEntryId` da ZATEN
 * bu anahtarla saklanmıştır, bu yüzden bu seçim UYDURMA bir eşleme
 * DEĞİL, veritabanının KENDİ birincil anahtarını KULLANMAKTIR.
 *
 * `RaceTimeline.explanations` alanı BİLİNÇLİ OLARAK boş dizi döner —
 * `RaceTimelineView` bu veriyi HİÇ TAŞIMAZ (yalnızca `PracticeRaceResult`
 * taşır, bkz. o tipin doc yorumu) VE `RaceViewer`/`RaceHud`'un KENDİSİ bu
 * alanı hiç OKUMAZ (yalnızca `apps/web/src/app/races/page.tsx`'teki
 * pratik-yarış SONUÇ ekranı okur) — bu yüzden boş dizi UYDURMA bir veri
 * DEĞİL, gerçekten kullanılmayan bir alanın zararsız varsayılanıdır.
 */

import type { RaceFinishEntry, RaceSegmentSnapshot, RaceTimeline, RaceTimelineView } from '@at-sevdalisi/shared-types';

export interface ReplayTimelineData {
  timeline: RaceTimeline;
  horseNamesById: Record<string, string>;
}

/**
 * `view.entrants`'ten, GERÇEKTEN bitmiş (finish verisi `null` OLMAYAN)
 * katılımcıları süzer — bir replay'in var oluş amacı zaten SONUÇLANMIŞ
 * bir yarışı göstermektir (bkz. `GetRaceTimelineUseCase`'in `RaceRepository.
 * findTimelineByRaceId` sözleşmesi), ama tip sistemi `finalTimeMs`/
 * `finishPosition`/`performanceScore`'u `number | null` olarak tanımladığı
 * için (bkz. `RaceTimelineEntrantView`) burada GERÇEK bir çalışma zamanı
 * guard'ı var — sahte bir `0` değeriyle "bitirmemiş" bir katılımcıyı
 * "0. sırada bitirmiş" gibi GÖSTERMEK yerine, o katılımcı basitçe replay
 * DIŞINDA bırakılır (segmentleri de birlikte, aksi halde `RaceViewer`
 * ekranda hareket eden ama hiçbir zaman bitiş çizgisini geçmeyen "hayalet"
 * bir at gösterirdi).
 */
function hasCompleteFinishData(
  entrant: RaceTimelineView['entrants'][number],
): entrant is RaceTimelineView['entrants'][number] & {
  finalTimeMs: number;
  finishPosition: number;
  performanceScore: number;
} {
  return entrant.finalTimeMs !== null && entrant.finishPosition !== null && entrant.performanceScore !== null;
}

/**
 * `view`'den `RaceViewer`'ın tükettiği şekli üretir. Dönen `timeline.
 * finalResult`/`horseNamesById` boş olabilir (HİÇBİR katılımcının bitiş
 * verisi tamsa değilse) — çağıran taraf (`/replays/[raceId]/page.tsx`)
 * bu durumu AÇIKÇA bir hata mesajıyla ele almalıdır, `RaceViewer`'ı boş
 * veriyle mount ETMEMELİDİR (bkz. o dosyanın doc yorumu).
 */
export function adaptRaceTimelineViewToReplayData(view: RaceTimelineView): ReplayTimelineData {
  const completedEntrants = view.entrants.filter(hasCompleteFinishData);

  const segments: RaceSegmentSnapshot[] = completedEntrants.flatMap((entrant) => entrant.segments);

  const finalResult: RaceFinishEntry[] = completedEntrants.map((entrant) => ({
    horseId: entrant.entryId,
    finishTimeMs: entrant.finalTimeMs,
    finishPosition: entrant.finishPosition,
    performanceScore: entrant.performanceScore,
  }));

  const horseNamesById: Record<string, string> = {};
  for (const entrant of completedEntrants) {
    horseNamesById[entrant.entryId] = entrant.horseName ?? entrant.botLabel ?? 'Bilinmeyen katılımcı';
  }

  return {
    timeline: {
      raceId: view.raceId,
      simulationSeed: view.simulationSeed ?? '',
      segments,
      finalResult,
      explanations: [],
    },
    horseNamesById,
  };
}
