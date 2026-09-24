/**
 * F2 canlı yayın entegrasyonu — reconnection dilimi (bu turda EKLENDİ).
 *
 * `race.gateway.ts`'in doc yorumu ("Kapsam DIŞI" bölümü — bu dosyanın
 * yazıldığı anda GÜNCELLENDİ) şunu açıkça belirtiyordu: bağlantı koparsa
 * istemci `race.subscribe`'ı BAŞTAN çağırır, ve backend'in paylaşılan
 * `RacePlaybackSession`'ı sayesinde bu bir "yakalama" (`catch-up`)
 * `race.telemetry` olayından FAYDALANIR (bkz. `joinSharedPlayback`) — YENİ
 * bir yeniden bağlanma PROTOKOLÜ İCAT ETMEZ, backend'in ZATEN idempotent
 * olan `race.subscribe`'ını yeniden çağırmaktan ibarettir.
 *
 * Ama bu, `socket.io-client`'ın KENDİ otomatik yeniden bağlanmasıyla
 * (varsayılan: `reconnection: true`, sınırsız deneme) BİRLEŞTİĞİNDE
 * frontend'de GERÇEK bir boşluk bırakıyordu: `live-race-socket.ts`'teki
 * `socket.on('connect', ...)` dinleyicisi BİR KEZ eklenir ama HER
 * (yeniden) bağlanmada YENİDEN ateşlenir (socket.io'nun kendi davranışı —
 * `'connect'` tek seferlik bir olay DEĞİLDİR), yani `race.subscribe` her
 * yeniden bağlanmada OTOMATİK olarak tekrar gönderilir — BU KISIM zaten
 * doğru çalışıyordu. Ama backend'in "yakalama" mekanizması HER
 * `race.subscribe`'da ŞİMDİYE KADAR ateşlenmiş TÜM segmentleri YENİDEN
 * gönderir (bkz. `joinSharedPlayback`'in doc yorumu — bu İLK bağlantı İÇİN
 * doğru davranıştır) — `LiveRaceViewer.tsx`'in ESKİ `onTelemetry` işleyicisi
 * bunları KOŞULSUZ olarak mevcut diziye EKLİYORDU (`[...segmentsRef.current,
 * ...newSegments]`), yani her yeniden bağlanmada AYNI segmentler dizide
 * TEKRAR TEKRAR birikiyordu (yarış bitmeden önce N kez bağlantı koparsa
 * dizi boyutu ~N katına çıkardı). Sonuç yanlış bir at pozisyonu ÜRETMEZDİ
 * (`interpolateHorseStateAtTime` aynı `timestampMs`'e sahip yinelenen
 * noktalar arasında enterpolasyon yapsa da sonuç DEĞİŞMEZ), ama sınırsız
 * bellek büyümesi GERÇEK bir hataydı.
 *
 * Bu dosyanın tek işi budur: `raceEntryId:timestampMs` bileşik anahtarına
 * göre TEKİLLEŞTİRİLMİŞ bir birleştirme — hem İLK yükleme hem her
 * yeniden bağlanmadaki "yakalama" hem de normal canlı yayın segmentleri
 * AYNI fonksiyondan geçer, sonuç HER ZAMAN tekildir. Bu, `live-race-url.ts`
 * ile AYNI "saf mantığı ayır" deseni — framework/socket.io bağımsız
 * olduğundan bu sandbox'ta GERÇEKTEN hem `tsc --noEmit` hem `tsx` ile
 * (fonksiyon gerçekten çağrılarak) doğrulanabilir.
 */

import type { RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';

function segmentKey(segment: RaceSegmentSnapshot): string {
  return `${segment.raceEntryId}:${segment.timestampMs}`;
}

/**
 * `existing` ile `incoming`'i `raceEntryId:timestampMs` anahtarına göre
 * tekilleştirerek birleştirir. Aynı anahtara sahip bir segment HEM
 * `existing`'de HEM `incoming`'de varsa `incoming`'deki değer kazanır
 * (aynı backend playback oturumundan geldiklerinden pratikte HER ZAMAN
 * birebir aynıdırlar — ama "en güncel veri kazanır" ilkesi, gelecekte
 * backend'in aynı zaman damgasını revize etmesi ihtimaline karşı da
 * DOĞRU davranıştır). Sonuç, girdi sırasına BAKILMAKSIZIN `timestampMs`'e
 * göre artan sırada döner — `timeline-playback.ts`'in `interpolateHorseStateAtTime`'ı
 * zaten kendi içinde sıralasa da (bkz. o dosyanın kaynak kodu), çağıran
 * tarafın (`LiveRaceViewer.tsx`) `raceDistanceMeters` gibi başka saf
 * `reduce`'ları da bu sıralamadan YARARLANIR.
 */
export function mergeSegments(
  existing: readonly RaceSegmentSnapshot[],
  incoming: readonly RaceSegmentSnapshot[],
): RaceSegmentSnapshot[] {
  const byKey = new Map<string, RaceSegmentSnapshot>();
  for (const segment of existing) {
    byKey.set(segmentKey(segment), segment);
  }
  for (const segment of incoming) {
    byKey.set(segmentKey(segment), segment);
  }
  return [...byKey.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}
