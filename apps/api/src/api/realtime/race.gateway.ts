import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type {
  NotificationView,
  PvpMatchResult,
  RaceChatHistoryPayload,
  RaceChatMessageView,
  RaceFinishedPayload,
  RaceInviteView,
  RaceRosterEntrant,
  RaceRosterPayload,
  RaceSegmentSnapshot,
  RaceSpectatorCountPayload,
  RaceTimelineView, RaceEmoteEvent } from '@at-sevdalisi/shared-types';
import { GetRaceTimelineUseCase } from '../../application/use-cases/get-race-timeline.use-case';
import { ListRaceMessagesUseCase } from '../../application/use-cases/list-race-messages.use-case';
import { SendRaceMessageUseCase } from '../../application/use-cases/send-race-message.use-case';
import { TOKEN_SERVICE, type TokenService } from '../../application/ports/token.service';
import { AuthSessionUseCase } from '../../application/use-cases/auth-session.use-case';
import type { LobbyNotifier } from '../../application/ports/lobby-notifier';
import type { NotificationNotifier } from '../../application/ports/notification-notifier';
import { AppConfigService } from '../../infrastructure/config/config.service';

/** `race_entries.id` gibi bir UUID metni — gövdede gelen `raceId`'nin kabaca şekil kontrolü (bkz. bu dosyanın doc yorumu). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * AUDIT_REPORT.md Bulgu F2 (Low, bu oturum) — "WebSocket hiç yok (PLANNED)"
 * hardening, proje sahibinin AskUserQuestion ile onayladığı "F2 — canlı
 * yarış WebSocket altyapısı" seçimi. docs/API.md §10'un ÖNERDİĞİ
 * `race.telemetry`/`race.finished` olaylarının İLK gerçek uygulaması —
 * BİLİNÇLİ olarak "temel bağlantı+yayın iskeleti" (proje sahibine
 * söylediğim kapsam) kapsamında tutuldu.
 *
 * **Tasarım kararı — GERÇEK zamanlı simülasyon DEĞİL, "tempolu replay":**
 * `simulateRace` TAMAMEN senkron/deterministik çalışır (bkz. `race-engine.ts`
 * doc yorumu) — bir yarış server'da HER ZAMAN anında (tek bir fonksiyon
 * çağrısında) tamamlanır, "devam eden" bir yarış durumu SUNUCUDA HİÇ
 * YOKTUR. Bu yüzden bu gateway YENİ bir simülasyon/oyun-durumu makinesi
 * İCAT ETMEZ — bunun yerine, `RunPracticeRaceUseCase`/`JoinMatchmakingQueueUseCase`
 * tarafından ZATEN hesaplanıp `race_entries`/`race_entry_segments`'e
 * yazılmış (bkz. R2, AUDIT_REPORT.md) bir yarışın tam alanını
 * `GetRaceTimelineUseCase` (AYNI yetkilendirme mantığıyla — bkz. o
 * use-case'in doc yorumu) ile okur, SONRA segmentleri kendi
 * `timestampMs`'lerine göre ORANTILI bir tempoda (bkz. `PLAYBACK_DURATION_MS`)
 * istemciye yayınlar. İzleyici için "canlı yarış izliyorum" hissi verir,
 * motora/dengeye (T3b'nin öğrettiği risk sınıfı) HİÇBİR yeni risk
 * eklemez — ne yeni bir oyun kuralı ne de mevcut `RunPracticeRaceUseCase`/
 * `JoinMatchmakingQueueUseCase` akışında bir DEĞİŞİKLİK var.
 *
 * **Senkronize çoklu-izleyici (bu oturumun ikinci dilimi — AUDIT_REPORT.md
 * Bulgu F2'nin ilk turda BİLİNÇLİ kapsam dışı bıraktığı madde 1):** İlk
 * turda her izleyici KENDİ `race.subscribe` anına göre bağımsız bir
 * `setTimeout` zinciri alıyordu — AYNI yarışı izleyen iki istemci
 * birbiriyle SENKRONİZE DEĞİLDİ (biri t=0'dan, diğeri kendi abone olma
 * anından t=0'dan başlıyordu). Şimdi her `raceId` için TEK bir paylaşılan
 * `RacePlaybackSession` var: zamanlayıcılar `client.emit` yerine
 * `this.server.to(room).emit(...)` ile bir Socket.IO ODASINA (`race:
 * ${raceId}`) yayınlanır, yani AYNI yarışı izleyen TÜM istemciler AYNI
 * anda AYNI olayları alır. Geç katılan bir istemci (`race.subscribe`
 * oturum ZATEN başladıktan SONRA çağrıldığında) önce bir "yakalama"
 * (`catch-up`) yayınıyla ŞİMDİYE KADAR fiilen ateşlenmiş TÜM segmentleri
 * TEK bir `race.telemetry` olayında alır (bkz. `firedScaledDelays` — bu,
 * "geçen süre kadar zaman varsay" gibi saat-tabanlı bir tahmin DEĞİL,
 * hangi zamanlayıcıların GERÇEKTEN ateşlendiğinin doğrudan takibidir, bu
 * yüzden Node'un `setTimeout` gecikmesi/jitter'ından ETKİLENMEZ), SONRA
 * odaya katılıp GELECEKTEKİ yayınları normal şekilde almaya devam eder.
 * Yarış zaten bitmişse (`session.finished`) geç katılan istemci ANINDA
 * `race.finished`'i alır — bir sonraki `PLAYBACK_DURATION_MS` turunu
 * beklemez. Bir oturum, `race.finished` yayınından `SESSION_RETENTION_
 * AFTER_FINISH_MS` (60 saniye) sonra bellekten SİLİNİR (sınırsız büyüme
 * YOK) — bu pencere kapandıktan sonra gelen bir `race.subscribe` basitçe
 * YENİ bir oturum başlatır (replay idempotent olduğundan zararsız, AYNI
 * ilke `docs/ROADMAP.md`'nin yeniden bağlanma notuyla tutarlı).
 *
 * **BİLDİRİM YAYINI (brief §28, §42 PHASE 11 — bu dilimde EKLENDİ):**
 * Yukarıdaki "kapsam dışı" notu ARTIK GEÇERSİZ. `NotificationNotifier`
 * portu bu gateway tarafından uygulanır ve `player:${playerId}` odasına ÜÇ
 * olay yayınlar: `notification.created` (bildirim listesi tüketicisi),
 * `race.invite` (davet EDİLENE — iki düğmeli kart) ve `race.invite.responded`
 * (davet EDENE — sonucu bildirir). Ayrıntı: `notifyNotification` doc yorumu.
 * Bu, `lobby.update`nin kullandığı ALTYAPININ AYNISIDIR (aynı oda, aynı
 * best-effort sözleşmesi, aynı `RealtimeModule` bağlaması) — yeni bir oda
 * ya da kimlik mekanizması İCAT EDİLMEDİ.
 *
 * **Kapsam DIŞI (bilinçli, gelecek dilimler için docs/ROADMAP.md'ye not
 * düşülecek):** brief §28'in sekiz bildirim türünden YALNIZCA `race_invite`
 * ÜRETİLİR (bkz. `domain/social/notification.ts`); kalan yedi türün
 * üreticisi PHASE 13'ün işidir. `lobby.update` de ARTIK UYGULANDI (bkz.
 * aşağıdaki "`lobby.update`" doc bölümü) — F2'nin ilk turda bıraktığı son
 * kapsam dışı madde buydu.
 *
 * **Yeniden bağlanma (madde 2 — bu turda TAMAMLANDI):** Önceden burada
 * "yeniden bağlanma/kaldığı yerden devam etme YOK" yazıyordu — bu artık
 * DOĞRU DEĞİL. Backend TARAFI zaten hazırdı (bu paylaşılan oturum
 * sayesinde, bağlantı koparsa istemci `race.subscribe`'ı BAŞTAN çağırdığında
 * "yakalama" mekanizmasından FAYDALANIR, tamamen sıfırdan başlamaz) —
 * eksik olan `apps/web`'in `live-race-socket.ts`/`LiveRaceViewer.tsx`
 * tarafıydı: `socket.io-client`'ın kendi otomatik yeniden bağlanması
 * `race.subscribe`'ı zaten otomatik tekrar gönderiyordu, ama (a) kullanıcı
 * bunu hiç GÖRMÜYORDU (bağlantı koptuğunda ekran donuk kalıyordu, hiçbir
 * geri bildirim yoktu) ve (b) her yeniden bağlanmanın getirdiği "yakalama"
 * segmentleri istemci tarafında KOŞULSUZ olarak birikiyordu (yanlış sonuç
 * üretmiyordu ama sınırsız bellek büyümesiydi). İkisi de `apps/web`
 * tarafında (`onDisconnected` handler'ı + `segment-merge.ts`'in
 * `mergeSegments`'i) düzeltildi — bkz. o dosyaların doc yorumları.
 *
 * **Kimlik doğrulama:** `AuthGuard`'ın HTTP için yaptığının WebSocket
 * el sıkışması (`handshake.auth.token`) karşılığı — AYNI `TOKEN_SERVICE`
 * ile doğrulanır (yeni bir doğrulama mantığı İCAT EDİLMEDİ). Token
 * yoksa/geçersizse bağlantı ANINDA reddedilir (`client.disconnect(true)`)
 * — HTTP'nin 401'iyle AYNI "önce kimlik, sonra her şey" ilkesi.
 * Yetkilendirme (bu oyuncu GERÇEKTEN bu yarışın bir katılımcısı mı) ise
 * `race.subscribe` anında `GetRaceTimelineUseCase` ÜZERİNDEN yapılır —
 * `RaceNotFoundError`/`ForbiddenError` HTTP'deki AYNI 404/403 anlamına
 * gelen `race.error` olayına çevrilir (bkz. o use-case'in "bilgi
 * sızdırmama" doc yorumu — burada da AYNI davranış korunur).
 *
 * **`race.roster` (bu turda EKLENDİ — frontend'in F2'ye GERÇEK bir
 * tüketici bağlanabilmesi için eksik olan parça):** `race.telemetry`
 * segmentleri `raceEntryId`'ye göre gruplanır (`race_entries.id` — GERÇEK
 * bir `horseId` DEĞİLDİR, bot satırlarında `horseId` zaten `null`dur),
 * ama daha önce hiçbir olay istemciye `entryId → horseId/horseName/
 * botLabel` eşlemesini GÖNDERMİYORDU — yani bir istemci segmentleri
 * alabiliyordu ama "bu hangi at" ya da "bu benim atım mı" sorusunu
 * CEVAPLAYAMIYORDU (`race.finished` bunu YARIŞ BİTİNCE `horseId` ile
 * verir, ama yarış SÜRERKEN isim/HUD gösterilemezdi). Şimdi
 * `joinSharedPlayback`, catch-up `race.telemetry`'den ÖNCE, TEK bir
 * `race.roster` olayıyla (yalnızca bu istemciye — `RaceTimelineEntrantView`'in
 * segment/final-sonuç alanları çıkarılmış bir alt kümesi) TÜM roster'ı
 * gönderir — geç katılan bir istemci de dahil, HER `race.subscribe`
 * çağrısında (idempotent, yeni bir state İCAT ETMEZ, `session.roster`
 * zaten `createPlaybackSession`'da BİR KEZ hesaplanmıştır).
 *
 * **`lobby.update` (bu turda EKLENDİ — docs/API.md §10'un ÖNCEDEN
 * `[PLANLI]` bıraktığı, F2'nin ilk turda BİLİNÇLİ kapsam dışı bıraktığı
 * son madde):** `JoinMatchmakingQueueUseCase`'in kendi doc yorumunda
 * belgelediği boşluk — kuyrukta ÖNCE bekleyen bir oyuncu, eşleşme
 * SONRADAN gelen bir oyuncunun `join` isteği İÇİNDE gerçekleşse bile
 * bunu HİÇBİR ŞEKİLDE öğrenemiyordu (eşleştirme TAMAMEN senkron, bkz. o
 * use-case'in doc yorumu). Bu YENİ bir eşleştirme/bekleme mekanizması
 * İCAT ETMEZ — yalnızca ZATEN var olan `/races` namespace'i bağlantı/
 * kimlik doğrulama altyapısını TEKRAR KULLANIR: `handleConnection`, token
 * doğrulandıktan HEMEN SONRA, HER istemciyi (yarışlara özel `race:
 * ${raceId}` odalarına EK olarak) KENDİ oyuncu-bazlı bir odaya
 * (`player:${playerId}`, bkz. `playerRoom`) da katar. `RaceGateway`,
 * `LobbyNotifier` portunu (`application/ports/lobby-notifier.ts`)
 * implemente eder: `notifyMatchFound(playerId, result)` bu odaya
 * `lobby.update` yayınlar — `JoinMatchmakingQueueUseCase.playMatch`,
 * eşleşme/DB yazımı TAMAMLANDIKTAN SONRA, ZATEN kuyrukta bekleyen tarafa
 * (ÇAĞIRANIN rakibi) KENDİ perspektifinden inşa edilmiş (`own`/`opponent`
 * alanları TERS çevrilmiş) bir `PvpMatchResult` ile bunu çağırır (bkz. o
 * use-case'in `playMatch` metodu). **BEST-EFFORT'tur:** oyuncunun o an
 * `/races` namespace'ine bağlı bir soketi YOKSA (`player:${playerId}`
 * odası boşsa) `server.to(oda).emit(...)` Socket.IO'nun standart
 * davranışı gereği SESSİZCE hiçbir şey YAPMAZ — garanti teslim/kuyruk
 * sistemi İCAT EDİLMEDİ; bağlantısı olmayan oyuncu hâlâ yeniden
 * `join`/`leave` çağırmak ZORUNDADIR (bkz. o use-case'in güncellenmiş
 * "ÖNEMLİ, BİLİNÇLİ SINIRLAMA" notu).
 *
 * **YARIŞ SOHBETİ + CANLI İZLEYİCİ SAYISI (brief §13/§27, proje sahibinin
 * açık talebi, 27.09.2026 — bu dilimde EKLENDİ):** Bu gateway'e İKİ yeni
 * yetenek geldi, ikisi de mevcut `/races` odasını ve mevcut yetkilendirme
 * kapısını TEKRAR KULLANIR (yeni bir oda/namespace/kimlik mekanizması
 * İCAT EDİLMEDİ):
 *
 * 1. **`race.spectators` (brief §27 "👥 348 spectators"):** sayı,
 *    `race:${raceId}` odasındaki AÇIK soket sayısıdır (`server.sockets.
 *    adapter.rooms`). Kimin abone olabileceği ZATEN `race.subscribe`
 *    kapısından geçtiği için burada AYRICA bir yetki sorusu YOKTUR —
 *    sayaç, kapının kendisinin doğal bir yan ürünüdür. Abone olunduğunda
 *    ve bağlantı koptuğunda odanın TAMAMINA yayınlanır.
 *    **BİLİNÇLİ SINIRLAMA (tek örnek):** `server.sockets.adapter`
 *    Socket.IO'nun VARSAYILAN bellek-içi adapter'ıdır; bu sayaç, Redis
 *    adapter'ı bağlanmadan YALNIZCA TEK bir sunucu örneği için doğrudur.
 *    Çok örnekli bir kurulumda yanlış (eksik) sayı verirdi — bu, o
 *    ölçek adımında çözülecek AYRI bir iştir ve burada sessizce
 *    varsayılmaz.
 *
 * 2. **`chat.message` / `chat.message.received` / `chat.history`
 *    (brief §13 "Chat WebSocket üzerinden gerçek zamanlı çalışmalı"):**
 *    mesaj `SendRaceMessageUseCase` ile YAZILIR (domain doğrulaması orada,
 *    `normalizeMessageBody`), SONRA odaya yayınlanır — yani istemcinin
 *    gördüğü şey HER ZAMAN veritabanına gerçekten yazılmış satırdır
 *    (CLAUDE.md "SUNUCU OTORİTESİ"; istemci kendi mesajını kendi ekranına
 *    "optimistic" ekleyip sunucudan farklı bir şey gösterebilseydi, iki
 *    izleyici farklı sohbetler görürdü). Geçmiş (`chat.history`) YALNIZCA
 *    yeni abone olan istemciye gider, odaya DEĞİL (bkz.
 *    `RaceChatHistoryPayload` doc yorumu).
 *
 * **Yetkilendirme — YENİ BİR KAPI AÇILMADI:** `chat.message` göndermek
 * için gereken tek şey, bu soketin DAHA ÖNCE başarılı bir `race.subscribe`
 * yapmış olmasıdır (`client.data.raceIds`). Bu, "katılımcı VEYA tribün
 * bileti sahibi" kapısının TA KENDİSİDİR (`GetRaceTimelineUseCase`) —
 * yalnızca HER MESAJDA yeniden sorulmaz, çünkü o soru tam bir timeline
 * okuması demektir ve sohbeti yarış yayınının kendisinden pahalı hâle
 * getirirdi (bkz. `SendRaceMessageUseCase` doc yorumu).
 *
 * **Hız sınırı (brief §32 "RATE LIMIT — chat"):** HTTP'deki
 * `RateLimitGuard` bir `CanActivate`'tir ve WebSocket'te ÇALIŞMAZ; bu
 * yüzden sohbet için AYNI `config/chat.config.json → rateLimit`
 * değerlerinden beslenen sabit pencereli bir sayaç burada tutulur
 * (`client.data.chatWindow`, Redis YOK — bkz. `RateLimitGuard`'ın "Redis
 * yalnızca sayaç içindir, authoritative değildir" ilkesi; buradaki sayaç
 * ise tamamen o soketin belleğindedir ve soket kopunca kaybolur, ki bu
 * İSTENEN davranıştır). Sayaç, GÖVDE DOĞRULAMASINDAN ÖNCE artırılır:
 * aksi halde geçersiz gövde gönderen bir istemci sınırsız deneme
 * yapabilirdi.
 */
