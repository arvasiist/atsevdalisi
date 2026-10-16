/**
 * Hediye gönderimi görünümleri (proje sahibinin açık talebi, 27.09.2026 —
 * üç parçanın üçüncüsü: "tribün, arkadaşlık + mesajlaşma, hediye
 * gönderimi").
 *
 * `grandstand.ts`/`social.ts` ile AYNI ilke: bu tipler API yanıtının
 * GERÇEK şeklidir; sayfa/bileşen seviyesinde elle kopyalanmış arayüzler
 * KULLANILMAZ.
 *
 * **BU BİR PARA YOLUDUR** — bu yüzden aşağıdaki tiplerde iki kural
 * gözetilir: (1) miktar/birim SUNUCUDAN gelir, istemci hiçbir sayı
 * türetmez; (2) **KARŞI TARAFIN BAKİYESİ ASLA TAŞINMAZ** (bkz.
 * `SendGiftResult` doc yorumu — `social.ts`'teki `SocialPlayerView`'in
 * "başkasının parası gizlidir" kuralı, AUDIT_REPORT.md Bulgu S4).
 */

import type { Currency } from './currency';
import type { SocialPlayerView } from './social';

/**
 * `POST /players/:id/gifts` sonucu — GÖNDERENİN gördüğü makbuz.
 *
 * **`recipientBalance` BİLİNÇLİ OLARAK YOKTUR.** At Pazarı satın alması
 * (`ExecuteMarketPurchaseResult`) satıcının bakiyesini de döner; o desen
 * burada TAKLİT EDİLMEDİ: bir hediyenin alıcısı, gönderene kendi bakiyesini
 * göstermeyi KABUL ETMEMİŞTİR. Gönderenin görmesi gereken tek şey KENDİ
 * yeni bakiyesidir (`senderBalance`) — "ne kadar kaldı" sorusunun cevabı.
 *
 * `recipient` yalnızca `SocialPlayerView`'dir (kimlik + ad + seviye):
 * makbuzun "kime gitti" sorusunu cevaplaması için yeterli, fazlası değil.
 */
export interface SendGiftResult {
  giftId: string;
  currency: Currency;
  amount: number;
  recipient: SocialPlayerView;
  /** Gönderenin hediyeden SONRAKİ kendi bakiyesi — istemci bunu yeniden hesaplamaz. */
  senderBalance: { money: number; gems: number };
}

/**
 * Hediye geçmişinde tek bir satır.
 *
 * `direction`, sunucunun `sender_id` alanından türettiği yöndür:
 * `incoming` = bana geldi, `outgoing` = ben gönderdim. İstemci iki listeyi
 * bu alanla ayırmak zorunda KALMAZ (sunucu tek liste döner) ama her satırın
 * kendi yönünü taşıması, tek bir listede gösterim ve test doğrulaması için
 * gereklidir (`FriendRequestView.direction` ile AYNI gerekçe).
 *
 * `counterparty` her zaman DİĞER taraftır — kendi kaydını kendine
 * göstermek anlamsız olurdu.
 */
export interface GiftView {
  giftId: string;
  direction: 'incoming' | 'outgoing';
  counterparty: SocialPlayerView;
  currency: Currency;
  /** Her zaman POZİTİF (yön `direction` ile bellidir — bkz. migration 0034). */
  amount: number;
  createdAt: string;
}

/**
 * 08.10.2026 — DOSTLUK HEDİYESİ. Gönderen hiçbir şey ödemez; alıcı
 * toplayınca çip `friend_gift_collect` defter satırıyla girer.
 */
export interface FriendGiftPendingView {
  giftId: string;
  sender: { playerId: string; username: string; displayName: string };
  amount: number;
  createdAt: string;
}

export interface FriendGiftBoardView {
  /** Bir hediyenin tutarı (config). */
  amount: number;
  dailyCollectLimit: number;
  /** Bugün (oyun saat dilimi) toplanan hediye sayısı. */
  collectedToday: number;
  remainingCollectsToday: number;
  /** Süresi geçmemiş, toplanmamış hediyeler (sayı + toplam tutar). */
  pendingCount: number;
  pendingAmount: number;
  pending: FriendGiftPendingView[];
  /** Hediye gönderilebilecek arkadaş sayısı (engel/silinmiş hesap hariç). */
  friendCount: number;
  /** Bugün hediye gönderilmiş arkadaş sayısı. */
  sentToday: number;
  /** 16.10.2026 — gönderen öder: bir hediyenin gönderene maliyeti (= `amount`). */
  sendCost: number;
  dailySendBudget: number;
  /** Bugün hediyeye harcanan çip. */
  spentToday: number;
  remainingSendBudget: number;
  /** Şimdi "Hepsine Gönder"e basılırsa hediye gidecek arkadaşlar (bütçe + bakiye sınırlı). */
  nextRecipients: FriendGiftRecipientView[];
  /** Bugün henüz hediye gönderilmemiş uygun arkadaş sayısı. */
  unsentEligibleCount: number;
  /** Önizlemenin neden herkesi kapsamadığı: bütçe ya da bakiye. */
  limitedBy: 'none' | 'budget' | 'funds';
}

export interface FriendGiftRecipientView {
  playerId: string;
  username: string;
  displayName: string;
}

export type FriendGiftRecipientStatus = 'sent' | 'already_sent' | 'budget_exhausted' | 'insufficient_funds';

export interface FriendGiftRecipientResult extends FriendGiftRecipientView {
  status: FriendGiftRecipientStatus;
}

export interface FriendGiftSendAllResult {
  /** Bu istekte hediye gönderilen arkadaş sayısı. */
  sent: number;
  /** Bugün zaten hediye gönderilmiş olan arkadaş sayısı. */
  alreadySentToday: number;
  /** Bu istekte gönderenden düşen çip (`sent × amount`). */
  cost: number;
  /** Süresi dolmuş, toplanmamış ödenmiş hediyelerden gönderene dönen çip. */
  refunded: number;
  balanceAfter: number;
  /** Kişi başı sonuç: kime gitti, kim neden atlandı. */
  recipients: FriendGiftRecipientResult[];
}

export interface FriendGiftCollectResult {
  collected: number;
  amount: number;
  balanceAfter: number;
  remainingCollectsToday: number;
  /** Günlük sınır yüzünden bekleyen (yarın toplanabilir) hediye sayısı. */
  stillPending: number;
}
