/**
 * Yarış daveti domaini (brief §16 RACE INVITE, §42 PHASE 11).
 *
 * Framework'süz saf TS. `domain/race/lobby.ts`teki `checkRaceJoinable`ın
 * davete uyarlanmış hâlidir ama BİLİNÇLİ olarak ondan AYRI durur ve onu
 * IMPORT ETMEZ: `domain/race/` ile `domain/social/` kardeş domainlerdir ve
 * aralarında bağımlılık kurmak, ileride birinin diğerini çekmesine yol
 * açardı. Aynı kuralın iki kopyası olması burada kabul edilebilir çünkü
 * iki kural ZATEN aynı değildir: katılım `maxPlayers`ı da denetler, davet
 * denetlemez (davet edilen kişi katılmak zorunda değildir, üstelik yarış
 * davet anında dolu olsa bile biri ayrılırsa yer açılabilir).
 */

import { CannotInviteSelfError } from './errors';

/** Davet yanıtı olarak kabul edilen iki değer. */
export const RACE_INVITE_ACTIONS = ['accept', 'decline'] as const;

export type RaceInviteAction = (typeof RACE_INVITE_ACTIONS)[number];

/**
 * Davet gönderilememe nedenleri. `null` = gönderilebilir.
 *
 * `checkRaceJoinable` ile AYNI "fırlatma, DÖNDÜR" disiplini: bu fonksiyon
 * istek yolunda çağrılır ve kararın kendisi ile kararın HTTP'ye çevrilmesi
 * AYRI sorumluluklardır — domain saf kalır, `null`/sebep döner; hatayı
 * `application/` katmanı fırlatır.
 */
export type RaceInviteRejection = 'NOT_SCHEDULED' | 'ALREADY_STARTED';

/**
 * Bu yarışa şu an davet gönderilebilir mi?
 *
 * `status === 'scheduled'` VE başlangıç zamanı gelecekte olmalıdır —
 * brief §2'nin katılım için koyduğu pencereyle AYNIdır: davet, katılımın
 * mümkün olduğu pencerede anlamlıdır. Başlamış bir yarışa davet göndermek,
 * karşı tarafa tıklanamayan bir [JOIN] düğmesi göstermek olurdu.
 *
 * `now` DIŞARIDAN verilir (test edilebilirlik — `checkRaceJoinable` ile
 * aynı imza).
 */
export function checkInviteable(
  race: { status: string; startTime: Date },
  now: Date,
): RaceInviteRejection | null {
  if (race.status !== 'scheduled') return 'NOT_SCHEDULED';
  if (race.startTime.getTime() <= now.getTime()) return 'ALREADY_STARTED';
  return null;
}

/**
 * Gövdeden gelen serbest değeri `RaceInviteAction`a çevirir; geçersizse
 * `null` döner.
 *
 * `parseFriendshipAction` (`domain/social/validation.ts`) ile AYNI desen ve
 * AYNI gerekçe: `@IsIn` dekoratörü esbuild altında ATLANIR (CLAUDE.md
 * kural 5), yani gövde çalışma anında gerçekten bozuk olabilir.
 */
export function parseRaceInviteAction(value: unknown): RaceInviteAction | null {
  return (RACE_INVITE_ACTIONS as readonly unknown[]).includes(value)
    ? (value as RaceInviteAction)
    : null;
}

/**
 * Kendini yarışa davet etmeyi engeller. `race_invites_not_self_ck` CHECK'inin
 * (migration 0039) uygulama tarafındaki karşılığıdır — veritabanı son
 * savunma hattıdır, ama oraya varmadan anlamlı bir 400 dönmek gerekir.
 *
 * `assertNotSelf` (arkadaşlık) YENİDEN KULLANILMAZ çünkü o
 * `CannotFriendSelfError` fırlatır ve istemciye "arkadaşlık isteği
 * gönderemezsin" dedirtirdi — oysa engellenen işlem DAVETTİR.
 */
export function assertInviteNotSelf(inviterId: string, inviteeId: string): void {
  if (inviterId === inviteeId) {
    throw new CannotInviteSelfError();
  }
}

/**
 * `domain/race/lobby.ts` → `UUID_PATTERN` ile AYNI desen (bilinçli kopya —
 * `domain/social/` `domain/race/`i import ETMEZ, bkz. dosya başı notu).
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gövdeden gelen kimliklerin UUID ŞEKLİNİ doğrular.
 *
 * **NEDEN ŞART (gerçek bir 500 hatasını önler):** `inviteeId`/`raceId` gövde
 * alanlarıdır ve `@IsUUID()` dekoratörü esbuild altında ATLANIR (CLAUDE.md
 * kural 5 — "Kardeş tuzak"). Korumasız bir `"abc"` değeri doğrudan
 * `WHERE id = $1`e gider, PostgreSQL `invalid input syntax for type uuid`
 * (22P02) fırlatır ve istemci 400 yerine **500** alır. `ParseUUIDPipe`
 * yalnızca YOL parametrelerini korur (`:id`, `:inviteId`), gövdeyi DEĞİL.
 *
 * **Neden use-case'te (controller'da değil):** davet uç noktası İKİ gövde
 * alanı taşır ve `raceId` için `HorseOwnerGuard` benzeri hazır bir kapı YOK.
 * Aynı koruma `social.controller.ts`/`market.controller.ts`te CONTROLLER
 * katmanında `isUUID()` ile yapılır (beş örnek); orada 400 dönebilirler
 * çünkü `BadRequestException`'ı doğrudan fırlatabilirler. Domain katmanı
 * Nest'i import ETMEZ, bu yüzden burada dönen kod 404'tür (bkz. `isUuid`
 * çağıranı `send-race-invite.use-case.ts`).
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