const PLAYBACK_DURATION_MS = 4_000;

/**
 * Bir `raceId`'nin TÜM izleyicileri arasında PAYLAŞILAN tekil playback
 * durumu — bkz. dosya başı doc yorumu "Senkronize çoklu-izleyici" bölümü.
 * `firedScaledDelays`, hangi zamanlayıcıların GERÇEKTEN ateşlendiğini
 * (yalnızca "elapsed >= scaledDelay" TAHMİNİYLE DEĞİL) takip eder — bu,
 * geç katılan bir istemcinin "yakalama" yayınının, henüz ateşlenmemiş bir
 * zamanlayıcıyla YARIŞ DURUMUNA (race condition) girip aynı segmenti İKİ
 * KEZ almasını yapısal olarak İMKANSIZ kılar (Node'un `setTimeout`
 * gecikmesi/jitter'ından bağımsız, sadece "gerçekten oldu mu" sorusuna
 * dayanır).
 */
interface RacePlaybackSession {
  readonly raceId: string;
  readonly startedAtMs: number;
  /** Bkz. dosya başı doc yorumu "`race.roster`" bölümü. */
  readonly roster: readonly RaceRosterEntrant[];
  readonly segmentsByScaledDelay: ReadonlyMap<number, RaceSegmentSnapshot[]>;
  readonly firedScaledDelays: Set<number>;
  readonly finishedPayload: RaceFinishedPayload;
  finished: boolean;
  readonly timers: ReturnType<typeof setTimeout>[];
}

