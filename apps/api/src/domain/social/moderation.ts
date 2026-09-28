/**
 * BLOCK / REPORT domain kuralları (brief §33, §42 PHASE 15) — SAF domain
 * (framework'süz TS, `CLAUDE.md` "KATMAN YÖNÜ TEK YÖNLÜ").
 *
 * **NEDEN DOMAIN'DE (DTO/controller'da değil):** `validation.ts` ile AYNI
 * gerekçe — Vitest/esbuild `design:paramtypes` üretmediği için DTO
 * dekoratörleri (`@IsIn`, `@IsString`, `@MaxLength`) sessizce ATLANIR.
 * Gerçek doğrulama burada, DTO'dan BAĞIMSIZ yapılır.
 */

import type { ReportCategory } from '@at-sevdalisi/shared-types';
import {
  CannotBlockSelfError,
  CannotReportSelfError,
  InvalidReportCategoryError,
  InvalidReportReasonError,
  PlayerBlockedError,
} from './errors';

/**
 * Geçerli şikâyet kategorileri — `player_reports.category` CHECK kısıtıyla
 * (migration 0040) BİREBİR aynı küme.
 *
 * `ALLOWED_TACTICAL_STYLES` (`domain/race/lobby.ts`) ile AYNI disiplin:
 * **DB kısıtı domain listesini YANSITIR, tersi değil.** Liste burada
 * genişleyip migration'da genişlemezse INSERT `23514` ile patlar ve
 * istemci 500 alırdı; uyuşmazlığı `moderation.spec.ts` yakalar.
 *
 * `shared-types`'taki `ReportCategory` birleşiminden TÜRETİLMEZ (yalnızca
 * `satisfies` ile bağlanır): `domain/` katmanı API sözleşmesine değil,
 * VERİTABANI kısıtına bağlıdır. Sözleşme değişip kısıt değişmezse hata
 * yine burada, doğru yerde çıkar.
 */
export const REPORT_CATEGORIES = [
  'spam',
  'harassment',
  'cheating',
  'offensive_name',
  'other',
] as const satisfies readonly ReportCategory[];

/**
 * İstemciden gelen ham değeri `ReportCategory`e çevirir; başka her şeyde
 * `InvalidReportCategoryError` fırlatır.
 *
 * `typeof value === 'string'` kontrolü ŞART — `parseFriendshipAction` ile
 * AYNI gerekçe: `unknown` üzerinde `includes` çağrısı daraltılmadan
 * yapılırsa tip güvenliği kaybolur.
 */
export function parseReportCategory(value: unknown): ReportCategory {
  if (typeof value !== 'string' || !(REPORT_CATEGORIES as readonly string[]).includes(value)) {
    throw new InvalidReportCategoryError(value);
  }
  return value as ReportCategory;
}

/**
 * Şikâyet gerekçesini normalize eder (kırpar) ve doğrular.
 *
 * **`null` DÖNEBİLİR — ve bu bilinçlidir:** gerekçe İSTEĞE BAĞLIDIR
 * (brief §33 yalnızca "REPORT USER" der). Boş/yalnızca boşluk bir metin
 * `null`a indirgenir; boş dize yazmak, "gerekçe yok" ile "boş gerekçe
 * yazıldı" arasında veritabanında ayırt edilemeyen iki durum yaratırdı.
 *
 * **Uzunluk ÖLÇÜMÜ `normalizeMessageBody` İLE AYNI:** `[...str].length`
 * kod noktası sayar (JS'in UTF-16 `length`i bir emojiyi 2 sayardı).
 */
export function normalizeReportReason(raw: unknown, maxLength: number): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new InvalidReportReasonError('NOT_A_STRING', maxLength);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if ([...trimmed].length > maxLength) {
    throw new InvalidReportReasonError('TOO_LONG', maxLength);
  }
  return trimmed;
}

/** Kendini engelleme kontrolü — `player_blocks_not_self` CHECK'inin domain karşılığı. */
export function assertNotSelfBlock(blockerId: string, blockedId: string): void {
  if (blockerId === blockedId) {
    throw new CannotBlockSelfError();
  }
}

/** Kendini şikâyet kontrolü — `player_reports_not_self` CHECK'inin domain karşılığı. */
export function assertNotSelfReport(reporterId: string, reportedId: string): void {
  if (reporterId === reportedId) {
    throw new CannotReportSelfError();
  }
}

/**
 * Engelleme kapısı — brief §33'ün zorunlu kıldığı üç yolun (mesaj, hediye,
 * yarış daveti) ve arkadaşlık isteğinin ORTAK kontrolü.
 *
 * **NEDEN TEK FONKSİYON:** kural tek bir cümledir ("bu iki oyuncu
 * arasında engel varsa yazma yolu kapalıdır") ve dört ayrı yerde
 * kopyalanırsa biri güncellenmeden kalır. Burada `blocked` bir BOOLEAN'dır,
 * yani kontrolün KENDİSİ (sorgu) çağıranın işidir: `domain/` veritabanı
 * bilmez, yalnızca "bu durumda ne olur" sorusunu cevaplar.
 *
 * **YÖN ÖNEMSİZDİR:** çağıran `isBlockedBetween`in sonucunu geçer — iki
 * yönden biri yeterlidir. A, B'yi engellediyse B'nin A'ya yazamaması
 * gerekir; B, A'yı engellediyse de A'nın B'ye yazamaması gerekir.
 */
export function assertNoBlock(blocked: boolean): void {
  if (blocked) {
    throw new PlayerBlockedError();
  }
}
