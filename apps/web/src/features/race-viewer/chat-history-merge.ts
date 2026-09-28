import type { RaceChatMessageView } from '@at-sevdalisi/shared-types';

/**
 * Yarış sohbeti akış birleştirmesi (brief §13, §42 PHASE 7.3 — 29.09.2026).
 *
 * `segment-merge.ts`'in KARDEŞİDİR ve AYNI gerekçeyle ayrı, saf bir
 * modülde durur: bu bir React bileşeninin içine gömülseydi yalnızca
 * tarayıcıda (ve yalnızca bir soket kurulduğunda) sınanabilirdi. Saf
 * fonksiyon = veritabanısız, soketsiz, tam matris test edilebilir
 * (`CLAUDE.md` "saf = veritabanısız tam matris test edilebilir").
 *
 * ## Neden `messageId` ile TEKİLLEŞTİRME ŞART
 *
 * `chat.history` **her `race.subscribe` çağrısında** yeniden gönderilir
 * (bkz. `race.gateway.ts` → `joinSharedPlayback`), ve `race.subscribe`
 * socket.io-client'ın otomatik yeniden bağlanması yüzünden bir ağ
 * kopmasından sonra KENDİLİĞİNDEN tekrar gönderilir (bkz.
 * `live-race-socket.ts` dosya başı doc yorumu "Reconnection dilimi").
 * Tekilleştirme olmasaydı her kopma, ekrandaki son 100 mesajı bir kez
 * daha EKLERDİ: yanlış bir SONUÇ üretmezdi ama kullanıcı aynı mesajı iki
 * kez, üç kez görürdü. `segment-merge.ts`'in çözdüğü sorunun birebir
 * aynısıdır.
 *
 * ## Neden `createdAt`'e göre SIRALAMA (basit "sona ekle" yetmez)
 *
 * İki kaynak YARIŞABİLİR: gateway `chat.history`'yi üretirken mesaj
 * geçmişini `await` ile OKUR (bkz. `listRaceMessagesUseCase.execute`), ve
 * o `await` sürerken odadaki BAŞKA bir izleyicinin mesajı
 * (`chat.message.received`) bu istemciye geçmişten ÖNCE ulaşabilir.
 * Koşulsuz "sona ekle" bu durumda ESKİ mesajları YENİ olanların arkasına
 * koyardı. `createdAt` sunucunun `economy_transactions`/`race_chat_messages`
 * satırından gelen GERÇEK damgadır — istemci saati DEĞİL — bu yüzden
 * sıralama için doğru anahtardır.
 *
 * Eşit `createdAt` (aynı milisaniyede yazılmış iki mesaj) `messageId` ile
 * kırılır: sıralama böylece TAMAMEN deterministiktir ve zaten sıralı bir
 * diziyi yeniden sıralamak onu DEĞİŞTİRMEZ (idempotent — ekranda titreme
 * olmaz).
 */

/** Sıralama anahtarı — `createdAt` (ISO 8601, sözlük sırası = kronolojik), eşitlikte `messageId`. */
function compareChatMessages(left: RaceChatMessageView, right: RaceChatMessageView): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }
  if (left.messageId === right.messageId) {
    return 0;
  }
  return left.messageId < right.messageId ? -1 : 1;
}

/**
 * Mevcut sohbet akışına yeni mesajları katar; `messageId`'ye göre
 * tekilleştirir, kronolojik sıralar ve en fazla `limit` mesaj tutar.
 *
 * **DEĞİŞİKLİK YOKSA AYNI DİZİYİ DÖNER** (`existing` referansı): bu bir
 * mikro-optimizasyon değil, `LiveRaceViewer`'ın render maliyeti için
 * gereklidir — yeni referans üretmek `RaceChatPanel`'i boşuna yeniden
 * çizerdi. `segment-merge.ts` de aynı sözleşmeyi taşır.
 *
 * `limit` ÇAĞIRANDAN gelir ve `config/chat.config.json → historyLimit`ten
 * okunur — koda gömülü bir sayı DEĞİLDİR (`CLAUDE.md` "SİHİRLİ SAYI YOK").
 * Sunucu da geçmişi aynı limitle kırpar; istemci tavanı yalnızca canlı
 * akışın sınırsız büyümesini engellemek içindir (uzun bir yarışta
 * binlerce mesaj birikmesin).
 */
export function mergeChatMessages(
  existing: RaceChatMessageView[],
  incoming: RaceChatMessageView[],
  limit: number,
): RaceChatMessageView[] {
  if (incoming.length === 0) {
    return existing;
  }

  const seen = new Set<string>();
  for (const message of existing) {
    seen.add(message.messageId);
  }

  const added: RaceChatMessageView[] = [];
  for (const message of incoming) {
    if (seen.has(message.messageId)) {
      continue;
    }
    seen.add(message.messageId);
    added.push(message);
  }

  if (added.length === 0) {
    return existing;
  }

  const merged = [...existing, ...added];
  merged.sort(compareChatMessages);

  return merged.length > limit ? merged.slice(merged.length - limit) : merged;
}
