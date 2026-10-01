import { Inject, Injectable } from '@nestjs/common';
import type { RaceTimelineView } from '@at-sevdalisi/shared-types';
import { RaceNotFoundError } from '../../domain/race/errors';
import { RaceTicketRequiredError } from '../../domain/grandstand/errors';
import { canWatchRaceWithoutTicket } from '../../domain/grandstand/ticket';
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
 *
 * **ÜÇÜNCÜ GEREKÇE — ÜCRETSİZ TRIBÜN (PHASE 7.1, 29.09.2026).** Kapı artık
 * "katılımcı **VEYA** tribünü ücretsiz **VEYA** bilet sahibi"dir.
 * `races.tribune_fee = 0` olan bir yarışta bilet SATILMAZ
 * (`assertTribuneIsPaid` → 409 `RACE_TRIBUNE_FREE`) — yani yalnızca
 * `hasTicket`'e bakan bir kapı, o yarışı **kimseye açmazdı**: ne
 * izleyiciye ne bilet almaya çalışana. Bu, "ölü bir kapı" olurdu ve
 * hiçbir yerde hata üretmezdi.
 *
 * **Tek sorgu:** `getTribuneAccess` hem `tribune_fee`yi hem `hasTicket`i
 * TEK okumada döner. İki ayrı okuma, aralarında değişen bir duruma karşı
 * kapıyı tutarsız bırakırdı.
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
      // Tribün sorgusu YALNIZCA katılımcı DEĞİLSE yapılır — katılımcı için
      // gereksiz bir sorgu atılmaz (kısa devre).
      const access = await this.grandstandRepository.getTribuneAccess(raceId, requestingPlayerId);
      // `access === null` GÖRÜLEMEZ: yarışın varlığı yukarıda doğrulandı ve
      // yarışlar SİLİNMEZ. Yine de `null`u "kapalı" saymak (ücretsiz tribün
      // varsaymamak) güvenli taraftır — bilinmeyen bir durumda erişim
      // AÇMAK, sessiz bir yetki genişlemesi olurdu.
      const canWatchFree = access !== null && canWatchRaceWithoutTicket(access.tribuneFee);
      const hasTicket = access !== null && access.hasTicket;
      if (!canWatchFree && !hasTicket) {
        throw new RaceTicketRequiredError(raceId);
      }
      // 30.09.2026 — erişim YALNIZCA bilet sayesindeyse bilet "kullanıldı"
      // işaretlenir (migration 0044); izlenmiş bilet iade edilmez. Satır
      // bu arada iade edildiyse (`false`) erişim reddedilir — aksi hâlde
      // eşzamanlı "izle + iade et" bedava izleme penceresi bırakırdı.
      if (!canWatchFree && !(await this.grandstandRepository.markTicketViewed(raceId, requestingPlayerId))) {
        throw new RaceTicketRequiredError(raceId);
      }
    }

    return timeline;
  }
}
