import { createSeededRandom } from '@at-sevdalisi/shared-types';

/**
 * `noUncheckedIndexedAccess` altında bir dizinin `index` konumundaki
 * elemanını GÜVENLİ şekilde okur — Fisher-Yates döngüsünün kendi sınır
 * matematiği elemanın var olduğunu zaten garanti eder, ama TypeScript
 * bunu STATİK olarak bilemez (bkz. `assignGatePositions` içindeki doc
 * yorumu). `!` tip zorlaması yerine gerçek bir çalışma zamanı kontrolü —
 * varsayım bir gün yanlış çıkarsa sessizce `undefined` sızdırmak yerine
 * AÇIKÇA hata fırlatır.
 */
function readIndexOrThrow(values: readonly string[], index: number): string {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`gate-assignment: dizi indeksi [${index}] beklenenden boş (uzunluk=${values.length})`);
  }
  return value;
}

/**
 * AUDIT_REPORT.md Bulgu R3 (Low, bu oturum) — "Draw/post-position" alanı,
 * proje sahibinin R3'ün Current Form dilimi kapandıktan sonra seçtiği
 * ikinci alt-dilim (bkz. proje dokümanı "hizli-bitirme-plani.md"). R3'ün
 * kendi Evidence listesi Draw'ı "ya hiç yok ya da her zaman nötr 50"
 * olarak tarif ediyordu — gerçekte Draw `entrant-snapshot.ts`'in
 * `UNMODELED_SNAPSHOT_FIELDS`'ında BİLE değildi, çünkü kendi sütunu
 * (`race_entries.gate_position`, migration 0006 — projenin İLK yarış
 * migration'ı) hâlâ VAR ama `RaceEntry.gatePosition` HER YERDE
 * (`run-practice-race.use-case.ts`, `join-matchmaking-queue.use-case.ts`)
 * sabit `null` yazılıyordu — `horse_surface_stats`/`horse_distance_stats`
 * ile AYNI "rezerve edilmiş ama hiç doldurulmamış sütun" kalıbı (bkz.
 * `entrant-snapshot.ts`'in üst doc yorumu).
 *
 * **Tasarım kararı — bu dilimde SIFIR motor/denge etkisi:** T3b'nin (bu
 * oturum) öğrettiği sert ders — motor mekanikleri doğrusal/simetrik tepki
 * VERMEYEBİLİR, `pace`/`overtaking` gibi mevcut formüllere dokunan HER
 * değişiklik push ÖNCESİ kapsamlı ampirik (Monte Carlo) doğrulama
 * gerektirir — burada BİLİNÇLİ olarak uygulanmadı. Gate/kulvar sayısı
 * (`config.lanes.count = 4`) yarış stili sayısına (4) TAM eşit olduğundan
 * (`overtaking.ts`'in `assignInitialLane`'i), draw'ı kulvar atamasına
 * bağlamak aynı-stilli atlar arasında rekabeti YENİDEN dağıtır ve
 * kapsamlı yeniden dengeleme gerektirirdi — Master Plan Phase B/C'ye
 * bırakıldı (bkz. `AUDIT_REPORT.md` R3 bölümü). Bu fonksiyon SAF OLARAK
 * `race-engine.ts`'in DIŞINDA, simülasyon ZATEN tamamlandıktan SONRA
 * çağrılır (`RACE_ENGINE_VERSION`/`RACE_RULESET_VERSION` DEĞİŞMEDİ,
 * replay/determinism garantisi ETKİLENMEDİ) — yalnızca gerçek yarışçılık
 * bağlamında oyuncuya/analiste ANLAMLI olan, deterministik, tekrarlanabilir
 * bir "start numarası" ataması sağlar (gerçek at yarışlarındaki "gate
 * draw" töreninin dijital karşılığı).
 *
 * **Determinizm:** `createSeededRandom` ile AYNI isim uzayı kuralı
 * (`${seed}:${raceId}:gate-draw`, bkz. `race-engine.ts`'in dosya başı doc
 * yorumu) — aynı yarış (aynı seed+raceId+katılımcı kümesi) HER ZAMAN aynı
 * çekilişi üretir; başka bir yarışın/segmentin/atın rastgele akışını
 * ETKİLEMEZ (ayrı isim uzayı).
 */
export function assignGatePositions(
  entryLabels: readonly string[],
  simulationSeed: string,
  raceId: string,
): Map<string, number> {
  const rng = createSeededRandom(`${simulationSeed}:${raceId}:gate-draw`);

  // Girdi dizisinin ÇAĞIRAN tarafından hangi sırada inşa edildiği
  // (Map/array oluşturma sırası) sonucu ETKİLEMEMELİ — bu yüzden karıştırma
  // öncesi etiketler ÖNCE kanonik (alfabetik) sıraya konur.
  const canonicalOrder = [...entryLabels].sort();

  // Fisher-Yates shuffle — `rng()` HER çağrıda [0,1) döner (bkz.
  // `deterministic-random.ts`), bu yüzden aynı seed AYNI permütasyonu
  // üretir.
  //
  // NOT (bu oturumda CI #128'in yakaladığı gerçek bir hata): projenin
  // `tsconfig.base.json`'ı `noUncheckedIndexedAccess: true` kullanıyor —
  // yani `shuffled[i]` okuması TypeScript'e göre `string | undefined`
  // döner (döngü sınırları HER ZAMAN geçerli olsa bile). Doğrudan
  // `[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]` takas
  // deseni bu yüzden derlenmiyordu. Çözüm `!` ile tip zorlaması DEĞİL —
  // `readIndexOrThrow` gerçek bir ÇALIŞMA ZAMANI kontrolü yapıyor, döngü
  // matematiği bir yerde bozulursa (ör. ileride biri sınırları değiştirirse)
  // sessizce `undefined` yazmak yerine AÇIKÇA hata fırlatıyor.
  const shuffled = [...canonicalOrder];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const valueAtI = readIndexOrThrow(shuffled, i);
    const valueAtJ = readIndexOrThrow(shuffled, j);
    shuffled[i] = valueAtJ;
    shuffled[j] = valueAtI;
  }

  const gatePositionByLabel = new Map<string, number>();
  shuffled.forEach((label, index) => {
    gatePositionByLabel.set(label, index + 1);
  });
  return gatePositionByLabel;
}
