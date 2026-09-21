import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { RaceSegmentSnapshot, RaceTimelineView } from '@at-sevdalisi/shared-types';
import { GetRaceTimelineUseCase } from '../../application/use-cases/get-race-timeline.use-case';
import { TOKEN_SERVICE, type TokenService } from '../../application/ports/token.service';

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
 * **Kapsam DIŞI (bilinçli, gelecek dilimler için docs/ROADMAP.md'ye not
 * düşülecek):** (1) `notification.new`/`lobby.update` (docs/API.md §10'un
 * diğer iki önerisi) bu dilimde YOK. (2) Yeniden bağlanma/kaldığı yerden
 * devam etme YOK — bağlantı koparsa istemci `race.subscribe`'ı BAŞTAN
 * çağırır (yukarıdaki paylaşılan oturum sayesinde bu artık "yakalama"
 * mekanizmasından FAYDALANIR — tamamen sıfırdan başlamaz).
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
 */
const PLAYBACK_DURATION_MS = 4_000;

interface RaceFinishedPayload {
  raceId: string;
  entrants: Array<{
    horseId: string | null;
    horseName: string | null;
    botLabel: string | null;
    isBot: boolean;
    finishPosition: number | null;
    finalTimeMs: number | null;
    performanceScore: number | null;
  }>;
}

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
  readonly segmentsByScaledDelay: ReadonlyMap<number, RaceSegmentSnapshot[]>;
  readonly firedScaledDelays: Set<number>;
  readonly finishedPayload: RaceFinishedPayload;
  finished: boolean;
  readonly timers: ReturnType<typeof setTimeout>[];
}

@WebSocketGateway({
  namespace: '/races',
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class RaceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RaceGateway.name);

  /**
   * `raceId` → paylaşılan playback oturumu. Bir oturum, `race.finished`
   * yayınından `SESSION_RETENTION_AFTER_FINISH_MS` sonra buradan SİLİNİR
   * (bkz. dosya başı doc yorumu) — bu Map süresiz büyümez.
   */
  private readonly raceSessions = new Map<string, RacePlaybackSession>();

  /** Bkz. dosya başı doc yorumu "Senkronize çoklu-izleyici" bölümü. */
  private static readonly SESSION_RETENTION_AFTER_FINISH_MS = 60_000;

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(GetRaceTimelineUseCase) private readonly getRaceTimelineUseCase: GetRaceTimelineUseCase,
  ) {}

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.tokenService.verify(token);
      client.data.playerId = payload.sub;
    } catch {
      client.disconnect(true);
    }
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
  handleDisconnect(client: Socket): void {
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

    await this.joinSharedPlayback(client, timeline);
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

    const session: RacePlaybackSession = {
      raceId: timeline.raceId,
      startedAtMs: Date.now(),
      segmentsByScaledDelay,
      firedScaledDelays: new Set<number>(),
      finishedPayload,
      finished: false,
      timers: [],
    };

    for (const [scaledDelay, segments] of segmentsByScaledDelay) {
      const timer = setTimeout(() => {
        session.firedScaledDelays.add(scaledDelay);
        this.server.to(room).emit('race.telemetry', { raceId: timeline.raceId, segments });
      }, scaledDelay);
      session.timers.push(timer);
    }

    const finishedTimer = setTimeout(() => {
      session.finished = true;
      this.server.to(room).emit('race.finished', finishedPayload);

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
}
