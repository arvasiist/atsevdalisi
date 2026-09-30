import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from '@at-sevdalisi/shared-types';
import {
  AdminRequiredError,
  InvalidReportStatusError,
  RaceNotCancelableError,
  ReportNotFoundError,
} from '../../domain/admin/errors';
import {
  HorseInActiveRaceError,
  HorseInjuredError,
  HorseListedInMarketError,
  HorseNotFoundError,
  InvalidHorseNameError,
} from '../../domain/horse/errors';
import {
  BreedingHorseListedError,
  MareNotOwnedError,
  NotEligibleForBreedingError,
} from '../../domain/breeding/errors';
import {
  InvalidDisplayNameError,
  InvalidUsernameError,
  PlayerNotFoundError,
  UsernameAlreadyTakenError,
} from '../../domain/player/errors';
import {
  ForbiddenError,
  InvalidAuthTokenError,
  InvalidProviderTokenError,
  MissingAuthTokenError,
} from '../../domain/auth/errors';
import { HorseNotReadyForTrainingError, InvalidTrainingInputError } from '../../domain/training/errors';
import { HorseEquipmentNotFoundError, InvalidEquipmentInputError } from '../../domain/equipment/errors';
import {
  CareActionOnCooldownError,
  DailyFeedLimitReachedError,
  FeedNotPurchasableError,
  InsufficientFeedStockError,
  InvalidCareInputError,
  InvalidFeedPurchaseCountError,
  InvalidFeedTypeError,
} from '../../domain/care/errors';
import { MaxStableLevelReachedError, StableCapacityExceededError } from '../../domain/stable/errors';
import { InvalidFacilityTypeError, MaxFacilityLevelReachedError } from '../../domain/farm/errors';
import {
  DailyRewardAlreadyClaimedError,
  InsufficientFundsError,
  InvalidDepositAmountError,
  InvalidWalletCursorError,
  MockDepositDisabledError,
} from '../../domain/economy/errors';
import {
  AlreadyJoinedRaceError,
  HorseNotOwnedError,
  HorseNotReadyToRaceError,
  InvalidEntryReadyInputError,
  InvalidRaceDefinitionError,
  InvalidRaceJoinInputError,
  InvalidRaceTacticError,
  InvalidRaceTierError,
  RaceEntryCancelledError,
  RaceEntryNotFoundError,
  RaceEntryNotLeavableError,
  RaceEntryNotReadyableError,
  RaceFullError,
  RaceLimitReachedError,
  RaceNotJoinableError,
  RaceNotFoundError,
  RaceNotSettleableError,
} from '../../domain/race/errors';
import { AlreadyInMatchmakingQueueError, NotInMatchmakingQueueError } from '../../domain/online/errors';
import {
  JockeyAlreadyHiredError,
  JockeyAlreadyOwnedError,
  JockeyNotFoundError,
  JockeyNotOwnedError,
} from '../../domain/jockey/errors';
import {
  RaceNotWatchableError,
  RaceTicketAlreadyOwnedError,
  RaceTicketNotFoundError,
  RaceTicketRequiredError,
  RaceTribuneFreeError,
  TicketAlreadyUsedError,
  TribuneFullError,
} from '../../domain/grandstand/errors';
import {
  CannotGiftSelfError,
  DailyGiftLimitReachedError,
  GiftCurrencyNotAllowedError,
  GiftRequiresFriendshipError,
  InvalidGiftAmountError,
} from '../../domain/gift/errors';
import {
  BlockNotFoundError,
  CannotBlockSelfError,
  CannotFriendSelfError,
  CannotInviteSelfError,
  CannotMessageSelfError,
  CannotReportSelfError,
  FriendshipAlreadyExistsError,
  FriendshipNotFoundError,
  InvalidFriendshipActionError,
  InvalidMessageBodyError,
  InvalidRaceInviteActionError,
  InvalidReportCategoryError,
  InvalidReportReasonError,
  InviteRequiresFriendshipError,
  NotFriendsError,
  NotificationNotFoundError,
  PlayerBlockedError,
  RaceInviteAlreadyExistsError,
  RaceInviteNotFoundError,
  RaceInviteNotRespondableError,
  RaceNotInvitableError,
  SocialLimitReachedError,
} from '../../domain/social/errors';
import {
  CannotBuyOwnListingError,
  HorseAlreadyListedError,
  InvalidListingExpiryError,
  InvalidListingPriceError,
  ListingExpiredError,
  ListingNotActiveError,
  ListingNotFoundError,
  ListingStaleOwnerError,
} from '../../domain/market/errors';
import { IdempotencyKeyInProgressError, IdempotencyKeyRequiredError } from '../idempotency/idempotency.errors';
import { RateLimitExceededError } from '../rate-limit/rate-limit.errors';

/**
 * Bir hata sınıfının constructor'ı (`instanceof` ile karşılaştırılabilir).
 * `Function` (herhangi bir çağrılabilir değer) yerine bilinçli olarak bu
 * dar tip kullanılır — ESLint'in `@typescript-eslint/recommended` seti
 * `Function` tipini tip güvenliği sağlamadığı için HATA olarak yasaklar
 * (bkz. docs/ROADMAP.md "FAZ 1 wiring" — bu, üç CI denemesinin GERÇEK
 * kök nedeniydi, önceki teoriler yanlıştı).
 */
type ErrorClassConstructor = new (...args: never[]) => Error;

