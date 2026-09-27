import { Inject, Injectable } from '@nestjs/common';
import type { RaceChatMessageView } from '@at-sevdalisi/shared-types';
import { normalizeMessageBody } from '../../domain/social/validation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { CHAT_REPOSITORY, type ChatRepository, type RaceChatMessageRow } from '../ports/chat.repository';

/**
 * Yarış sohbeti mesajı gönderme (brief §13, proje sahibinin açık talebi,
 * 27.09.2026).
 *
 * **BU BİR "MESAJ GÖNDER" USE-CASE'İDİR AMA `SendMessageUseCase` DEĞİLDİR.**
 * O use-case `direct_messages` yoludur ve ARKADAŞLIK şartına bağlıdır
 * (`NotFriendsError`); buradaki alıcı bir ODA'dır ve arkadaşlık şartı
 * YOKTUR. Ortak olan tek şey GÖVDE doğrulamasıdır — o da KOPYALANMAZ,
 * `domain/social/validation.ts`'teki `normalizeMessageBody` TEKRAR
 * KULLANILIR (brief §29'un "mevcut yapıya entegre et" ilkesi; ayrıca
 * `char_length` uyumu — kod noktası sayımı — gibi ince bir detayın iki
 * yerde ayrı ayrı doğru yazılması gereksiz bir risktir).
 *
 * **YETKİLENDİRME BURADA YAPILMAZ (bilinçli).** "Bu oyuncu bu yarışı
 * izleyebilir mi" sorusunun TEK cevabı `GetRaceTimelineUseCase`'tir
 * (katılımcı VEYA tribün bileti sahibi) ve `RaceGateway` onu
 * `race.subscribe` anında ZATEN çağırır. Aynı soruyu HER mesajda
 * TEKRARLAMAK, mesaj başına tam bir timeline okuması (tüm segmentler)
 * demek olurdu — yani sohbet, yarış yayınının kendisinden pahalı hâle
 * gelirdi. Kapı bu yüzden ABONELİK anında bir kez kapanır ve gateway
 * abone olmayan bir soketin mesajını bu use-case'e HİÇ ULAŞTIRMAZ.
 */
@Injectable()
export class SendRaceMessageUseCase {
  constructor(
    @Inject(CHAT_REPOSITORY) private readonly chatRepository: ChatRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * Gövdeyi normalize eder/doğrular (boş ya da aşırı uzunsa
   * `InvalidMessageBodyError` fırlatır — HTTP karşılığı 400
   * `INVALID_MESSAGE_BODY`), SONRA yazar.
   *
   * `body` bilinçli olarak `unknown`'dır: WebSocket gövdesi doğrulanmamış
   * JSON'dur (HTTP'deki `ValidationPipe`'ın karşılığı YOKTUR — bkz.
   * CLAUDE.md "Kardeş tuzak"), yani doğrulama domain katmanında
   * YAPILMAK ZORUNDADIR.
   */
  async execute(raceId: string, playerId: string, body: unknown): Promise<RaceChatMessageView> {
    const normalized = normalizeMessageBody(body, this.config.chat.maxMessageLength);
    const row = await this.chatRepository.save({ raceId, playerId, body: normalized });
    return toRaceChatMessageView(row);
  }
}

/**
 * Satır → istemciye giden görünüm. `createdAt` TEK bir yerde ISO 8601
 * metne çevrilir (bkz. `RaceChatMessageView` doc yorumu: WebSocket JSON
 * olduğundan `Date` taşınamaz). `SocialMessageView` ile AYNI desen.
 */
export function toRaceChatMessageView(row: RaceChatMessageRow): RaceChatMessageView {
  return {
    messageId: row.messageId,
    raceId: row.raceId,
    playerId: row.playerId,
    username: row.username,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}