/**
 * Bir soketin sohbet hız sınırı penceresi (bkz. dosya başı doc yorumu
 * "Hız sınırı" bölümü). `RateLimitGuard`'ın Redis'teki
 * `ratelimit:<ad>:<kimlik>` anahtarının buradaki karşılığıdır — ama
 * BİLİNÇLİ olarak Redis'te DEĞİL, soketin kendi `data`'sında tutulur:
 * sohbet zaten yalnızca AÇIK bir soket üzerinden akabilir, yani soket
 * koptuğunda sayacın yaşaması gerekmez (soket kopunca yeniden bağlanan
 * istemci temiz bir pencereyle başlar — istenen davranış).
 */
interface ChatRateWindow {
  windowStartedAtMs: number;
  count: number;
}

@WebSocketGateway({
  namespace: '/races',
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class RaceGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy,
    LobbyNotifier,
    NotificationNotifier
{
  private readonly logger = new Logger(RaceGateway.name);
  private shuttingDown = false;

  /**
   * `raceId` → paylaşılan playback oturumu. Bir oturum, `race.finished`
   * yayınından `SESSION_RETENTION_AFTER_FINISH_MS` sonra buradan SİLİNİR
   * (bkz. dosya başı doc yorumu) — bu Map süresiz büyümez.
   */
  private readonly raceSessions = new Map<string, RacePlaybackSession>();

  /**
   * BEKLEYEN TRİBÜN (01.10.2026) — henüz bitmemiş bir yarışa abone olunan
   * odalar için yoklama zamanlayıcıları. Eskiden bitmemiş yarışa abone olmak
   * BOŞ bir oynatma oturumu kuruyordu: 4 sn sonra sıra bilgisi olmayan
   * `race.finished` yayınlanıyor ve oturum 60 sn önbellekte kalıyordu — o
   * sürede gelen izleyici de yarışı hiç göremiyordu. Kontrollü yarışta
   * (kilit → canlı koşu → kesinleşme) bu pencere dakikalar sürer.
   */
  private readonly waitingRaces = new Map<string, ReturnType<typeof setInterval>>();

  /** Bkz. dosya başı doc yorumu "Senkronize çoklu-izleyici" bölümü. */
  private static readonly SESSION_RETENTION_AFTER_FINISH_MS = 60_000;

  /**
   * **BU ALAN `Server` DEĞİL, `Namespace`'TİR — ve bu bir yazım tercihi
   * DEĞİL, ÇALIŞMA ZAMANI GERÇEĞİDİR.** Nest, `namespace` seçeneği verilen
   * bir gateway'de (`@WebSocketGateway({ namespace: '/races' })`) bu alana
   * io Server'ı DEĞİL, o namespace'in kendisini atar. İkisinin API'si
   * `.to(oda).emit(...)` için AYNIdır, ama oda sayımı için AYNI DEĞİLDİR:
   *
   *   - io Server'da  → `server.sockets` bir NAMESPACE'tir, `.adapter` vardır.
   *   - Namespace'te  → `server.sockets` bir `Map<SocketId, Socket>`'TİR,
   *                     `.adapter` YOKTUR.
   *
   * Bu yüzden `server.sockets.adapter.rooms` Namespace üzerinde ÇALIŞMA
   * ZAMANINDA `TypeError: Cannot read properties of undefined (reading
   * 'rooms')` verir (yaşandı — `broadcastSpectatorCount` bu yüzden patladı
   * ve `joinSharedPlayback`'in kalanı hiç koşmadı, `race.roster` hiç
   * gönderilmedi). Doğrusu `server.adapter.rooms`'tur. Tipi `Server` yazmak
   * derleyiciyi susturur ama hatayı GİZLEMEZ — o yüzden burada gerçek tip
   * (`Namespace`) yazılıdır.
   */
  @WebSocketServer()
  server!: Namespace;

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(AuthSessionUseCase) private readonly authSessions: AuthSessionUseCase,
    @Inject(GetRaceTimelineUseCase) private readonly getRaceTimelineUseCase: GetRaceTimelineUseCase,
    // YARIŞ SOHBETİ (brief §13, bu dilimde EKLENDİ) — bkz. dosya başı doc
    // yorumu. `@Inject()` AÇIKÇA yazılır (CLAUDE.md: Vitest/esbuild
    // `design:paramtypes` üretmez, tipe dayalı örtük DI sessizce
    // `undefined` çözer ve yalnızca CI'da patlar).
    @Inject(SendRaceMessageUseCase) private readonly sendRaceMessageUseCase: SendRaceMessageUseCase,
    @Inject(ListRaceMessagesUseCase) private readonly listRaceMessagesUseCase: ListRaceMessagesUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * KİMLİK DOĞRULAMA EL SIKIŞMADA (02.10.2026, migration 0057). Oturum kapısı
   * bir veritabanı sorgusudur (asenkron); `handleConnection`da beklenseydi
   * istemcinin bağlanır bağlanmaz yolladığı `race.subscribe`,
   * `client.data.playerId` dolmadan işlenip reddedilirdi (yaşandı: soket
   * e2e'leri zaman aşımına düştü). Ara katman bağlantı KURULMADAN önce koşar;
   * reddedilen istemci `connect_error` alır, hiç bağlanmaz.
   */
  afterInit(server: Namespace): void {
    server.use((client, next) => {
      void this.authenticate(client).then(
        () => next(),
        () => next(new Error('Geçersiz ya da kapatılmış oturum.')),
      );
    });
  }

  private async authenticate(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      throw new Error('token yok');
    }
    const payload = this.tokenService.verify(token);
    // HTTP guard'ıyla AYNI oturum kapısı: kapatılmış oturum ya da silinmiş
    // hesap soket de açamaz.
    await this.authSessions.authorize(payload);
    client.data.playerId = payload.sub;
  }

  async handleConnection(client: Socket): Promise<void> {
    const playerId = client.data.playerId as string | undefined;
    if (!playerId) {
      client.disconnect(true);
      return;
    }
    // `lobby.update` (bu turda EKLENDİ) — bkz. dosya başı doc yorumu
    // "`lobby.update`" bölümü. HER istemci, kendi `race.subscribe`
    // çağrısından BAĞIMSIZ olarak (yani bağlantı kurulur kurulmaz,
    // hiçbir yarışa abone olmadan ÖNCE) kendi oyuncu-bazlı odasına
    // katılır — `notifyMatchFound`'un bu istemciye ulaşabilmesi için
    // TEK ön koşul budur.
    await client.join(this.playerRoom(playerId));
  }

  /**
   * ÖNCEDEN (tek-izleyici tasarımı) burada bağlantıyı koparan istemcinin
   * KENDİ zamanlayıcıları iptal ediliyordu. Artık zamanlayıcılar bir
   * `raceId`'ye AİT paylaşılan bir oturuma bağlı (bkz. `RacePlaybackSession`)
   * — TEK bir izleyicinin bağlantısı kopması, AYNI yarışı izleyen BAŞKA
   * istemcilerin yayınını KESMEMELİDİR. Socket.IO, kopan istemciyi TÜM
   * odalarından (`race:${raceId}` dahil) otomatik olarak çıkarır — burada
   * elle yapılacak bir temizlik YOK.
   */
  /** Uygulama kapanırken (soket sunucusu kapanmadan ÖNCE çağrılır). */
  onModuleDestroy(): void {
    this.shuttingDown = true;
  }

  handleDisconnect(client: Socket): void {
    // CANLI İZLEYİCİ SAYISI (brief §27, bu dilimde EKLENDİ) — bkz. dosya
    // başı doc yorumu. `handleDisconnect` (Socket.IO'nun `disconnect`
    // olayı) TETİKLENDİĞİNDE soket odalarından ZATEN çıkarılmıştır
    // (`_onclose` → `leaveAll()` → `emit('disconnect')` sırası), yani
    // aşağıdaki sayaç bu istemciyi ARTIK SAYMAZ — istenen davranış budur
    // (kalan izleyiciler doğru sayıyı görür). Soketin HANGİ odalarda
    // olduğunu `client.rooms`'tan okumak MÜMKÜN DEĞİLDİR (o küme bu
    // noktada boşaltılmıştır), bu yüzden abonelikler `client.data.raceIds`
    // içinde AYRICA tutulur.
    const raceIds = client.data.raceIds as Set<string> | undefined;
    if (raceIds !== undefined) {
      for (const raceId of raceIds) {
        this.broadcastSpectatorCount(raceId);
      }
    }
    this.logger.debug(`Bağlantı koptu: ${client.id}`);
  }

  @SubscribeMessage('race.subscribe')
  async handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<void> {
    const playerId = client.data.playerId as string | undefined;
    if (!playerId) {
      // `handleConnection` bu durumda ZATEN bağlantıyı kesmiş olmalı — bu,
      // ulaşılmaması gereken bir savunma dalı (docs/ARCHITECTURE.md §9.1
      // Hata 7 ile AYNI ruh).
      client.disconnect(true);
      return;
    }

    const raceId = this.extractRaceId(body);
    if (raceId === null) {
      client.emit('race.error', { message: 'Geçersiz raceId.' });
      return;
    }

    let timeline: RaceTimelineView;
    try {
      timeline = await this.getRaceTimelineUseCase.execute(raceId, playerId);
    } catch (error) {
      client.emit('race.error', { message: error instanceof Error ? error.message : 'Beklenmeyen hata.' });
      return;
    }

    // Oturum zaten varsa (bitmiş yarış ya da kesinleşmeyle başlamış oynatma)
    // ona katıl; yoksa yarışın gerçekten bitip bitmediğine bak.
    if (this.raceSessions.has(raceId)) {
      await this.joinSharedPlayback(client, timeline);
      return;
    }
    let playback: Awaited<ReturnType<GetRaceTimelineUseCase['pollForPlayback']>>;
    try {
      playback = await this.getRaceTimelineUseCase.pollForPlayback(raceId);
    } catch (error) {
      client.emit('race.error', { message: error instanceof Error ? error.message : 'Beklenmeyen hata.' });
      return;
    }
    if (playback.state === 'finished') {
      await this.joinSharedPlayback(client, playback.timeline);
      return;
    }
    await this.joinWaitingRoom(client, timeline, playback.state);
  }

  /**
   * Bitmemiş (ya da iptal edilmiş) yarışın odası: izleyici sayılır, sohbet
   * eder, kadroyu görür — ama oynatma oturumu KURULMAZ. Bekleyen yarış
   * yoklanır; kesinleşince oynatma odanın tamamına başlar.
   */
  private async joinWaitingRoom(
    client: Socket,
    timeline: RaceTimelineView,
    state: 'pending' | 'cancelled',
  ): Promise<void> {
    await client.join(this.raceRoom(timeline.raceId));
    this.trackSubscription(client, timeline.raceId);
    this.broadcastSpectatorCount(timeline.raceId);
    await this.emitChatHistory(client, timeline.raceId);
    const rosterPayload: RaceRosterPayload = { raceId: timeline.raceId, entrants: toRoster(timeline) };
    client.emit('race.roster', rosterPayload);
    if (state === 'cancelled') {
      client.emit('race.cancelled', { raceId: timeline.raceId });
      return;
    }
    client.emit('race.waiting', { raceId: timeline.raceId });
    this.ensureWaitingPoll(timeline.raceId);
  }

  private ensureWaitingPoll(raceId: string): void {
    if (this.waitingRaces.has(raceId)) {
      return;
    }
    const timer = setInterval(() => {
      void this.checkWaitingRace(raceId);
    }, this.config.raceLobby.spectatorWaitPollSeconds * 1000);
    timer.unref?.();
    this.waitingRaces.set(raceId, timer);
  }

  private stopWaitingPoll(raceId: string): void {
    const timer = this.waitingRaces.get(raceId);
    if (timer !== undefined) {
      clearInterval(timer);
      this.waitingRaces.delete(raceId);
    }
  }

  /** Bekleyen yarışın tek yoklama turu — boş oda yoklamayı durdurur. */
  async checkWaitingRace(raceId: string): Promise<void> {
    const room = this.raceRoom(raceId);
    if ((this.server.adapter.rooms.get(room)?.size ?? 0) === 0) {
      this.stopWaitingPoll(raceId);
      return;
    }
    let playback: Awaited<ReturnType<GetRaceTimelineUseCase['pollForPlayback']>>;
    try {
      playback = await this.getRaceTimelineUseCase.pollForPlayback(raceId);
    } catch (error) {
      this.logger.warn(
        `Bekleyen tribün yoklanamadı (yarış ${raceId}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (playback.state === 'pending') {
      return;
    }
    this.stopWaitingPoll(raceId);
    if (playback.state === 'cancelled') {
      // Yoklama örneğe yereldir (her örnek kendi bekleyen izleyicilerini yoklar).
      this.server.local.to(room).emit('race.cancelled', { raceId });
      return;
    }
    if (!this.raceSessions.has(raceId)) {
      // Oturumun zamanlayıcıları odanın TAMAMINA yayın yapar — bekleyen
      // izleyiciler oynatmayı birlikte izler.
      this.raceSessions.set(raceId, this.createPlaybackSession(playback.timeline));
    }
  }

  private extractRaceId(body: unknown): string | null {
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const raceId = (body as { raceId?: unknown }).raceId;
    return typeof raceId === 'string' && UUID_PATTERN.test(raceId) ? raceId : null;
  }

  private raceRoom(raceId: string): string {
    return `race:${raceId}`;
  }

  /** Bkz. dosya başı doc yorumu "`lobby.update`" bölümü — `raceRoom` ile AYNI desen. */
  private playerRoom(playerId: string): string {
    return `player:${playerId}`;
  }

  /**
   * `LobbyNotifier.notifyMatchFound` (bu turda EKLENDİ) — bkz. dosya başı
   * doc yorumu "`lobby.update`" bölümü ve `application/ports/lobby-notifier.ts`
   * doc yorumu. BEST-EFFORT: `playerId`nin `player:${playerId}` odasında o
   * an kimse (açık bir soket) YOKSA `server.to(...).emit(...)` Socket.IO'nun
   * standart davranışı gereği SESSİZCE hiçbir şey YAPMAZ — bu bir HATA
   * DEĞİL, İSTENEN davranıştır (garanti teslim/kuyruk sistemi İCAT
   * EDİLMEDİ). Bu metodun kendisi normal koşullarda hiçbir zaman fırlatmaz.
   */
  notifyMatchFound(playerId: string, result: PvpMatchResult): void {
    this.server.to(this.playerRoom(playerId)).emit('lobby.update', result);
  }

  /**
   * BİLDİRİM YAYINI (brief §28, §42 PHASE 11) — `NotificationNotifier`
   * portunun (`application/ports/notification-notifier.ts`) uygulaması.
   * Üçü de `lobby.update` ile AYNI odayı (`player:${playerId}`) ve AYNI
   * best-effort sözleşmeyi kullanır: oyuncunun açık bir soketi yoksa
   * `server.to(...).emit(...)` sessizce hiçbir şey yapmaz — bildirim
   * satırı ZATEN veritabanına yazılmıştır, oyuncu onu bir sonraki
   * `GET /players/:id/notifications` çağrısında görür. Garanti teslim/
   * kuyruk sistemi BİLİNÇLİ olarak İCAT EDİLMEDİ (`notifyMatchFound`
   * ile AYNI sınır).
   *
   * **NEDEN ÜÇ AYRI OLAY (tek bir `notification.created` yetmez):**
   * bildirim LİSTESİ ile davet KARTI istemcide iki ayrı tüketicidir —
   * rozet sayacı listeyi, iki düğmeli kart (`[JOIN]`/`[DECLINE]`) daveti
   * dinler. Üçüncü olay (`race.invite.responded`) ise DAVET EDENE gider,
   * yani farklı bir ALICIYA: davet eden kendi bekleyen davetini ekranında
   * görüyordur ve sonucu öğrenmelidir.
   */
  notifyNotification(playerId: string, notification: NotificationView): void {
    this.server.to(this.playerRoom(playerId)).emit('notification.created', notification);
  }

  /** Bkz. `notifyNotification` doc yorumu — ALICI: davet EDİLEN. */
  notifyRaceInvite(inviteeId: string, invite: RaceInviteView): void {
    this.server.to(this.playerRoom(inviteeId)).emit('race.invite', invite);
  }

  /** Bkz. `notifyNotification` doc yorumu — ALICI: davet EDEN. */
  notifyRaceInviteResponded(inviterId: string, invite: RaceInviteView): void {
    this.server.to(this.playerRoom(inviterId)).emit('race.invite.responded', invite);
  }

  /**
   * Bir istemciyi bu `raceId`'nin PAYLAŞILAN playback oturumuna katar —
   * bkz. dosya başı doc yorumu "Senkronize çoklu-izleyici" bölümü. Oturum
   * yoksa (bu, bu yarış için İLK `race.subscribe` çağrısıdır) önce
   * `createPlaybackSession` ile oluşturulur. `client.join(room)` `await`
   * EDİLİR — bu, "yakalama" hesaplamasıyla oda üyeliği arasında hiçbir
   * `setTimeout` geri çağrısının araya GİREMEYECEĞİNİ garanti eder (Node
   * tek iş parçacıklıdır; bu senkron/await zinciri tamamlanmadan hiçbir
   * zamanlayıcı geri çağrısı ÇALIŞAMAZ), yani bir segment ASLA hem
   * "yakalama" hem de oda yayınıyla İKİ KEZ gönderilmez.
   */
  private async joinSharedPlayback(client: Socket, timeline: RaceTimelineView): Promise<void> {
    const room = this.raceRoom(timeline.raceId);
    const existingSession = this.raceSessions.get(timeline.raceId);
    // `session` sabit bir `const` — kapatma (closure) içinde kullanılan
    // değişkenin TypeScript tarafından "hiç değişmeyecek" olarak
    // daraltılabilmesi için (`!` tip zorlaması yerine, bkz. bu oturumun
    // `gate-assignment.ts`'teki AYNI prensibi) `let session` ile SONRADAN
    // atama yerine burada TEK seferlik bir `const` ifadesi kullanılıyor.
    const session: RacePlaybackSession = existingSession ?? this.createPlaybackSession(timeline);
    if (!existingSession) {
      this.raceSessions.set(timeline.raceId, session);
    }

    await client.join(room);

    // Abonelik kaydı (bu dilimde EKLENDİ) — `chat.message`'ın yetki kapısı
    // ve `handleDisconnect`'in "hangi odaları güncellemeliyim" kaynağı
    // (bkz. dosya başı doc yorumu "Yetkilendirme" bölümü).
    this.trackSubscription(client, timeline.raceId);

    // CANLI İZLEYİCİ SAYISI (brief §27) — `client.join`'den SONRA
    // çağrılır ki YENİ izleyici de kendi katılımıyla oluşan sayıyı
    // görsün; odanın TAMAMINA yayınlanır (tek bir istemciye değil).
    this.broadcastSpectatorCount(timeline.raceId);

    // SOHBET GEÇMİŞİ (brief §13) — YALNIZCA bu istemciye. Best-effort:
    // geçmiş okunamazsa (ör. geçici bir DB hatası) yarış yayını YİNE DE
    // devam eder; sohbet geçmişi yüzünden bir yarışı izleyememek kabul
    // edilemez bir davranış olurdu.
    await this.emitChatHistory(client, timeline.raceId);

    // `race.roster` — bkz. dosya başı doc yorumu. Catch-up `race.telemetry`'den
    // ÖNCE gönderilir ki istemci ilk segment görüntülenmeden ÖNCE isim/
    // "bu benim atım mı" eşlemesine sahip olsun. Geç katılan bir istemci
    // için de TEKRAR gönderilir (idempotent — `session.roster` bir kez
    // hesaplanmıştır, burada yeniden hesaplanmaz, sadece okunur).
    //
    // CI #134 kırmızı (bu turda düzeltildi): `session.roster`'ın tipi
    // `readonly RaceRosterEntrant[]` (bkz. `RacePlaybackSession` arayüzü —
    // BİLEREK salt-okunur, çünkü bir kez hesaplanıp asla mutasyona
    // uğramamalı), ama `RaceRosterPayload.entrants` mutable `RaceRosterEntrant[]`
    // bekliyor — TypeScript bunu (haklı olarak) reddeder: salt-okunur bir
    // dizi mutable bir dizi tipine ATANAMAZ (tersi serbesttir). `ts.
    // transpileModule` (bu sandbox'taki tek yerel doğrulama) sadece
    // sözdizimi kontrolü yaptığından bu GERÇEK tip hatasını YAKALAYAMADI —
    // gerçek `tsc` (CI) yakaladı. Düzeltme: `session.roster`'ı `as`/`!` ile
    // ZORLAMAK yerine yayma (`...`) operatörüyle GERÇEKTEN yeni, mutable bir
    // dizi kopyası oluştur — `session.roster`'ın kendisi hâlâ salt-okunur
    // kalır (mutasyona uğramaz), yalnızca bu tek olay payload'ı için ayrı
    // bir kopya üretilir.
    const rosterPayload: RaceRosterPayload = { raceId: timeline.raceId, entrants: [...session.roster] };
    client.emit('race.roster', rosterPayload);

    // "Yakalama" — bu oturumda GERÇEKTEN ateşlenmiş (tahmini DEĞİL,
    // `firedScaledDelays` ile takip edilen) tüm segmentleri TEK bir
    // `race.telemetry` olayında bu istemciye (yalnızca bu istemciye,
    // odaya DEĞİL) gönderir. Client tarafı segmentleri kendi
    // `timestampMs`'lerine göre render ettiğinden (bkz. `timeline-
    // playback.ts`), bunların hepsinin TEK bir olayda toplu gelmesi
    // sorun teşkil etmez.
    const catchUpSegments = [...session.segmentsByScaledDelay.entries()]
      .filter(([scaledDelay]) => session.firedScaledDelays.has(scaledDelay))
      .flatMap(([, segments]) => segments);
    if (catchUpSegments.length > 0) {
      client.emit('race.telemetry', { raceId: timeline.raceId, segments: catchUpSegments });
    }
    if (session.finished) {
      client.emit('race.finished', session.finishedPayload);
    }

    this.logger.debug(
      `race.subscribe: ${client.id} → yarış ${timeline.raceId} (paylaşımlı playback'e katıldı, ${catchUpSegments.length} yakalama segmenti, finished=${session.finished})`,
    );
  }

  /**
   * `timeline.entrants[].segments[]`'i TÜM katılımcılar arasında
   * `timestampMs`'e göre tek bir kronolojik akışta birleştirir, en büyük
   * `timestampMs`'i (`totalDurationMs`) `PLAYBACK_DURATION_MS`'e ORANTILI
   * olarak sıkıştırır (ör. gerçek bir yarış ~100 saniye sürebilir ama
   * izleyici bunu ~4 saniyede "hızlandırılmış" izler — kimse gerçek
   * yarış süresi kadar beklemek İSTEMEZ, ve bu SIKIŞTIRMA segmentlerin
   * GÖRECELİ sıralamasını/aralığını bozmaz). Her zamanlayıcı, kendi
   * ölçekli gecikmesinde ateşlendiğinde `this.server.to(room).emit(...)`
   * ile bu `raceId`'yi izleyen ODANIN TAMAMINA (yalnızca TEK bir istemciye
   * DEĞİL) yayın yapar — bu, "senkronize çoklu-izleyici" tasarımının
   * kalbidir (bkz. dosya başı doc yorumu). TÜMÜ bittiğinde `race.finished`
   * odaya yayınlanır ve bir eviction zamanlayıcısı, oturumu bir süre sonra
   * (`SESSION_RETENTION_AFTER_FINISH_MS`) bellekten temizler.
   */
  private async emitChatHistory(client: Socket, raceId: string): Promise<void> {
    try {
      const history = await this.listRaceMessagesUseCase.execute(raceId);
      client.emit('chat.history', history);
    } catch (error) {
      this.logger.warn(
        `chat.history okunamadı (yarış ${raceId}): ${error instanceof Error ? error.message : String(error)}`,
      );
      const empty: RaceChatHistoryPayload = { raceId, messages: [] };
      client.emit('chat.history', empty);
    }
  }

  private createPlaybackSession(timeline: RaceTimelineView): RacePlaybackSession {
    const room = this.raceRoom(timeline.raceId);
    const allSegments = timeline.entrants.flatMap((entrant) => entrant.segments);
    const totalDurationMs = allSegments.reduce((max, segment) => Math.max(max, segment.timestampMs), 0);
    const scale = totalDurationMs > 0 ? PLAYBACK_DURATION_MS / totalDurationMs : 1;

    const sortedSegments = [...allSegments].sort((a, b) => a.timestampMs - b.timestampMs);

    // AYNI ölçekli gecikmeye denk gelen segmentler (farklı katılımcılar,
    // aynı `timestampMs`) TEK bir `race.telemetry` olayında gruplanır —
    // her segment için ayrı bir soket yazımı yerine.
    const segmentsByScaledDelay = new Map<number, RaceSegmentSnapshot[]>();
    for (const segment of sortedSegments) {
      const scaledDelay = Math.round(segment.timestampMs * scale);
      const bucket = segmentsByScaledDelay.get(scaledDelay);
      if (bucket) {
        bucket.push(segment);
      } else {
        segmentsByScaledDelay.set(scaledDelay, [segment]);
      }
    }

    const finishedPayload: RaceFinishedPayload = {
      raceId: timeline.raceId,
      entrants: timeline.entrants
        .map((entrant) => ({
          horseId: entrant.horseId,
          horseName: entrant.horseName,
          botLabel: entrant.botLabel,
          isBot: entrant.isBot,
          finishPosition: entrant.finishPosition,
          finalTimeMs: entrant.finalTimeMs,
          performanceScore: entrant.performanceScore,
        }))
        .sort((a, b) => (a.finishPosition ?? Number.MAX_SAFE_INTEGER) - (b.finishPosition ?? Number.MAX_SAFE_INTEGER)),
    };

    // Bkz. dosya başı doc yorumu "`race.roster`" bölümü — `segments`/
    // final-sonuç alanları BİLEREK dışarıda bırakılır (roster yarış
    // BAŞLARKEN gönderilir, o alanlar henüz/asla roster'a ait değildir).
    const roster: RaceRosterEntrant[] = toRoster(timeline);

    const session: RacePlaybackSession = {
      raceId: timeline.raceId,
      startedAtMs: Date.now(),
      roster,
      segmentsByScaledDelay,
      firedScaledDelays: new Set<number>(),
      finishedPayload,
      finished: false,
      timers: [],
    };

    for (const [scaledDelay, segments] of segmentsByScaledDelay) {
      const timer = setTimeout(() => {
        session.firedScaledDelays.add(scaledDelay);
        // ÖRNEĞE YEREL (02.10.2026): her API örneği kendi izleyicilerine kendi
        // oynatmasını yapar; Redis köprüsünden geçseydi kareler kopyalanırdı.
        this.server.local.to(room).emit('race.telemetry', { raceId: timeline.raceId, segments });
      }, scaledDelay);
      session.timers.push(timer);
    }

    const finishedTimer = setTimeout(() => {
      session.finished = true;
      this.server.local.to(room).emit('race.finished', finishedPayload);

      // Geç katılan bir izleyicinin hâlâ TAM bir "yakalama" (bu durumda:
      // anında `race.finished`) alabilmesi için oturumu HEMEN silmiyoruz —
      // bir süre (bkz. `SESSION_RETENTION_AFTER_FINISH_MS`) bekletiyoruz,
      // SONRA bellekten temizliyoruz (sınırsız büyüme YOK).
      const evictionTimer = setTimeout(() => {
        this.raceSessions.delete(timeline.raceId);
      }, RaceGateway.SESSION_RETENTION_AFTER_FINISH_MS);
      session.timers.push(evictionTimer);
    }, PLAYBACK_DURATION_MS + 1);
    session.timers.push(finishedTimer);

    return session;
  }

  // ============================================================
  // YARIŞ SOHBETİ + CANLI İZLEYİCİ SAYISI (brief §13/§27, bu dilimde EKLENDİ)
  // ============================================================

  /**
   * `chat.message` (brief §13) — istemci → sunucu. Sıra ÖNEMLİDİR:
   * (1) kimlik, (2) gövde ŞEKLİ (`raceId` UUID mi — ucuz, DB'ye gitmez),
   * (3) hız sınırı, (4) abonelik kapısı, (5) gövde doğrulaması + yazma,
   * (6) odaya yayın. Hız sınırı ve abonelik kapısı, yazmadan ÖNCE gelir
   * (bkz. dosya başı doc yorumu "Hız sınırı" bölümü) — reddedilen bir
   * mesaj veritabanına SIZMAZ.
   *
   * **Yayınlanan şey İSTEMCİNİN GÖVDESİ DEĞİL, YAZILAN SATIRDIR:**
   * `chat.message.received` `saved`'i taşır — kırpılmış gövde, sunucunun
   * çözdüğü `username`, sunucunun ürettiği `messageId`/`createdAt`. Bu,
   * "sunucu otoritesi"nin sohbet yolundaki karşılığıdır: iki izleyici
   * ASLA farklı bir sohbet görmez.
   */
  @SubscribeMessage('chat.message')
  async handleChatMessage(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<void> {
    const playerId = client.data.playerId as string | undefined;
    if (!playerId) {
      // `handleConnection` bu durumda ZATEN bağlantıyı kesmiş olmalı —
      // `handleSubscribe`'daki AYNI ulaşılmaz savunma dalı.
      client.disconnect(true);
      return;
    }

    const parsed = this.extractChatMessage(body);
    if (parsed === null) {
      client.emit('chat.error', { message: 'Geçersiz sohbet mesajı.' });
      return;
    }

    const rateLimitMessage = this.consumeChatQuota(client);
    if (rateLimitMessage !== null) {
      client.emit('chat.error', { message: rateLimitMessage });
      return;
    }

    if (!this.subscribedRaceIds(client).has(parsed.raceId)) {
      client.emit('chat.error', { message: 'Bu yarışa abone olmadan sohbet edemezsiniz.' });
      return;
    }

    let saved: RaceChatMessageView;
    try {
      saved = await this.sendRaceMessageUseCase.execute(parsed.raceId, playerId, parsed.body);
    } catch (error) {
      // `InvalidMessageBodyError` (boş/aşırı uzun gövde) BURAYA düşer —
      // HTTP'deki 400'ün WebSocket karşılığı `chat.error`'dır. Hata
      // sınıfını AYRIŞTIRMAYA gerek yoktur: mesaj metni zaten kullanıcıya
      // gösterilebilir (`normalizeMessageBody` doc yorumu).
      client.emit('chat.error', { message: error instanceof Error ? error.message : 'Beklenmeyen hata.' });
      return;
    }

    this.server.to(this.raceRoom(parsed.raceId)).emit('chat.message.received', saved);
  }

  /**
   * `race.emote` (02.10.2026, Faz 9, brief §52 EMOTES) — tribünde anlık tepki.
   * KALICI DEĞİL (DB'ye yazılmaz) ve ANONİMDİR: yayın yalnızca yarış + anahtar
   * taşır (kimin attığı yok — taciz aracı olmasın, isim için DB sorgusu da
   * gerekmez). Kapılar: kimlik, şekil, listedeki anahtar, abonelik, soket
   * başına soğuma (`chat.emotes.cooldownMs`). Reddedilen emote sessizce düşer
   * (`chat.error` sohbet hatası içindir; tepki için uyarı gürültü olurdu).
   */
  @SubscribeMessage('race.emote')
  handleEmote(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): void {
    if (!client.data.playerId) {
      client.disconnect(true);
      return;
    }
    if (typeof body !== 'object' || body === null) return;
    const raceId = (body as { raceId?: unknown }).raceId;
    const key = (body as { key?: unknown }).key;
    if (typeof raceId !== 'string' || !UUID_PATTERN.test(raceId) || typeof key !== 'string') return;
    const emotes = this.config.chat.emotes;
    if (!emotes.list.some((emote) => emote.key === key)) return;
    if (!this.subscribedRaceIds(client).has(raceId)) return;
    const nowMs = Date.now();
    const last = client.data.lastEmoteAtMs as number | undefined;
    if (last !== undefined && nowMs - last < emotes.cooldownMs) return;
    client.data.lastEmoteAtMs = nowMs;
    const event: RaceEmoteEvent = { raceId, key };
    this.server.to(this.raceRoom(raceId)).emit('race.emote', event);
  }

  /**
   * Sohbet hız sınırı (brief §32) — sabit pencere, soket başına (bkz.
   * dosya başı doc yorumu). Sınır AŞILDIYSA kullanıcıya gösterilecek
   * metni, aksi hâlde `null` döner. Sayaç AŞILDIĞINDA DA artmaya devam
   * eder; pencere kaydığında sıfırlanır — `RateLimitGuard`'ın Redis
   * `INCR`/`EXPIRE` davranışıyla AYNI sonucu verir.
   */
  private consumeChatQuota(client: Socket): string | null {
    const { limit, windowSeconds } = this.config.chat.rateLimit;
    const nowMs = Date.now();
    const existing = client.data.chatWindow as ChatRateWindow | undefined;
    const window: ChatRateWindow =
      existing !== undefined && nowMs - existing.windowStartedAtMs < windowSeconds * 1_000
        ? existing
        : { windowStartedAtMs: nowMs, count: 0 };
    window.count += 1;
    client.data.chatWindow = window;

    if (window.count > limit) {
      return `Çok hızlı mesaj gönderiyorsunuz. ${windowSeconds} saniye içinde en fazla ${limit} mesaj gönderebilirsiniz.`;
    }
    return null;
  }

  /**
   * `chat.message` gövdesini ayrıştırır: `raceId` KABACA şekil kontrolünden
   * geçmeli (`UUID_PATTERN` — `extractRaceId` ile AYNI desen), `body` ise
   * BİLEREK `unknown` olarak geçirilir: gerçek doğrulama
   * `SendRaceMessageUseCase` → `normalizeMessageBody` içindedir
   * (`CLAUDE.md` "Kardeş tuzak": WebSocket gövdesi için HTTP'deki
   * `ValidationPipe`'ın bir karşılığı YOKTUR).
   */
  private extractChatMessage(body: unknown): { raceId: string; body: unknown } | null {
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const raceId = (body as { raceId?: unknown }).raceId;
    if (typeof raceId !== 'string' || !UUID_PATTERN.test(raceId)) {
      return null;
    }
    return { raceId, body: (body as { body?: unknown }).body };
  }

  /**
   * Bir soketin ABONE OLDUĞU yarışlar (bkz. dosya başı doc yorumu
   * "Yetkilendirme" bölümü). `client.data` socket.io tarafından `any`
   * olarak tiplenir; bu yüzden okuma tek bir yerde, bu yardımcıda yapılır.
   * Küme yoksa OLUŞTURULUR — çağıranlar `undefined` ile uğraşmaz.
   */
  private subscribedRaceIds(client: Socket): Set<string> {
    const existing = client.data.raceIds as Set<string> | undefined;
    if (existing !== undefined) {
      return existing;
    }
    const created = new Set<string>();
    client.data.raceIds = created;
    return created;
  }

  private trackSubscription(client: Socket, raceId: string): void {
    this.subscribedRaceIds(client).add(raceId);
  }

  /**
   * Canlı izleyici sayısını (brief §27) odaya yayınlar. Sayı
   * `race:${raceId}` odasındaki AÇIK soket sayısıdır — `race_entries`/
   * `race_tickets` satır sayısı DEĞİL (bkz. `RaceSpectatorCountPayload`
   * doc yorumu). Oda boşsa `server.to(...)` sessizce hiçbir şey yapmaz
   * (`notifyMatchFound` ile AYNI, İSTENEN davranış).
   */
  private broadcastSpectatorCount(raceId: string): void {
    // Kapanışta soketler topluca kopar; Redis köprüsü o sırada kapanmış
    // olabilir (sayım isteği askıda reddedilir). Kapanan örneğin izleyicileri
    // başka örneğe bağlanınca sayı oradan yeniden yayınlanır.
    if (this.shuttingDown) {
      return;
    }
    void this.countAndBroadcastSpectators(raceId).catch((error: unknown) => {
      this.logger.warn(
        `İzleyici sayısı yayınlanamadı (yarış ${raceId}): ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /**
   * 02.10.2026 (Faz 13) — sayı TÜM örneklerdeki soketlerdir: `fetchSockets`
   * Redis köprüsünde örnekler arası sorar (tek örnekte yerel odayla aynı
   * sonucu verir). `server.adapter.rooms` YALNIZCA bu örneği sayardı.
   */
  private async countAndBroadcastSpectators(raceId: string): Promise<void> {
    const room = this.raceRoom(raceId);
    const count = (await this.server.in(room).fetchSockets()).length;
    const payload: RaceSpectatorCountPayload = { raceId, count };
    this.server.to(room).emit('race.spectators', payload);
  }
}

function toRoster(timeline: RaceTimelineView): RaceRosterEntrant[] {
  return timeline.entrants.map((entrant) => ({
    entryId: entrant.entryId,
    isBot: entrant.isBot,
    horseId: entrant.horseId,
    horseName: entrant.horseName,
    botLabel: entrant.botLabel,
    tacticalStyle: entrant.tacticalStyle,
    gatePosition: entrant.gatePosition,
  }));
}