/**
 * Domain hata sınıfı → (HTTP durumu, hata kodu) eşlemesi. Her yeni domain
 * modülü wiring'e bağlandığında (Horse, Race, Market, ...) buraya bir satır
 * eklenir — domain katmanının KENDİSİ hiçbir zaman HTTP bilmez (bkz.
 * docs/ARCHITECTURE.md §4), bu eşleme yalnızca API katmanında yaşar.
 */
const DOMAIN_ERROR_MAP = new Map<ErrorClassConstructor, { status: number; code: string }>([
  [UsernameAlreadyTakenError, { status: HttpStatus.CONFLICT, code: ErrorCode.UsernameAlreadyTaken }],
  [PlayerNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.PlayerNotFound }],
  [InvalidUsernameError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  [InvalidDisplayNameError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  [HorseNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.HorseNotFound }],
  [InvalidHorseNameError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  // FAZ 1 wiring, dördüncü dilim — Antrenman (brief §10). "Çok yorgun"/
  // "yetersiz enerji" durumları GEÇİCİDİR (biraz bekleyince tekrar
  // denenebilir), sabit bir kaynak kısıtı DEĞİLDİR — bu yüzden 409
  // Conflict, 400 Bad Request DEĞİL (`UsernameAlreadyTaken` ile AYNI
  // gerekçe).
  [HorseInjuredError, { status: HttpStatus.CONFLICT, code: ErrorCode.HorseInjured }],
  // AUDIT_REPORT.md Bulgu H2 (Medium) — pazarda aktif ilanı olan bir at antrenmana veya yarışa sokulamaz.
  [HorseListedInMarketError, { status: HttpStatus.CONFLICT, code: ErrorCode.HorseListedInMarket }],
  // 30.09.2026 — açık bir lobi yarışına kayıtlı at satılamaz/pazara çıkamaz/ikinci yarışa yazılamaz.
  [HorseInActiveRaceError, { status: HttpStatus.CONFLICT, code: ErrorCode.HorseInActiveRace }],
  // CI Hata 7 (bkz. domain/training/errors.ts InvalidTrainingInputError) —
  // DTO doğrulaması esbuild altında atlanabildiğinde domain katmanının
  // kendi bağımsız kontrolünün fırlattığı hata; gerçek bir DOĞRULAMA
  // hatasıdır, bu yüzden diğerleri gibi 400.
  [InvalidTrainingInputError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  // FAZ 1 wiring, beşinci dilim — Bakım (brief §11). "Cooldown dolmadı"
  // GEÇİCİDİR — `HorseInjuredError`/`HorseNotReadyForTrainingError` ile
  // AYNI gerekçeyle 409 Conflict.
  [CareActionOnCooldownError, { status: HttpStatus.CONFLICT, code: ErrorCode.CareActionOnCooldown }],
  // Hata 7'nin (bkz. domain/care/errors.ts InvalidCareInputError) BAŞTAN
  // uygulanmış hali — gerçek bir DOĞRULAMA hatasıdır, 400.
  [InvalidCareInputError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  // FAZ 1 wiring, altıncı dilim — Ahır Yükseltme (brief §32). "Zaten en
  // yüksek seviyede" mevcut duruma bağlı bir engeldir (yeni bir seviye
  // config'e eklenirse değişebilir) — kalıcı bir doğrulama hatası DEĞİL,
  // `HorseInjuredError` ile AYNI gerekçeyle 409 Conflict.
  [MaxStableLevelReachedError, { status: HttpStatus.CONFLICT, code: ErrorCode.MaxStableLevelReached }],
  // "Yetersiz bakiye" de GEÇİCİDİR (oyuncu daha fazla para kazanınca
  // çözülür) — `HorseNotReadyForTrainingError`'ın INSUFFICIENT_ENERGY
  // dalıyla AYNI gerekçeyle 409 Conflict, 402/400 DEĞİL.
  [InsufficientFundsError, { status: HttpStatus.CONFLICT, code: ErrorCode.InsufficientFunds }],
  // FAZ 1 wiring, yedinci dilim — Günlük Ödül (brief §37).
  // `CareActionOnCooldownError` ile AYNI gerekçeyle 409 Conflict.
  [DailyRewardAlreadyClaimedError, { status: HttpStatus.CONFLICT, code: ErrorCode.DailyRewardAlreadyClaimed }],
  // FAZ 1 wiring, sekizinci dilim — Pratik Yarış (brief §6). Geçersiz bir
  // taktik alanı `InvalidTrainingInputError`/`InvalidCareInputError` ile
  // AYNI gerekçeyle gerçek bir DOĞRULAMA hatasıdır, 400.
  [InvalidRaceTacticError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  // Proje sahibinin açık talebi (27.09.2026) — `tierId` config'deki
  // hiçbir kademeyle eşleşmiyor. `InvalidRaceTacticError` ile AYNI gerekçe
  // (gerçek, KALICI bir doğrulama hatası), ama kendi bespoke koduyla:
  // istemci "geçersiz taktik" ile "geçersiz kademe"yi ayırt edebilmelidir
  // (biri gövdedeki 4 alandan, diğeri kademe seçicisinden gelir).
  [InvalidRaceTierError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidRaceTier }],
  // AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `HorseNotFoundError`/
  // `ListingNotFoundError` ile AYNI kategori (bulunamayan kaynak), 404.
  [RaceNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.RaceNotFound }],
  // brief §42 PHASE 1 — oyuncunun oluşturduğu yarışın tanımı geçersiz.
  // `InvalidRaceTacticError`/`InvalidRaceTierError` ile AYNI gerekçe
  // (gerçek, KALICI bir doğrulama hatası), ama KENDİ koduyla: istemci
  // "geçersiz taktik"/"geçersiz kademe" ile "geçersiz yarış tanımı"nı
  // ayırt edebilmelidir — bu üçü tamamen farklı ekranlardan gelir.
  //
  // Hatanın taşıdığı `problems` dizisi, `InvalidRaceDefinitionError`
  // kurucusunda TEK bir mesaja birleştirilir ve istemciye `message`
  // alanında EKSİKSİZ gider — yani "hangi alanlar hatalı" bilgisi
  // kaybolmaz. Zarfa AYRI bir `details: string[]` alanı EKLEMEK
  // bilinçli olarak tercih EDİLMEDİ: docs/API.md §1.2'nin zarfı tüm
  // uçlarda `{ code, message }`tir ve tek bir uç için onu genişletmek,
  // istemcinin her hata için "acaba details var mı" diye sormasına yol
  // açardı. Bir form alan-alan vurgulama gerektirirse doğru adım bu
  // satırı değiştirmek DEĞİL, zarfı sürümlemektir (ayrı bir iş).
  [InvalidRaceDefinitionError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidRaceDefinition }],
  // brief §42 PHASE 1 — `maxOpenRacesPerPlayer` tavanı aşıldı.
  // `SocialLimitReachedError`/`DailyGiftLimitReachedError` ile AYNI
  // gerekçeyle 409 Conflict, 400 DEĞİL: engelleyen şey isteğin BİÇİMİ
  // değil, oyuncunun MEVCUT açık yarışlarının sayısıdır — yani istek
  // kusursuz biçimde geçerlidir, yalnızca şu an yapılamaz (bir yarışı
  // iptal etmek ya da koşturmak tavanı kendiliğinden boşaltır).
  [RaceLimitReachedError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceLimitReached }],
  // FAZ 1 wiring, dokuzuncu dilim — brief §54 Idempotency-Key. Eksik
  // header GERÇEK bir doğrulama hatası DEĞİLDİR (DTO/gövde şeklini
  // ilgilendirmez) — kendi özel `ErrorCode.IdempotencyKeyRequired`'ı
  // FAZ 0'dan beri taslakta duruyordu, ilk kez burada kullanılıyor.
  [IdempotencyKeyRequiredError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.IdempotencyKeyRequired }],
  // AUDIT_AND_HARDENING Öncelik 3 (bu oturum) — GEÇİCİ/duruma bağlı bir
  // engeldir (kısa süre sonra tekrar denenebilir), `HorseInjuredError`
  // ile AYNI gerekçeyle 409 Conflict, 400 DEĞİL.
  [IdempotencyKeyInProgressError, { status: HttpStatus.CONFLICT, code: ErrorCode.IdempotencyKeyInProgress }],
  // FAZ 1 wiring, on birinci dilim — At Pazarı (brief §30). `errors.ts`'teki
  // dört sınıf FAZ 0'dan beri TASLAKTA duruyordu, burada İLK KEZ gerçekten
  // fırlatılabilir hale geliyor. `InvalidListingPriceError` gerçek bir
  // DOĞRULAMA hatasıdır (Hata 7 ilkesiyle AYNI, 400); `CannotBuyOwnListingError`
  // da yapısal bir istek hatasıdır (kalıcı, tekrar denemekle DÜZELMEZ), 400.
  [InvalidListingPriceError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidListingPrice }],
  // FAZ 1 wiring, on üçüncü dilim — `InvalidListingPriceError` ile AYNI
  // gerekçe/desen (gerçek bir DOĞRULAMA hatası, 400), kendi bespoke
  // `ErrorCode.InvalidListingExpiry`'siyle (sibling hata sınıfıyla AYNI
  // dosyada, AYNI kategori).
  [InvalidListingExpiryError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidListingExpiry }],
  [CannotBuyOwnListingError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.CannotBuyOwnListing }],
  [ListingNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.ListingNotFound }],
  // "Aktif değil"/"süresi dolmuş" GEÇİCİ/duruma-bağlı engellerdir —
  // `MaxStableLevelReachedError`/`HorseInjuredError` ile AYNI gerekçeyle
  // 409 Conflict, 400/404 DEĞİL.
  [ListingNotActiveError, { status: HttpStatus.CONFLICT, code: ErrorCode.ListingNotActive }],
  [ListingExpiredError, { status: HttpStatus.CONFLICT, code: ErrorCode.ListingExpired }],
  [HorseAlreadyListedError, { status: HttpStatus.CONFLICT, code: ErrorCode.HorseAlreadyListed }],
  // AUDIT_REPORT.md Bulgu D2 (bu oturum) — bkz. domain/market/errors.ts `ListingStaleOwnerError`.
  [ListingStaleOwnerError, { status: HttpStatus.CONFLICT, code: ErrorCode.ListingStaleOwner }],
  // AUDIT_REPORT.md Bulgu C1 (bu oturum) — bkz. domain/stable/errors.ts `StableCapacityExceededError`.
  [StableCapacityExceededError, { status: HttpStatus.CONFLICT, code: ErrorCode.StableCapacityExceeded }],
  // FAZ 1 wiring, on dördüncü dilim — PvP Eşleştirme (brief §41).
  // `HorseAlreadyListedError` ile AYNI gerekçeyle (duruma bağlı, geçici —
  // önce kuyruktan çıkılırsa çözülür) 409 Conflict.
  [AlreadyInMatchmakingQueueError, { status: HttpStatus.CONFLICT, code: ErrorCode.AlreadyInMatchmakingQueue }],
  // `ListingNotFoundError` ile AYNI kategori (bulunamayan bir kaynak —
  // burada "bilet"), 404.
  [NotInMatchmakingQueueError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.NotInMatchmakingQueue }],
  // AUDIT_REPORT.md Bulgu S1/S2/S4 hardening (bu oturum) — bkz.
  // `domain/auth/errors.ts` doc yorumu. İKİSİ de 401: token hiç YOK ya da
  // GEÇERSİZ — istemci için pratik fark yoktur (ikisinde de yeniden
  // giriş/kayıt gerekir), bu yüzden AYNI `ErrorCode.Unauthorized`'ı paylaşırlar.
  [MissingAuthTokenError, { status: HttpStatus.UNAUTHORIZED, code: ErrorCode.Unauthorized }],
  [InvalidAuthTokenError, { status: HttpStatus.UNAUTHORIZED, code: ErrorCode.Unauthorized }],
  // Token GEÇERLİ ama sahiplik yok — kavramsal olarak 401'den FARKLI, bkz.
  // `ForbiddenError` doc yorumu.
  [ForbiddenError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.Forbidden }],
  // TRIBÜN (proje sahibinin açık talebi, 27.09.2026) — üç hata da
  // `DOMAIN_ERROR_MAP`'e girebilir çünkü kodları hatanın `reason` alanına
  // BAĞLI DEĞİLDİR (`RaceNotWatchableError`'ın üç nedeni de tek kod
  // `RACE_NOT_WATCHABLE` altında döner — gerekçe `domain/grandstand/errors.ts`).
  [RaceTicketAlreadyOwnedError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceTicketAlreadyOwned }],
  [RaceNotWatchableError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceNotWatchable }],
  // 403 — `ForbiddenError` ile AYNI durum, FARKLI kod: istemci "Bilet Al"
  // akışına yönlendirebilsin diye (bkz. `RaceTicketRequiredError` doc yorumu).
  [RaceTicketRequiredError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.RaceTicketRequired }],
  // PHASE 7.1/7.2 (29.09.2026) — kontenjan + ücretsiz tribün + iade.
  // Üçünün de kodları hatanın alanlarına BAĞLI DEĞİLDİR (`TribuneFullError`
  // taşıdığı `capacity`ye rağmen TEK kod döner — gerekçe
  // `domain/grandstand/errors.ts`), yani `DOMAIN_ERROR_MAP`'e girebilirler.
  [TribuneFullError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceTribuneFull }],
  // 30.09.2026 — izlenmiş bilet iade edilemez (migration 0044).
  [TicketAlreadyUsedError, { status: HttpStatus.CONFLICT, code: ErrorCode.TicketAlreadyUsed }],
  [RaceTribuneFreeError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceTribuneFree }],
  // 404 — iade var olan bir KAYNAĞI hedefler, o kaynak (bilet) yoksa hedef
  // yoktur (`RaceNotFoundError` ile AYNI kategori).
  [RaceTicketNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.RaceTicketNotFound }],
  // ARKADAŞLIK + MESAJLAŞMA (proje sahibinin açık talebi, 27.09.2026) —
  // sekiz hata da `DOMAIN_ERROR_MAP`'e girebilir çünkü kodları hatanın
  // `reason`/`status` alanına BAĞLI DEĞİLDİR (aynı gerekçe: yukarıdaki
  // tribün notu). Durum kodları `domain/social/errors.ts`'teki doc
  // yorumlarında tek tek gerekçelendirilmiştir.
  [CannotFriendSelfError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.CannotFriendSelf }],
  [CannotMessageSelfError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.CannotMessageSelf }],
  [InvalidMessageBodyError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidMessageBody }],
  [InvalidFriendshipActionError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidFriendshipAction }],
  // 404 — "yok" ile "senin değil" ile "bana gelmemiş" TEK kodda birleşir
  // (bilgi sızıntısını önlemek için, bkz. `FriendshipNotFoundError` doc yorumu).
  [FriendshipNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.FriendshipNotFound }],
  // 403 — `ForbiddenError` ile AYNI kategori (yetki yok), FARKLI kod:
  // istemci "arkadaş ekle" akışına yönlendirebilsin diye.
  [NotFriendsError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.NotFriends }],
  // 409 — duruma bağlı, GEÇİCİ engeller (biri kalıcı durum, diğeri sayım).
  [FriendshipAlreadyExistsError, { status: HttpStatus.CONFLICT, code: ErrorCode.FriendshipAlreadyExists }],
  [SocialLimitReachedError, { status: HttpStatus.CONFLICT, code: ErrorCode.SocialLimitReached }],
  // HEDİYE GÖNDERİMİ (proje sahibinin açık talebi, 27.09.2026 — üç parçanın
  // üçüncüsü). Beş hata da `DOMAIN_ERROR_MAP`'e girebilir çünkü kodları
  // hatanın `reason` alanına BAĞLI DEĞİLDİR: `InvalidGiftAmountError` üç
  // farklı `reason` ile fırlatılır ama HEPSİ `INVALID_GIFT_AMOUNT` döner —
  // ayrım yalnızca mesajdadır (bkz. o sınıfın doc yorumu; `RaceNotWatchableError`
  // ile AYNI desen). Durum kodları `domain/gift/errors.ts`'te tek tek
  // gerekçelendirilmiştir.
  //
  // **`InsufficientFundsError` BURAYA EKLENMEZ** — `domain/economy/errors.ts`'te
  // zaten eşlenmiştir ve hediye yolunda da AYNI anlamı taşır (brief §29
  // "duplicate economy implementation oluşturma").
  [CannotGiftSelfError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.CannotGiftSelf }],
  [InvalidGiftAmountError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidGiftAmount }],
  [GiftCurrencyNotAllowedError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.GiftCurrencyNotAllowed }],
  // 403 — `NotFriendsError` ile AYNI kategori (yetki yok) ama FARKLI kod:
  // hediye ekranı "önce arkadaş ekle" akışına yönlendirebilsin diye.
  [GiftRequiresFriendshipError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.GiftRequiresFriendship }],
  // 409 — gövde geçerli, engel o anki SAYIMA bağlı ve pencere kaydıkça
  // kendiliğinden kalkar (`SocialLimitReachedError` ile AYNI kategori).
  [DailyGiftLimitReachedError, { status: HttpStatus.CONFLICT, code: ErrorCode.DailyGiftLimitReached }],
  // BİLDİRİM + YARIŞ DAVETİ (brief §16/§28, §42 PHASE 11) — sekiz hata da
  // `DOMAIN_ERROR_MAP`'e girebilir çünkü kodları hatanın `reason`/`status`
  // alanına BAĞLI DEĞİLDİR (yukarıdaki tribün/sosyal notlarla AYNI gerekçe).
  // Durum kodları `domain/social/errors.ts`'teki doc yorumlarında tek tek
  // gerekçelendirilmiştir.
  [CannotInviteSelfError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.CannotInviteSelf }],
  [InvalidRaceInviteActionError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidRaceInviteAction }],
  // 403 — `NotFriendsError`/`GiftRequiresFriendshipError` ile AYNI kategori
  // (yetki yok) ama FARKLI kod: davet ekranı "önce arkadaş ekle" akışına
  // yönlendirebilsin diye.
  [InviteRequiresFriendshipError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.InviteRequiresFriendship }],
  // 404 — "yok" ile "senin değil" TEK kodda birleşir (bilgi sızıntısını
  // önlemek için, bkz. `RaceInviteNotFoundError` doc yorumu).
  [RaceInviteNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.RaceInviteNotFound }],
  [NotificationNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.NotificationNotFound }],
  // 409 — üçü de gövdesi geçerli ama DURUMA bağlı engeller: yarış artık
  // davet edilebilir değil, davet zaten var ya da zaten yanıtlanmış.
  [RaceNotInvitableError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceNotInvitable }],
  [RaceInviteAlreadyExistsError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceInviteAlreadyExists }],
  [RaceInviteNotRespondableError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceInviteNotRespondable }],
  // BLOCK / REPORT (brief §33, §42 PHASE 15) — altı hata da
  // `DOMAIN_ERROR_MAP`'e girebilir çünkü kodları hatanın
  // `reason`/`value` alanına BAĞLI DEĞİLDİR (`InvalidReportReasonError` iki
  // farklı `reason` ile fırlatılır ama İKİSİ de `INVALID_REPORT_REASON`
  // döner — ayrım yalnızca mesajdadır; yukarıdaki
  // `InvalidGiftAmountError`/`InvalidMessageBodyError` ile AYNI desen).
  // Durum kodları `domain/social/errors.ts`'teki doc yorumlarında tek tek
  // gerekçelendirilmiştir.
  //
  // 400 — ikisi de "kendinle etkileşim" kurma denemesidir; gövde biçimsel
  // olarak geçerli ama istek anlamsızdır (`CannotFriendSelfError` ile AYNI
  // kategori).
  [CannotBlockSelfError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.CannotBlockSelf }],
  [CannotReportSelfError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.CannotReportSelf }],
  [InvalidReportCategoryError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidReportCategory }],
  [InvalidReportReasonError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidReportReason }],
  // 403 — `NotFriendsError`/`GiftRequiresFriendshipError`/
  // `InviteRequiresFriendshipError` ile AYNI kategori (yetki yok) ama
  // FARKLI kod. TEK kod, İKİ YÖN İÇİN: engelleyen de engellenen de aynı
  // cevabı alır — gerekçe `ErrorCode.PlayerBlocked` doc yorumunda.
  [PlayerBlockedError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.PlayerBlocked }],
  // 404 — `FriendshipNotFoundError` ile AYNI ayrım: engel KOYMAK
  // idempotenttir (istenen sonuç zaten geçerliyse hata yok), engel
  // KALDIRMAK ise bir silmedir ve "zaten yok" istemciye bildirilmelidir.
  [BlockNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.BlockNotFound }],
  // YÖNETİM (ADMIN) — brief §34, §42 PHASE 15-B. Üç hata da
  // `DOMAIN_ERROR_MAP`'e girebilir çünkü kodları hatanın `reason` alanına
  // BAĞLI DEĞİLDİR: `InvalidReportStatusError` iki farklı `reason` ile
  // fırlatılır (`UNKNOWN_STATUS` / `FORBIDDEN_TRANSITION`) ama İKİSİ de
  // `INVALID_REPORT_STATUS` döner — ayrım yalnızca mesajdadır
  // (`InvalidGiftAmountError`/`InvalidMessageBodyError` ile AYNI desen).
  // Durum kodları `domain/admin/errors.ts`'te tek tek gerekçelendirilmiştir.
  //
  // 403 — `ForbiddenError`'dan AYRI kod, AYNI durum: eksik olan şey
  // SAHİPLİK değil ROLdür ve istemci "yetkin yok" ile "bu senin değil"
  // arasını ayırt edebilmelidir (bkz. `ErrorCode.AdminRequired` doc yorumu).
  [AdminRequiredError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.AdminRequired }],
  // 404 — şikâyet yok. Bu kontrol yetki kapısından SONRA yapılır, böylece
  // yönetici olmayan biri kuyruktaki kimlikleri yoklayamaz (IDOR).
  [ReportNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.ReportNotFound }],
  [InvalidReportStatusError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidReportStatus }],
  // 409 — yarış bu durumdan iptal edilemez (28.09.2026). `RaceNotSettleable`/
  // `RaceEntryNotLeavable` ile AYNI kategori: istek kusurlu değil, kaynağın
  // DURUMU uygun değil. Dört `reason` da tek koda düşer (yukarıdaki
  // `InvalidReportStatusError` notuyla AYNI desen).
  [RaceNotCancelableError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceNotCancelable }],
  // JOKEY (brief §13, §42 PHASE 6.2 — 29.09.2026). Üç hata da
  // `DOMAIN_ERROR_MAP`'e girebilir çünkü kodları hatanın hiçbir alanına
  // BAĞLI DEĞİLDİR. Durum kodları `domain/jockey/errors.ts`'te tek tek
  // gerekçelendirilmiştir.
  //
  // 404 — jokey yok. Bu kod YALNIZCA kiralama ucunun `:jockeyId`si için
  // vardır; "oyuncunun jokeyi yok" durumu 404 DEĞİL, `null` yanıttır
  // (`GetPlayerJockeyUseCase` doc yorumu).
  [JockeyNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.JockeyNotFound }],
  // 409 — ikisi de gövdesi kusursuz ama DURUMA bağlı engeller ve
  // AYRI kodlar: "jokey başkasında" ≠ "senin zaten jokeyin var". İstemcinin
  // önereceği eylem farklıdır ("başka jokey seç" / "önce mevcut jokeyini
  // bırak") — aynı ayrım `RaceFullError` ile `AlreadyJoinedRaceError`
  // arasında da vardır.
  [JockeyAlreadyOwnedError, { status: HttpStatus.CONFLICT, code: ErrorCode.JockeyAlreadyOwned }],
  [JockeyAlreadyHiredError, { status: HttpStatus.CONFLICT, code: ErrorCode.JockeyAlreadyHired }],
  // 409 — serbest bırakma reddi. İKİ alt durum (sahipsiz / başkasında) TEK
  // kodla döner; ayrılsaydı kimlik deneyen biri "bu jokey birinin mi"
  // sorusunu yanıtlardı. `JockeyNotFoundError` (404) DEĞİLDİR: satır
  // vardır ve kimliği herkese açık vitrinde görünür.
  [JockeyNotOwnedError, { status: HttpStatus.CONFLICT, code: ErrorCode.JockeyNotOwned }],
  // `POST /auth/login`'e özgü — bkz. `InvalidProviderTokenError` doc yorumu.
  [InvalidProviderTokenError, { status: HttpStatus.UNAUTHORIZED, code: ErrorCode.InvalidProviderToken }],
  // claude/hizli-bitirme-plani.md'nin proje sahibi tarafından
  // önceliklendirdiği Ekipman dilimi (bu turda EKLENDİ) — `InvalidTraining
  // InputError` ile AYNI gerekçe (Hata 7 savunması, gerçek bir DOĞRULAMA
  // hatası), 400.
  [InvalidEquipmentInputError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  // `HorseNotFoundError`/`ListingNotFoundError` ile AYNI kategori (bulunamayan bir kaynak), 404.
  [HorseEquipmentNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.HorseEquipmentNotFound }],
  // brief §32 "Çiftlik" (bu turda EKLENDİ) — bkz. `domain/farm/errors.ts`.
  // `MaxStableLevelReachedError` ile AYNI gerekçe: "zaten en yüksek
  // seviyede" mevcut duruma bağlı, GEÇİCİ bir engeldir (config'e yeni bir
  // seviye eklenirse ortadan kalkar) — kalıcı bir doğrulama hatası DEĞİL,
  // 409 Conflict. `ErrorCode.MaxFacilityLevelReached` FAZ 0'dan beri
  // taslakta duruyordu, ilk kez burada gerçekten kullanılıyor.
  [MaxFacilityLevelReachedError, { status: HttpStatus.CONFLICT, code: ErrorCode.MaxFacilityLevelReached }],
  // `InvalidTrainingInputError`/`InvalidCareInputError`/`InvalidEquipmentInputError`
  // ile AYNI kategori — gerçek bir DOĞRULAMA hatası (Hata 7 ilkesi), 400.
  [InvalidFacilityTypeError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  // brief §12 Beslenme / yem dükkânı (bu turda EKLENDİ) — bkz.
  // `domain/care/errors.ts`. Geçersiz kalem adı `InvalidFacilityTypeError`
  // ile AYNI kategori: yol parametresinin kendisi geçersiz → 400.
  [InvalidFeedTypeError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidFeedType }],
  // "Stok bitti" ve "günlük sınır doldu" GEÇİCİDİR (satın alarak / pencere
  // kayarak çözülür) — `InsufficientFundsError`/`CareActionOnCooldownError`
  // ile AYNI gerekçeyle 409 Conflict, 400 DEĞİL.
  [InsufficientFeedStockError, { status: HttpStatus.CONFLICT, code: ErrorCode.InsufficientFeedStock }],
  [DailyFeedLimitReachedError, { status: HttpStatus.CONFLICT, code: ErrorCode.DailyFeedLimitReached }],
  // Bunlar ise KALICI istemci hatalarıdır (var olmayan bir işlem / bozuk
  // gövde alanı) — 400.
  [FeedNotPurchasableError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.FeedNotPurchasable }],
  [InvalidFeedPurchaseCountError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidFeedPurchaseCount }],
  // ÇİFTLEŞTİRME (proje sahibinin talebi, 27.09.2026 — soy ağacı veri
  // zincirinin ÜÇÜNCÜ parçası). `NotEligibleForBreeding` kodu
  // `packages/shared-types`'ta FAZ 3'ten beri taslakta duruyordu, ilk kez
  // burada gerçekten kullanılıyor.
  //
  // `NotEligibleForBreedingError`'ın ALTI nedeni de TEK kod döner
  // (`RaceNotWatchableError`/`InvalidGiftAmountError` ile AYNI desen; ayrım
  // yalnızca mesajdadır) ve altısı da GEÇİCİ/duruma bağlı engellerdir:
  // `SAME_HORSE` ve `INVALID_GENDER` dışındakiler yaş/cooldown/durum ile
  // kendiliğinden ya da atın durumu değişince kalkar. Bu yüzden 409
  // Conflict, 400 DEĞİL (`HorseInjuredError`/`CareActionOnCooldownError`
  // ile AYNI gerekçe).
  [NotEligibleForBreedingError, { status: HttpStatus.CONFLICT, code: ErrorCode.NotEligibleForBreeding }],
  // 403 — `ForbiddenError` ile AYNI kategori (kimlik doğrulandı, yetki
  // yok): istek GEÇERLİ, at VAR, ama kısrak çağıranın değil. `MareNotOwnedError`
  // doc yorumu bu durumun neden YALNIZCA kısrak için geçerli olduğunu
  // (aygır başkasının olabilir) açıklar.
  [MareNotOwnedError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.Forbidden }],
  // 409 — `HorseListedInMarketError` ile AYNI kod ve AYNI gerekçe (aynı
  // kuralın ikinci fırlatıcısı; bkz. `domain/breeding/errors.ts`): satışta
  // olan bir atın soy kaydını değiştirmek alıcıya sürpriz bir tay/soy
  // devreder.
  [BreedingHorseListedError, { status: HttpStatus.CONFLICT, code: ErrorCode.HorseListedInMarket }],
  // YARIŞA KATILMA (brief §2/§3/§6, §42 PHASE 1b) — beşi de
  // `POST /races/:id/join` yolundan gelir. Sınıflandırma, projedeki AYNI
  // kategorilerin tekrarıdır (hepsi `domain/race/errors.ts`'te uzun uzun
  // gerekçelendirilmiştir):
  //
  // 400 — `InvalidRaceDefinitionError` ile AYNI kategori: istek KALICI
  // olarak bozuk (aynı isteği tekrarlamak düzeltmez).
  [InvalidRaceJoinInputError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidRaceJoinInput }],
  // 403 — `ForbiddenError`/`MareNotOwnedError` ile AYNI kategori: istek
  // kusursuz, at VAR, ama oyuncunun değil. At kimliği bu uçta URL'de
  // DEĞİL gövdede olduğu için `HorseOwnerGuardByParam` devrede DEĞİLDİR;
  // kontrol transaction içinde açıkça yapılır ve sonucu BURAYA döner.
  [HorseNotOwnedError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.Forbidden }],
  // 409 — üçü de `RaceLimitReachedError` ile AYNI gerekçe: istek biçimsel
  // olarak kusursuz, engelleyen şey yarışın/oyuncunun DURUMUdur (geçici).
  [RaceNotJoinableError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceNotJoinable }],
  [RaceFullError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceFull }],
  [AlreadyJoinedRaceError, { status: HttpStatus.CONFLICT, code: ErrorCode.AlreadyJoinedRace }],
  // PHASE 3 (READY düğmesi) — üçü de yukarıdaki kategorilerin TEKRARIDIR,
  // yeni bir sınıflandırma getirmez:
  //
  // 400 — `InvalidRaceJoinInputError` ile AYNI kategori (istek kalıcı
  // olarak bozuk; `status` alanı `ready`/`not_ready` değil).
  [InvalidEntryReadyInputError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidEntryReadyInput }],
  // 404 — `RaceNotFoundError`/`ListingNotFoundError` ile AYNI kategori:
  // üzerinde işlem yapılacak KAYNAK yok (burada: oyuncunun katılım satırı).
  // 403 DEĞİL — gerekçe `RaceEntryNotFoundError` doc yorumunda.
  [RaceEntryNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.RaceEntryNotFound }],
  // 409 — `RaceNotJoinableError` ile AYNI gerekçe: engelleyen şey DURUM.
  [RaceEntryNotReadyableError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceEntryNotReadyable }],
  // PHASE 4c (yarıştan AYRILMA + iade, brief §20 REFUND) — ikisi de
  // yukarıdaki 409 kategorisinin TEKRARIDIR, yeni bir sınıflandırma
  // getirmez:
  //
  // `RaceEntryNotLeavableError` — engelleyen şey yarışın/katılımın
  // DURUMUdur (başladı, iptal edilmiş ya da `scheduled` değil). İstek
  // biçimsel olarak kusursuz ve kaynak vardır → 400/404 DEĞİL.
  [RaceEntryNotLeavableError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceEntryNotLeavable }],
  // `RaceEntryCancelledError` — katılım DAHA ÖNCE iptal edilmiş, yani
  // yeniden katılma engeli KALICI bir durumdur (`AlreadyJoinedRaceError`
  // ile AYNI 409 ailesi, farklı ve daha doğru mesaj).
  [RaceEntryCancelledError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceEntryCancelled }],
  // `RaceNotSettleableError` (§42 PHASE 13.14) — engelleyen şey yine
  // yarışın DURUMUdur (henüz başlamamış, zaten koşulmuş, hiç katılımcısı
  // yok). İstek biçimsel olarak kusursuz ve kaynak vardır → 400/404
  // DEĞİL. Bu kod AYNI ZAMANDA settlement'ın idempotency cevabıdır
  // (ikinci çağrı `NOT_SCHEDULED` alır) — bkz. `ErrorCode.RaceNotSettleable`
  // doc yorumu.
  [RaceNotSettleableError, { status: HttpStatus.CONFLICT, code: ErrorCode.RaceNotSettleable }],
  // SANAL PARA YATIRMA (brief §20 DEPOSIT, §21/§41, §42 PHASE 4b) — iki
  // hata da yeni bir sınıflandırma getirmez, mevcut kategorilerin
  // tekrarıdır (gerekçeler `packages/shared-types/src/error-codes.ts`'te
  // ve `domain/economy/errors.ts`'te tek tek yazılmıştır):
  //
  // 403 — `RaceTicketRequiredError` ile AYNI kategori: istek kusursuz,
  // kaynak var, engelleyen şey SUNUCU TARAFINDAKİ bir yapılandırma
  // kararıdır (uç nokta bu ortamda kapalı). 409 DEĞİL çünkü geçici
  // değildir; 404 DEĞİL çünkü cüzdan gerçekten vardır.
  [MockDepositDisabledError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.MockDepositDisabled }],
  // 400 — `InvalidGiftAmountError` ile AYNI kategori (gerçek, KALICI bir
  // doğrulama hatası; aynı isteği tekrarlamak düzeltmez) ve AYNI desen
  // (üç neden → tek kod; ayrım yalnızca mesajdadır).
  [InvalidDepositAmountError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidDepositAmount }],
  // 30.09.2026 — bozuk sayfa imleci (varsayılana DÜŞÜLMEZ, bkz. sınıf doc yorumu).
  [InvalidWalletCursorError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
]);

