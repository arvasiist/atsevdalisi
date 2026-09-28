import type { RaceStatus } from '@at-sevdalisi/shared-types';

/**
 * `domain/admin/race-cancel.ts` — YARIŞ İPTALİNİN tek kuralı: hangi
 * durumdaki bir yarış iptal edilebilir? (brief §34 "Race: ... Cancel ...
 * işlemleri kontrollü şekilde yapılabilmeli.", 28.09.2026)
 *
 * Framework'süz saf TS'tir (CLAUDE.md kural 4) ve bu yüzden Vitest/esbuild
 * altında GERÇEKTEN koşar — DTO dekoratörlerinin aksine (CLAUDE.md kural 5
 * "Kardeş tuzak": `@IsIn` esbuild altında sessizce atlanır).
 *
 * **KURAL TEK SATIRDA: İPTAL `scheduled` VE `locking` İÇİN GEÇERLİDİR**
 * (`locking` migration 0042 ile eklendi, PHASE 1). İkisinin ortak özelliği
 * şudur: **ödül HENÜZ DAĞITILMAMIŞTIR.** Neden diğer üçü YASAK:
 *
 *  - `finished`: yarış KOŞTU ve ödüller dağıtıldı (`SettleRaceUseCase`,
 *    §13.14). İptal etmek "dağıtılmış ödülü geri al" demek olurdu — bu
 *    projede tanımlı bir işlem DEĞİLDİR ve iade tutarı defterden
 *    okunduğu için zaten YANLIŞ sonuç verirdi: kazanan oyuncunun
 *    defterinde `lobby_race_entry_fee` değil `race_prize` satırı vardır.
 *  - `in_progress`: yarış KOŞUYOR. Ortasından para iade etmek, ödül
 *    havuzunu simülasyonun altından çekmek demektir. **Bu durum bugün
 *    hiçbir kod tarafından YAZILMAZ** (`races.status` geçişi
 *    `scheduled → finished`tir) ama kural onu da kapatır: bir gün
 *    yazılmaya başlarsa iptal sessizce yanlış şey yapmamalıdır.
 *  - `cancelled`: zaten iptal edilmiş. İkinci iptal, iadeyi İKİNCİ KEZ
 *    ödemeye çalışırdı; koruma ayrıca `races.status` geçişinin kendisidir
 *    (`SettleRaceUseCase`'in `Idempotency-Key` yerine durum geçişine
 *    güvenmesiyle AYNI desen).
 *
 * **SAAT KURALI YOKTUR — bilinçli.** `startTime`'ı geçmiş ama hâlâ
 * `scheduled` olan bir yarış (crank henüz çağrılmadı, `SettleRaceUseCase`
 * doc yorumu) İPTAL EDİLEBİLİR. Bu doğru davranıştır: yarış koşmadıysa
 * yöneticinin elindeki tek meşru işlem parayı geri vermektir. Aksi hâlde
 * "başlama saati geçti" diye iptali reddetmek, havuzu kalıcı olarak
 * kilitleyen bir kural olurdu. Yarışı KOŞTURMAK isteyen çağrı zaten
 * `POST /races/:id/settle`tir ve İKİ YOL DA `races` satırını `FOR UPDATE`
 * ile kilitler: hangisi önce kilidi alırsa o kazanır, diğeri yeni durumu
 * görüp reddedilir. Yani "aynı anda iptal + koşma" YARIŞI yoktur.
 */

/**
 * İptalin reddedilme nedenleri — KAPALI küme (test ve mesaj ayrımı için).
 *
 * `UNKNOWN_STATUS` savunma amaçlıdır: `races.status` sütunu DB'de CHECK
 * ile korunur, yani buraya düşmesi bir bütünlük hatasıdır — ama
 * "tanımadığım durumu iptal edilebilir saymak" sessiz bir para hatası
 * olurdu, "reddet" ise güvenli taraftır.
 */
export const RACE_CANCEL_REFUSALS = [
  'ALREADY_STARTED',
  'ALREADY_FINISHED',
  'ALREADY_CANCELLED',
  'UNKNOWN_STATUS',
] as const;

export type RaceCancelRefusal = (typeof RACE_CANCEL_REFUSALS)[number];

/**
 * Durum → ret nedeni. `scheduled` için `null` = "iptal edilebilir".
 *
 * `Record<RaceStatus, ...>` olarak yazılması BİLİNÇLİDİR: `races.status`
 * CHECK'ine yeni bir değer eklenip buranın unutulması tsc'yi KIRAR
 * (`REPORT_STATUS_TRANSITIONS`in kapalı çizge disipliniyle AYNI).
 */
const REFUSAL_BY_STATUS: Record<RaceStatus, RaceCancelRefusal | null> = {
  scheduled: null,
  // `locking` DE İPTAL EDİLEBİLİR (migration 0042, PHASE 1) — ve bu,
  // `finished`ten AYRILAN kritik noktadır: `locking` bir yarışta kadro ve
  // snapshot DONMUŞTUR ama ödül HENÜZ DAĞITILMAMIŞTIR. Dolayısıyla iade,
  // defterden doğru tutarı (`lobby_race_entry_fee`) bulur.
  //
  // Kapatılsaydı gerçek bir kilitlenme doğardı: kilit anında çöken ya da
  // kesinleştirmesi hiç çağrılmayan bir yarış `locking`te kalır ve
  // yöneticinin elinde parayı geri verecek HİÇBİR işlem olmazdı. `Pause`ın
  // aksine bu durumun var olması bir tasarım tercihi değil, zamanlayıcının
  // doğal sonucudur — dolayısıyla bir çıkışı olmak zorundadır.
  locking: null,
  in_progress: 'ALREADY_STARTED',
  finished: 'ALREADY_FINISHED',
  cancelled: 'ALREADY_CANCELLED',
};

/**
 * `status` iptal edilebilir mi? `null` = evet, aksi hâlde ret nedeni.
 *
 * Girdi `string`tir, `RaceStatus` DEĞİL: değer repository'den (dolayısıyla
 * veritabanından) gelir ve `pg` onu daraltılmamış metin olarak döndürür.
 * Tanınmayan bir değeri "iptal edilebilir" saymak yerine reddetmek, bu
 * fonksiyonun tek işidir.
 */
export function checkRaceCancelable(status: string): RaceCancelRefusal | null {
  // ⚠️ `?? 'UNKNOWN_STATUS'` YAZILAMAZ — `??` yalnızca `undefined`/`null`
  // için değil, TAM OLARAK `null` için de devreye girer ve `scheduled`in
  // "iptal edilebilir" işareti olan `null`ı yutardı: her iptal isteği
  // UNKNOWN_STATUS ile reddedilirdi. (Yakalandı: `race-cancel.spec.ts`,
  // 28.09.2026 — ilk yazım buydu.) Anahtarın VARLIĞI ayrıca sorulur.
  if (!Object.prototype.hasOwnProperty.call(REFUSAL_BY_STATUS, status)) {
    return 'UNKNOWN_STATUS';
  }
  return REFUSAL_BY_STATUS[status as RaceStatus];
}
