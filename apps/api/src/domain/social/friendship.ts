/**
 * Arkadaşlık — SAF domain mantığı (framework'süz TS, `CLAUDE.md`
 * "KATMAN YÖNÜ TEK YÖNLÜ"). Proje sahibinin açık talebi (27.09.2026:
 * "arkadaşlık + mesajlaşma").
 *
 * **Buradaki en kritik karar: KANONİK ÇİFT.** `friendships` tablosu
 * (`migration 0033`) bir çifti TEK satırda tutar ve `player_low_id <
 * player_high_id` CHECK'i ile sırayı ZORLAR. Bu, "A→B isteği" ile "B→A
 * isteği"nin AYNI satır olması demektir; yani "iki taraf da birbirine
 * istek gönderdi" diye ikinci bir bekleyen kayıt OLUŞAMAZ. Satırın
 * `requested_by_id` alanı ise isteği KİMİN başlattığını korur, böylece
 * gelen/giden listeleri ayrışabilir.
 *
 * **Sıralama uyumu (ince ama kritik):** `canonicalPair` JS'te metin
 * karşılaştırması yapar; veritabanı ise `uuid` tipini 16 baytlık
 * büyük-endian gösterimin `memcmp`'i ile karşılaştırır. Kanonik UUID
 * metninde tire konumları sabittir ve onaltılık karakterlerin sırası
 * ('0'-'9' < 'a'-'f') bayt değerlerinin sırasıyla (0x00-0x09 < 0x0A-0x0F)
 * AYNIDIR — bu yüzden iki taraf aynı sonuca varır. Uyuşmasalardı INSERT
 * CHECK'e takılır ve hata "anlaşılmaz bir 500" olarak görünürdü.
 * Ayrıca `toLowerCase()` UYGULANIR: istemci büyük harfli bir UUID
 * gönderirse PG onu normalize eder ama JS karşılaştırması farklı
 * sonuçlanabilirdi (0x41 'A' > 0x61 'a'). Küçük harfe indirmek bu
 * tuzağı kapatır.
 */

import { CannotFriendSelfError, FriendshipAlreadyExistsError, SocialLimitReachedError } from './errors';

/** `friendships` satırının kanonik çifti — DB CHECK'iyle birebir aynı sıra. */
export interface CanonicalPair {
  lowId: string;
  highId: string;
}

/**
 * Kendine arkadaşlık isteği gönderilmesini engeller. `friendships_not_self`
 * CHECK'inin (`migration 0033`) uygulama tarafındaki karşılığıdır: veritabanı
 * son savunma hattıdır, ama oraya varmadan anlamlı bir 400 dönmek gerekir.
 */
export function assertNotSelf(playerId: string, otherId: string): void {
  if (playerId === otherId) {
    throw new CannotFriendSelfError();
  }
}

/**
 * İki oyuncu id'sini `lowId < highId` sırasına sokar (küçük harfe indirerek
 * karşılaştırır). Çağıran ÖNCE `assertNotSelf` çağırmış olmalıdır; eşitlik
 * burada ele alınmaz (eşitlikte `lowId === highId` döner ve DB CHECK'i
 * yakalar — sessizce yanlış bir satır üretilmez).
 */
export function canonicalPair(a: string, b: string): CanonicalPair {
  const low = a.toLowerCase();
  const high = b.toLowerCase();
  return low < high ? { lowId: low, highId: high } : { lowId: high, highId: low };
}

/**
 * Çiftin VERİLEN oyuncuya göre "karşı tarafını" döndürür. Repository
 * sorguları (`WHERE player_low_id = $1 OR player_high_id = $1`) hangi
 * kolonun "ben" olduğunu bilmediğinden, okunan satırdan karşı tarafı
 * çıkarmak için bu yardımcı kullanılır.
 */
export function otherParty(pair: CanonicalPair, playerId: string): string {
  const self = playerId.toLowerCase();
  return pair.lowId === self ? pair.highId : pair.lowId;
}

/**
 * Yeni bir arkadaşlık isteği gönderilebilir mi?
 *
 * `existingStatus` çağıran tarafından SORGULANMIŞ olmalıdır (`null` = bu
 * çiftte kayıt yok).
 *
 * - `pending` / `accepted` → `FriendshipAlreadyExistsError` (409).
 * - `rejected` → **serbesttir**: reddedilen bir isteğin yeniden
 *   gönderilebilmesi bilinçlidir. Bu durumda yeni satır AÇILMAZ; çağıran
 *   mevcut satırı yeniden `pending` yapar (UNIQUE kısıtı ikinci satıra
 *   izin vermez) — `SendFriendRequestUseCase`'in yaptığı tam olarak budur.
 */
export function assertFriendRequestAllowed(existingStatus: 'pending' | 'accepted' | 'rejected' | null): void {
  if (existingStatus === 'pending' || existingStatus === 'accepted') {
    throw new FriendshipAlreadyExistsError(existingStatus);
  }
}

/**
 * Sosyal tavanı doğrular (`config/social.config.json`). `game-config`
 * yükleyicisi saf bir cast olduğu için (çalışma zamanı doğrulaması YOK)
 * bozuk bir sınır sessizce "sınırsız"a dönüşebilirdi; `limit <= 0` da
 * öyle — bu yüzden sınır burada da kontrol edilir.
 *
 * `currentCount`, o kuralın SAYDIĞI satır sayısıdır: `FRIENDS` için kabul
 * edilmiş arkadaşlıklar, `PENDING_REQUESTS` için gönderenin bekleyen
 * istekleri, `PENDING_INVITES` için gönderenin bekleyen yarış davetleri
 * (brief §16, §42 PHASE 11). Sınır KAPSAYICIDIR: tam `limit` kayıt varken
 * yenisi eklenemez (`isWithinWatchWindow`'un aksine "en fazla N"
 * anlamındadır, yani N'e ulaşmak engeldir).
 *
 * **NEDEN DAVET DE BURADA (ayrı bir kapı değil):** davet tavanı, arkadaşlık
 * isteği tavanıyla TAM OLARAK aynı sorunu çözer — karşı tarafa bildirim
 * üreten bir uç noktayı sınırlamak. İki ayrı fonksiyon yazmak, aynı
 * doğrulamayı (`limit` tam sayı mı, pozitif mi) iki kez yazmak ve iki
 * kopyanın ayrışmasına izin vermek olurdu.
 */
export function assertUnderSocialLimit(
  currentCount: number,
  limit: number,
  reason: 'FRIENDS' | 'PENDING_REQUESTS' | 'PENDING_INVITES',
): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Sosyal sınır geçersiz (config/social.config.json): ${limit}`);
  }
  if (currentCount >= limit) {
    throw new SocialLimitReachedError(reason, limit);
  }
}
