/**
 * Master Development Brief §23 "Photo Finish" sunumu (bu turda EKLENDİ) —
 * yarış bittiğinde gösterilecek sonuç kartı (`FinishResultOverlay`,
 * `RaceHud.tsx`'te) ile son saniyelerdeki ağır çekim (slow-motion)
 * oynatma hızını hesaplayan SAF fonksiyonlar.
 *
 * Bu dosya framework'ten bağımsızdır (React/Three.js importu YOK) — bu
 * yüzden `track-path.ts`/`timeline-playback.ts`/`camera-director.ts` ile
 * AYNI şekilde bu ortamda gerçek `tsc --noEmit` + `tsx` ile doğrulanabilir
 * (bkz. `apps/web/tsconfig.logic.json`).
 *
 * ÖNEMLİ — brief'in "photo finish" tabiri burada İKİ AYRI şeyi ifade eder:
 * (1) yarış HER ZAMAN biterken gösterilen sonuç kartı (kim kaçıncı,
 * kazanana kaç saniye/metre fark) — bu HER yarışta gösterilir; (2) 1.'yle
 * 2.'nin arasındaki fark çok küçükse (`CLOSE_FINISH_THRESHOLD_MS`'in
 * altında) ekstra bir "FOTO FİNİŞ!" rozeti/vurgusu — gerçek hipodromlarda
 * bu tabirin klasik anlamı (kafa kafaya bitiş, fotoğrafla karar). İkisi de
 * ZATEN VAR OLAN `RaceFinishEntry`/`LiveRaceFinishedEntrant` verisinden
 * hesaplanır — yeni bir simülasyon/skor İCAT EDİLMEZ.
 */

/**
 * `RaceViewer.tsx`'in `RaceFinishEntry`'si (fixture/practice race) ile
 * `LiveRaceViewer.tsx`'in `LiveRaceFinishedEntrant`'ı (canlı yayın) FARKLI
 * alan adlarına sahip (`finishTimeMs` vs `finalTimeMs`, `horseId` her
 * ikisinde de var ama bot'larda `null` olabilir) — bu yüzden bu dosya
 * KENDİ normalize edilmiş giriş tipini tanımlar, her çağıran kendi
 * kaynağını buna eşler (adaptör deseni, `LiveLeaderboardEntry`'nin
 * `LiveRaceFinishedEntrant`'tan bağımsız kalmasıyla AYNI mantık).
 */
export interface PhotoFinishSourceEntry {
  horseId: string | null;
  displayName: string;
  finishPosition: number;
  /** DNF/yarışı bitirmeyen katılımcılar bu diziye HİÇ eklenmemelidir (çağıran filtreler). */
  finishTimeMs: number;
  performanceScore: number | null;
}

export interface PhotoFinishRow extends PhotoFinishSourceEntry {
  /** Kazanana (1.'ye) göre milisaniye fark — kazananın kendisi için her zaman 0. */
  gapToWinnerMs: number;
  isWinner: boolean;
}

/**
 * 1. ile 2. arasındaki fark bu eşiğin ALTINDAYSA "FOTO FİNİŞ!" rozeti
 * gösterilir. 150ms, gerçek hipodrom pratiğinde "burun farkı" (nose gap)
 * seviyesine yakın keyfi ama makul bir eşiktir — brief bir sayı VERMEDİĞİ
 * için burada seçildi, `config/` altındaki diğer sayısal dengelerle AYNI
 * ruhla (bkz. Faz 6 "Config ayrımı" dilimi, bu değer oraya taşınacak).
 */
export const CLOSE_FINISH_THRESHOLD_MS = 150;

/**
 * Giriş sırası ÖNEMLİ DEĞİLDİR — `finishPosition`'a göre YENİDEN sıralanır
 * (canlı yayında `finalResult`/`finishedEntrants` sırası sunucudan HANGİ
 * sırayla gelirse gelsin, brief'in her zaman "1.'den son'a" bir liste
 * istediği varsayılır). Boş dizi için boş dizi döner.
 */
export function buildPhotoFinishRows(entries: PhotoFinishSourceEntry[]): PhotoFinishRow[] {
  if (entries.length === 0) {
    return [];
  }
  const sorted = [...entries].sort((a, b) => a.finishPosition - b.finishPosition);
  const winnerFinishTimeMs = sorted[0]!.finishTimeMs;
  return sorted.map((entry) => ({
    ...entry,
    gapToWinnerMs: entry.finishTimeMs - winnerFinishTimeMs,
    isWinner: entry.finishPosition === 1,
  }));
}

/** Tek katılımcılı (ör. tek atlı pratik yarış — brief'in "bot rakipler yoksa" senaryosu) bir yarışta "foto finiş" ANLAMSIZDIR. */
export function isCloseFinish(rows: PhotoFinishRow[]): boolean {
  if (rows.length < 2) {
    return false;
  }
  const second = rows.find((row) => row.finishPosition === 2);
  if (!second) {
    return false;
  }
  return second.gapToWinnerMs <= CLOSE_FINISH_THRESHOLD_MS;
}

/**
 * Türkçe kısa gösterim: kazanan için "Kazanan", diğerleri için "+0,12 sn"
 * biçimi (virgül ondalık ayıracı — Türkçe yerelleştirme kuralı, projenin
 * geri kalanındaki diğer Türkçe metinlerle TUTARLI).
 */
export function formatFinishGap(gapMs: number): string {
  if (gapMs <= 0) {
    return 'Kazanan';
  }
  const seconds = gapMs / 1000;
  return `+${seconds.toFixed(2).replace('.', ',')} sn`;
}

/**
 * Yarışın son `FINISH_SLOWMO_WINDOW_MS` milisaniyesinde oynatma hızını
 * kademeli olarak `FINISH_SLOWMO_MIN_FACTOR`'a kadar düşüren ÇARPAN
 * (1 = normal hız, `FINISH_SLOWMO_MIN_FACTOR` = en yavaş). `RaceViewer.tsx`
 * bunu kullanıcının seçtiği `speedMultiplier` ile ÇARPAR — yeni bir
 * animasyon/asset GEREKMEZ, sadece ZATEN VAR OLAN interpolasyonlu oynatma
 * (`advancePlaybackTimeMs`) döngüsü final düzlükte YAVAŞLAR, tıpkı gerçek
 * yayınlardaki "bitiş çizgisi ağır çekimi" gibi bir izlenim VERİR.
 *
 * `durationMs <= 0` (henüz veri yok/geçersiz yarış) için her zaman 1
 * döner — bölme hatası veya anlamsız bir ağır çekim OLUŞMAZ.
 */
export const FINISH_SLOWMO_WINDOW_MS = 3000;
export const FINISH_SLOWMO_MIN_FACTOR = 0.25;

export function getFinishSlowMotionFactor(currentTimeMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 1;
  }
  const remainingMs = durationMs - currentTimeMs;
  if (remainingMs <= 0) {
    // Yarış bitti (veya bitiş anında) — en yavaş noktada sabit kal, ANİ bir sıçrama olmasın.
    return FINISH_SLOWMO_MIN_FACTOR;
  }
  if (remainingMs >= FINISH_SLOWMO_WINDOW_MS) {
    return 1;
  }
  const progress = 1 - remainingMs / FINISH_SLOWMO_WINDOW_MS; // 0 (pencere başı) → 1 (bitiş)
  return 1 - progress * (1 - FINISH_SLOWMO_MIN_FACTOR);
}
