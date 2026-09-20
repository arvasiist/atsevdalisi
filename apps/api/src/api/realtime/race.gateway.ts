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
 * **Kapsam DIŞI (bilinçli, gelecek dilimler için docs/ROADMAP.md'ye not
 * düşülecek):** (1) Her izleyici KENDİ abone olma anına göre bağımsız bir
 * "replay" akışı alır — AYNI yarışı izleyen iki izleyici birbirleriyle
 * SENKRONİZE DEĞİLDİR (gerçek "birlikte izleme" odası, brief §41 lobby
 * kavramına daha yakın bir sonraki dilim). (2) `notification.new`/
 * `lobby.update` (docs/API.md §10'un diğer iki önerisi) bu dilimde YOK.
 * (3) Yeniden bağlanma/kaldığı yerden devam etme YOK — bağlantı koparsa
 * istemci `race.subscribe`'ı BAŞTAN çağırır (replay idempotent'tir, zarar
 * vermez).
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

@WebSocketGateway({
  namespace: '/races',
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class RaceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RaceGateway.name);
  private readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

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

  handleDisconnect(client: Socket): void {
    const timers = this.pendingTimers.get(client.id);
    if (timers) {
      timers.forEach(clearTimeout);
      this.pendingTimers.delete(client.id);
    }
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

    this.streamTimeline(client, timeline);
  }

  private extractRaceId(body: unknown): string | null {
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const raceId = (body as { raceId?: unknown }).raceId;
    return typeof raceId === 'string' && UUID_PATTERN.test(raceId) ? raceId : null;
  }

  /**
   * `timeline.entrants[].segments[]`'i TÜM katılımcılar arasında
   * `timestampMs`'e göre tek bir kronolojik akışta birleştirir, en büyük
   * `timestampMs`'i (`totalDurationMs`) `PLAYBACK_DURATION_MS`'e ORANTILI
   * olarak sıkıştırır (ör. gerçek bir yarış ~100 saniye sürebilir ama
   * izleyici bunu ~4 saniyede "hızlandırılmış" izler — kimse gerçek
   * yarış süresi kadar beklemek İSTEMEZ, ve bu SIKIŞTIRMA segmentlerin
   * GÖRECELİ sıralamasını/aralığını bozmaz). Her segment kendi ölçekli
   * gecikmesinde AYRI bir `setTimeout` ile `race.telemetry` olarak
   * yayınlanır; TÜMÜ bittiğinde `race.finished` gönderilir. `handleDisconnect`
   * bu zamanlayıcıları `client.id`'ye göre TAKİP EDER ve erken kesilen bir
   * bağlantı için TEMİZLER (bellek sızıntısı/ölü socket'e yazma riski YOK).
   */
  private streamTimeline(client: Socket, timeline: RaceTimelineView): void {
    const allSegments = timeline.entrants.flatMap((entrant) => entrant.segments);
    const totalDurationMs = allSegments.reduce((max, segment) => Math.max(max, segment.timestampMs), 0);
    const scale = totalDurationMs > 0 ? PLAYBACK_DURATION_MS / totalDurationMs : 1;

    const sortedSegments = [...allSegments].sort((a, b) => a.timestampMs - b.timestampMs);
    const timers: ReturnType<typeof setTimeout>[] = [];

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

    for (const [scaledDelay, segments] of segmentsByScaledDelay) {
      const timer = setTimeout(() => {
        client.emit('race.telemetry', { raceId: timeline.raceId, segments });
      }, scaledDelay);
      timers.push(timer);
    }

    const finishedTimer = setTimeout(() => {
      const payload: RaceFinishedPayload = {
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
      client.emit('race.finished', payload);
      this.pendingTimers.delete(client.id);
    }, PLAYBACK_DURATION_MS + 1);
    timers.push(finishedTimer);

    this.pendingTimers.set(client.id, timers);
    this.logger.debug(`race.subscribe: ${client.id} → yarış ${timeline.raceId} (${segmentsByScaledDelay.size} telemetri anı)`);
  }
}
