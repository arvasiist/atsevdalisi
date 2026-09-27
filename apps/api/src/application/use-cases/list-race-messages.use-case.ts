import { Inject, Injectable } from '@nestjs/common';
import type { RaceChatHistoryPayload } from '@at-sevdalisi/shared-types';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { CHAT_REPOSITORY, type ChatRepository } from '../ports/chat.repository';
import { toRaceChatMessageView } from './send-race-message.use-case';

/**
 * Yarış sohbeti GEÇMİŞİ (brief §13) — `race.subscribe` sonrası YALNIZCA
 * abone olan istemciye bir kez gönderilir.
 *
 * **NEDEN AYRI BİR USE-CASE:** gönderme yolu (`SendRaceMessageUseCase`)
 * bir YAZMA, bu ise salt bir OKUMADIR — farklı yetki/gerekçe kümeleri
 * vardır (yazma tarafı gövde doğrulaması ve hız sınırı taşır, okuma tarafı
 * yalnızca bir `LIMIT` uygular). İkisini tek sınıfta birleştirmek,
 * `ChatRepository`'nin zaten iki ayrı metodu olduğu gerçeğini gizlerdi.
 *
 * Limit `config/chat.config.json → historyLimit`'ten gelir — hard-code
 * EDİLMEZ (CLAUDE.md "SİHİRLİ SAYI YOK"). Sınırsız bırakmak, uzun bir
 * yarışta yeni abone olan her istemciye tüm geçmişi göndermek demek
 * olurdu (brief §38 "performans: 100+/500+ izleyici" ile doğrudan
 * çelişir).
 */
@Injectable()
export class ListRaceMessagesUseCase {
  constructor(
    @Inject(CHAT_REPOSITORY) private readonly chatRepository: ChatRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(raceId: string): Promise<RaceChatHistoryPayload> {
    const rows = await this.chatRepository.findRecent(raceId, this.config.chat.historyLimit);
    return { raceId, messages: rows.map(toRaceChatMessageView) };
  }
}
