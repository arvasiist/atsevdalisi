import { Inject, Injectable } from '@nestjs/common';
import type { DirectMessageView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';
import { toDirectMessageView } from './social-message-view';

/**
 * İki oyuncu arasındaki yazışma. `GET /players/:id/messages/:otherPlayerId`.
 *
 * **BU BİR OKUMA UCUDUR AMA YAN ETKİSİ VARDIR (bilinçli):** dönen mesajlar
 * arasında bana gelen OKUNMAMIŞ olanlar okundu işaretlenir. Sohbeti açmak
 * "okudum" demenin doğal yoludur; ayrı bir `POST .../read` uç noktası
 * istemciye "sohbeti açtım ama okundu demeyi unuttum" diye bir hata payı
 * bırakırdı. `Idempotency-Key` İSTENMEZ — işlem doğası gereği idempotenttir
 * (`markConversationRead` yalnızca `read_at IS NULL` satırlara dokunur, yani
 * ikinci çağrı ilk okumanın zaman damgasını EZMEZ).
 *
 * **Arkadaşlık GEREKMEZ (bilinçli):** arkadaşlıktan çıkmış iki oyuncu
 * GEÇMİŞ yazışmasını okuyabilir; yalnızca YENİ mesaj gönderemez
 * (`SendMessageUseCase`). Aksi halde arkadaşlıktan çıkmak, karşı tarafın
 * elindeki mesajları da "kaybettirirdi" — bu, silme hakkı değil sansür
 * olurdu.
 *
 * **Kendinle yazışma:** `[]` döner (404 DEĞİL). `direct_messages_not_self`
 * CHECK'i yüzünden kendine yazışma satırı zaten var olamaz; bu durumda
 * "bulunamadı" demek yanlış olurdu — sorgu geçerlidir, sonucu boştur.
 */
@Injectable()
export class GetConversationUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string, otherPlayerId: string): Promise<DirectMessageView[]> {
    if (playerId === otherPlayerId) {
      return [];
    }

    // Var olmayan bir oyuncuyla "yazışma" da boş dönerdi ama bu, istemcinin
    // yazım hatasını (yanlış id) sessizce yutardı; 404 daha dürüsttür
    // (`GetSocialOverviewUseCase`'in oyuncu kontrolüyle AYNI gerekçe).
    const other = await this.playerRepository.findById(otherPlayerId);
    if (other === null) {
      throw new PlayerNotFoundError(otherPlayerId);
    }

    const rows = await this.socialRepository.findConversation(
      playerId,
      otherPlayerId,
      this.config.social.conversationLimit,
    );

    // Okuma işaretlemesi SORGUDAN SONRA: dönen satırların `readAt` değeri
    // "bu okumadan ÖNCEKİ" durumu yansıtır, ki istemcinin gördüğü şey
    // gerçekten okuduğu şeydir.
    await this.socialRepository.markConversationRead(playerId, otherPlayerId, new Date());

    return rows.map(toDirectMessageView);
  }
}
