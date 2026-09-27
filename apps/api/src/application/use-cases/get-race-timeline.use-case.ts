import { Inject, Injectable } from '@nestjs/common';
import type { RaceTimelineView } from '@at-sevdalisi/shared-types';
import { RaceNotFoundError } from '../../domain/race/errors';
import { RaceTicketRequiredError } from '../../domain/grandstand/errors';
import { GRANDSTAND_REPOSITORY, type GrandstandRepository } from '../ports/grandstand.repository';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';

/**
 * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`
 * (docs/API.md, brief §58 replay). `GetRecentRaceResultsUseCase` ile AYNI
 * "hiçbir iş kuralı içermez, yalnızca doğrulama + repository çağrısı"
 * deseni (docs/ARCHITECTURE.md §4).
 *
 * Yetkilendirme: bu, `HorseOwnerGuardByParam`'ın tekil-at sahipliğinden
 * FARKLI bir şekildir — burada `:id` bir AT değil bir YARIŞTIR, bu yüzden
 * ayrı bir route guard yerine burada, `RaceRepository.isPlayerParticipant`
 * ile "bu yarışta GERÇEKTEN bir atım var mıydı" sorusu sorulur. Yarış
 * BULUNAMAZSA `RaceNotFoundError` (404); yarış varsa ama istek sahibinin
 * hiçbir atı o yarışta YOKSA `ForbiddenError` (403) — kaynağın VARLIĞI
 * (404 ile) YALNIZCA gerçek katılımcılara sızdırılır, `HorseOwnerGuard`
 * ile AYNI "önce sahiplik" sırası burada TERSTİR (önce var mı, sonra
 * sahip misin) çünkü NOT_FOUND/FORBIDDEN ayrımı burada BİLGİ SIZDIRMAZ —
 * `races.id` client tarafından TAHMİN edilebilir bir kaynak değil
 * (yalnızca kendi yarış sonucundan öğrenilir), `HorseNotFoundError`'ın
 * `horses.id` için aldığı ÖNLEMLE (bkz. o hatanın 404 davranışı) AYNI
 * kategoridedir.
 *
 * **TRIBÜN (proje sahibinin açık talebi, 27.09.2026 — "insanlar yarışları
 * izleyebilsin"):** Kapıya İKİNCİ bir meşru gerekçe eklendi. Artık
 * yetkilendirme "katılımcı **VEYA** bilet sahibi"dir. Bu TEK değişiklik
 * hem HTTP yolunu (`GET /races/:id/timeline`) hem de WebSocket yolunu
 * (`race.gateway.ts`'in `race.subscribe`'ı — AYNI use-case'i çağırır)
 * BİRLİKTE açar; yetkinin TEK bir kaynağı olması bu tasarımın asıl
 * kazancıdır (ikinci bir kontrol noktası İCAT EDİLMEDİ).
 *
 * **Neden `ForbiddenError` yerine `RaceTicketRequiredError`:** ikisi de
 * 403'tür, ama istemcinin "Bilet Al" akışına yönlendirebilmesi için AYRI
 * bir koda ihtiyacı vardır (bkz. `error-codes.ts`'teki aynı gerekçe).
 * Mesaj da değişti: eskiden "yetkiniz yok" idi, şimdi kullanıcıya NE
 * YAPMASI gerektiğini söylüyor.
 *
 * **Bilgi sızdırmama KORUNUR:** sıra değişmedi — önce "yarış var mı"
 * (404), sonra "izleyebilir miyim" (403). Bilet sorgusu YALNIZCA yarışın
 * var olduğu doğrulandıktan SONRA çalışır.
 */
@Injectable()
export class GetRaceTimelineUseCase {
  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(GRANDSTAND_REPOSITORY) private readonly grandstandRepository: GrandstandRepository,
  ) {}

  async execute(raceId: string, requestingPlayerId: string): Promise<RaceTimelineView> {
    const timeline = await this.raceRepository.findTimelineByRaceId(raceId);
    if (timeline === null) {
      throw new RaceNotFoundError(raceId);
    }

    const isParticipant = await this.raceRepository.isPlayerParticipant(raceId, requestingPlayerId);
    if (!isParticipant) {
      // Bilet kontrolü YALNIZCA katılımcı DEĞİLSE yapılır — katılımcı için
      // gereksiz bir sorgu atılmaz (kısa devre).
      const hasTicket = await this.grandstandRepository.hasTicket(raceId, requestingPlayerId);
      if (!hasTicket) {
        throw new RaceTicketRequiredError(raceId);
      }
    }

    return timeline;
  }
}
