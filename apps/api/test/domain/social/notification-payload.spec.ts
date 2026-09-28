import { describe, expect, it } from 'vitest';
import {
  buildFriendAcceptedPayload,
  buildFriendRequestPayload,
  buildGiftReceivedPayload,
  buildMessagePreview,
  buildMessageReceivedPayload,
} from '../../../src/domain/social/notification';

/**
 * Bildirim `payload` kurucuları + önizleme kırpma (brief §28, §42 PHASE 13).
 *
 * **NEDEN AYRI BİR DOSYA (`notification-types.spec.ts` yerine):** o dosya
 * `NOTIFICATION_TYPES` listesinin migration 0039 CHECK'i ile ve
 * `packages/shared-types` ile BİREBİR olduğunu denetler — bir SENKRON
 * testidir. Burası ise davranış testidir; ikisini karıştırmak, bir kayma
 * olduğunda hangi iddianın düştüğünü okumayı zorlaştırırdı.
 */
describe('buildMessagePreview — önizleme kırpma', () => {
  it('sınırın ALTINDAKİ gövdeyi OLDUĞU GİBİ döner (üç nokta EKLENMEZ)', () => {
    // Sığan bir mesaja `…` eklemek "devamı var" yalanı olurdu.
    expect(buildMessagePreview('merhaba', 120)).toBe('merhaba');
  });

  it('sınıra TAM EŞİT gövdeyi de olduğu gibi döner (sınır dahildir)', () => {
    const body = 'A'.repeat(10);
    expect(buildMessagePreview(body, 10)).toBe(body);
  });

  it('sınırı AŞAN gövdeyi kırpar ve sonuna üç nokta ekler', () => {
    expect(buildMessagePreview('A'.repeat(20), 10)).toBe(`${'A'.repeat(10)}…`);
  });

  it('satır sonlarını KORUR (boşluğa çevirmez)', () => {
    expect(buildMessagePreview('bir\niki', 120)).toBe('bir\niki');
  });

  it('VEKİL ÇİFTİ (emoji) ORTASINDAN KESMEZ', () => {
    // `String.prototype.slice` UTF-16 kod birimleri üzerinde çalışır ve
    // burada yarım bir vekil çift bırakırdı — istemciye `�` gitmesi,
    // kırpmanın kendisinden daha kötüdür. `Array.from` kod noktalarına
    // ayırır. 🐎 tek bir kod noktasıdır (U+1F40E, iki kod birimi).
    const preview = buildMessagePreview('🐎🐎🐎🐎', 2);
    expect(preview).toBe('🐎🐎…');
    expect(preview).not.toContain('�');
  });

  it('BOZUK sınırda (0/negatif) HER mesajı `…` yapmaz — kırpma kapanır', () => {
    // `Number.isInteger` kontrolü olmasaydı bozuk bir config bütün
    // önizlemeleri tek karaktere düşürürdü ve hata hiçbir yerde görünmezdi.
    expect(buildMessagePreview('merhaba', 0)).toBe('merhaba');
    expect(buildMessagePreview('merhaba', -5)).toBe('merhaba');
    expect(buildMessagePreview('merhaba', 1.5)).toBe('merhaba');
  });
});

describe('payload kurucuları — şekil sözleşmesi', () => {
  /**
   * **BU TESTİN ASIL DEĞERİ:** `NotificationPayloadByType` (shared-types)
   * ile üretilen payload arasındaki kaymayı YAKALAMASI. Kurucular dönüş
   * tipini açıkça bildirdiği için alan EKLENMESİ derleme hatası olur; ama
   * alan SİLİNMESİ ya da yeniden ADLANDIRILMASI sessizce geçebilir —
   * `toEqual` tam eşitlik istediğinden o da burada yakalanır.
   */
  it('friend_request: requestId + playerId + displayName', () => {
    expect(
      buildFriendRequestPayload({ requestId: 'r1', playerId: 'p1', displayName: 'Ömer' }),
    ).toEqual({ requestId: 'r1', playerId: 'p1', displayName: 'Ömer' });
  });

  it('friend_accepted: friendshipId + playerId + displayName', () => {
    expect(
      buildFriendAcceptedPayload({ friendshipId: 'f1', playerId: 'p2', displayName: 'Ayşe' }),
    ).toEqual({ friendshipId: 'f1', playerId: 'p2', displayName: 'Ayşe' });
  });

  it('message_received: messageId + playerId + displayName + preview', () => {
    expect(
      buildMessageReceivedPayload({
        messageId: 'm1',
        playerId: 'p3',
        displayName: 'Zeynep',
        preview: 'selam',
      }),
    ).toEqual({ messageId: 'm1', playerId: 'p3', displayName: 'Zeynep', preview: 'selam' });
  });

  it('gift_received: giftSendId + playerId + displayName + currency + amount', () => {
    // `currency` payload'da ZORUNLUDUR: "500" tek başına belirsizdir
    // (Çip mi Elmas mı) ve istemcinin bunu tahmin etmesi, sunucunun
    // bildiği bir şeyi istemciye sormak olurdu.
    expect(
      buildGiftReceivedPayload({
        giftSendId: 'g1',
        playerId: 'p4',
        displayName: 'Ömer',
        currency: 'money',
        amount: 500,
      }),
    ).toEqual({ giftSendId: 'g1', playerId: 'p4', displayName: 'Ömer', currency: 'money', amount: 500 });
  });

  it('gift_received miktarı İŞARETSİZ kalır (yön satırın kendisindedir)', () => {
    // Negatif bir miktar, istemciye "500 Çip KAYBETTİN" dedirtirdi —
    // oysa bu bildirim yalnızca hediye ALANA yazılır.
    const payload = buildGiftReceivedPayload({
      giftSendId: 'g1',
      playerId: 'p4',
      displayName: 'Ömer',
      currency: 'gems',
      amount: 15,
    });
    expect(payload.amount).toBeGreaterThan(0);
  });

  it('kurucular girdiyi TAŞIMAZ, kopyalar (dış referans sonradan değişse de payload sabit kalır)', () => {
    // Payload doğrudan `JSON.stringify` edilip veritabanına yazılır; girdi
    // nesnesini olduğu gibi döndürmek, çağıranın aynı nesneyi sonradan
    // mutasyona uğratması hâlinde yazılan JSON ile dönen tip arasında
    // görünmez bir fark doğururdu.
    const input = { requestId: 'r1', playerId: 'p1', displayName: 'Ömer' };
    const payload = buildFriendRequestPayload(input);
    input.displayName = 'DEĞİŞTİ';
    expect(payload.displayName).toBe('Ömer');
  });
});
