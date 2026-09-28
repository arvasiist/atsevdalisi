/**
 * `domain/admin/errors.ts` — yönetim (admin) kurallarının hataları
 * (brief §34, §42 PHASE 15-B).
 *
 * Hepsi framework'süz saf TS'tir (CLAUDE.md kural 4) ve
 * `api/middleware/http-exception.filter.ts` → `DOMAIN_ERROR_MAP`'e
 * kayıtlıdır.
 */

/** Yetki yok — yalnızca yöneticiler (403). */
export class AdminRequiredError extends Error {
  /**
   * **`ForbiddenError`'DAN AYRI BİR SINIF.** `ForbiddenError` "bu kaynak
   * SENİN değil"dir (IDOR kapıları); burada oyuncunun kendi kaynağıyla
   * hiç ilgisi yoktur — eksik olan şey ROLDÜR. Tek sınıfta birleştirmek,
   * `DOMAIN_ERROR_MAP`'te tek bir kod üretirdi ve istemci "başka bir
   * hesaba geçmeliyim" ile "bu ekran bana hiç görünmemeli" durumlarını
   * ayırt edemezdi (bkz. `ErrorCode.AdminRequired` doc yorumu).
   *
   * **MESAJ ROLÜ SÖYLER, KAYNAĞI SÖYLEMEZ.** "Yönetici yetkisi
   * gerekiyor" demek, çağıranın zaten bildiği bir şeyi (bu bir yönetim
   * ucudur) tekrarlamaktır; sızdırdığı yeni bilgi YOKTUR.
   */
  constructor() {
    super('Bu işlem için yönetici yetkisi gerekiyor.');
    this.name = 'AdminRequiredError';
  }
}

/**
 * Şikâyet kaydı yok (404).
 *
 * **403 DEĞİL 404:** `RaceEntryNotFoundError`/`NotificationNotFoundError`
 * ile AYNI gerekçe — üzerinde işlem yapılacak kaynağın KENDİSİ yoktur.
 *
 * **SIRA ÖNEMLİDİR:** bu hata `AdminRequiredError`'DAN SONRA fırlatılır.
 * Yönetici olmayan bir çağırana "bu kimlik var mı" sorusunun cevabı
 * verilmemelidir; aksi hâlde 404 ile 403'ü karşılaştırarak kuyrukta
 * hangi kayıtların bulunduğu yoklanabilirdi.
 */
export class ReportNotFoundError extends Error {
  constructor(reportId: string) {
    super(`Şikâyet bulunamadı: ${reportId}`);
    this.name = 'ReportNotFoundError';
  }
}

/**
 * Şikâyet durumu geçersiz ya da geçiş yasak (400).
 *
 * **`reason` ALANI İKİ DURUMU AYIRIR:** `'UNKNOWN_STATUS'` = gövdedeki
 * değer bilinen dört durumdan biri değil (ya da metin bile değil);
 * `'FORBIDDEN_TRANSITION'` = değer geçerli ama MEVCUT durumdan oraya
 * geçilemez. İkisi `DOMAIN_ERROR_MAP`'te AYNI koda (`INVALID_REPORT_STATUS`)
 * eşlenir — ayrım yalnızca mesajda ve testte gereklidir; istemci kuyruğu
 * zaten sunucudan okur (`InvalidRaceDefinition` ile AYNI gerekçe).
 */
export class InvalidReportStatusError extends Error {
  constructor(
    readonly reason: 'UNKNOWN_STATUS' | 'FORBIDDEN_TRANSITION',
    /** `UNKNOWN_STATUS` ise ham değer; `FORBIDDEN_TRANSITION` ise `"open" → "resolved"` biçiminde geçiş. */
    readonly detail: string,
  ) {
    super(
      reason === 'UNKNOWN_STATUS'
        ? `Geçersiz şikâyet durumu: ${detail}`
        : `Bu durum geçişine izin verilmiyor: ${detail}`,
    );
    this.name = 'InvalidReportStatusError';
  }
}