/**
 * Tüm hataları docs/API.md §1.2'deki tutarlı zarfa dönüştürür:
 *    { "success": false, "error": { "code": "...", "message": "..." } }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HorseNotReadyForTrainingError) {
      const code = exception.reason === 'INSUFFICIENT_ENERGY' ? ErrorCode.InsufficientEnergy : ErrorCode.HorseTooTired;
      response.status(HttpStatus.CONFLICT).json({ success: false, error: { code, message: exception.message } });
      return;
    }

    // Proje sahibinin açık talebi (27.09.2026) — "hazır olan kişiler
    // yarışabilsinler". `HorseNotReadyForTrainingError` ile YAPISAL OLARAK
    // AYNI desen (dört neden → dört kod, hepsi 409) — ama `DOMAIN_ERROR_MAP`'e
    // EKLENEMEZ, çünkü oradaki eşleme sınıf→(durum, kod) tekilidir ve
    // BURADA kod, hatanın `reason` alanına BAĞLIDIR. İki neden
    // (`HORSE_TOO_TIRED`/`INSUFFICIENT_ENERGY`) antrenmanla AYNI kodları
    // PAYLAŞIR (istemci için kavram aynıdır); diğer ikisi yeni koddur.
    if (exception instanceof HorseNotReadyToRaceError) {
      const codeByReason = {
        HORSE_NOT_ACTIVE: ErrorCode.HorseNotActive,
        INSUFFICIENT_HEALTH: ErrorCode.InsufficientHealth,
        HORSE_TOO_TIRED: ErrorCode.HorseTooTired,
        INSUFFICIENT_ENERGY: ErrorCode.InsufficientEnergy,
      } as const;
      response.status(HttpStatus.CONFLICT).json({
        success: false,
        error: { code: codeByReason[exception.reason], message: exception.message },
      });
      return;
    }

    // AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum) — diğerleri
    // gibi `DOMAIN_ERROR_MAP`'e EKLENMEDİ çünkü yalnızca bu hata özel bir
    // `Retry-After` header'ı gerektiriyor (bkz. `RateLimitGuard` doc yorumu).
    if (exception instanceof RateLimitExceededError) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      response.status(HttpStatus.TOO_MANY_REQUESTS).json({
        success: false,
        error: { code: ErrorCode.RateLimitExceeded, message: exception.message },
      });
      return;
    }

    for (const [ErrorClass, mapping] of DOMAIN_ERROR_MAP) {
      if (exception instanceof ErrorClass) {
        response.status(mapping.status).json({
          success: false,
          error: { code: mapping.code, message: (exception as Error).message },
        });
        return;
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as { message?: string | string[] }).message ?? exception.message);

      response.status(status).json({
        success: false,
        error: {
          code: status === HttpStatus.BAD_REQUEST ? ErrorCode.ValidationError : ErrorCode.NotFound,
          message: Array.isArray(message) ? message.join(', ') : message,
        },
      });
      return;
    }

    // eslint-disable-next-line no-console
    console.error('Beklenmeyen hata:', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Beklenmeyen bir hata oluştu.',
      },
    });
  }
}