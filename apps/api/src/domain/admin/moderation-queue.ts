import type { ReportStatus } from '@at-sevdalisi/shared-types';
import { AdminRequiredError, InvalidReportStatusError } from './errors';

/**
 * `domain/admin/moderation-queue.ts` — yönetim kuralları (brief §34,
 * §42 PHASE 15-B). Framework'süz saf TS (CLAUDE.md kural 4).
 *
 * **NEDEN DOMAIN'DE, DTO'DA DEĞİL:** CLAUDE.md "Kardeş tuzak" — Vitest/
 * esbuild altında DTO dekoratörleri (`@IsIn`, `@IsUUID`) sessizce
 * ATLANIR. Yani burada yazılan kontrol, CI'da gerçekten çalışan TEK
 * doğrulama katmanıdır (`domain/social/moderation.ts` ile AYNI gerekçe).
 */

/**
 * Şikâyet durumunun GEÇERLİ kümesi — `player_reports.status` CHECK'i ile
 * (`migration 0040`) BİREBİR aynı olmak zorundadır. Uyuşmazlığı yakalayan
 * şey `moderation-queue.spec.ts`tir: migration dosyasını OKUYARAK
 * karşılaştırır (`REPORT_CATEGORIES` için `moderation.spec.ts` ile AYNI
 * desen — liste domain'de genişleyip migration'da genişlemezse UPDATE
 * `23514` ile patlar ve istemci 500 görürdü).
 */
export const REPORT_STATUSES = [
  'open',
  'reviewing',
  'resolved',
  'dismissed',
] as const satisfies readonly ReportStatus[];

/**
 * Durum GEÇİŞLERİ — kapalı bir çizge (DAG), bilinçli olarak DÖNGÜSÜZ.
 *
 * **`open` → `reviewing` → {`resolved`, `dismissed`}** doğal akıştır.
 * `open`dan doğrudan `resolved`a geçiş de SERBESTTİR: bir yönetici
 * bariz bir spam kaydını "inceliyorum"a çekmek zorunda kalmamalıdır.
 *
 * **`resolved` VE `dismissed` ÇIKIŞSIZDIR (terminal).** Bu, brief §34'ün
 * "kontrollü şekilde" ifadesinin somutlaşmasıdır: geri açılabilen bir
 * kuyruk, aynı şikâyetin iki farklı sonucu hakkında hangisinin geçerli
 * olduğunu söyleyemez hâle gelirdi — üstelik her geri açma, denetim
 * günlüğünde de geri alınamaz bir iz bırakır. Yanlış kapatılan bir
 * şikâyet için doğru yol, YENİ bir şikâyet kaydıdır (şikâyet zaten
 * idempotent değildir — `ReportPlayerUseCase` doc yorumu).
 *
 * **`reviewing` → `open` DE YASAKTIR:** "kuyruğa geri koydum" ile
 * "hiç dokunulmamış" durumları ayırt edilemez hâle gelirdi; oysa
 * `reviewed_by`/`reviewed_at` tam olarak "dokunuldu" bilgisini taşır.
 */
export const REPORT_STATUS_TRANSITIONS: Readonly<Record<ReportStatus, readonly ReportStatus[]>> = {
  open: ['reviewing', 'resolved', 'dismissed'],
  reviewing: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

/**
 * Yönetici olmayan çağıranı reddeder.
 *
 * **`boolean` ALIR, repository ALMAZ:** domain katmanı hiçbir şey
 * OKUMAZ (framework'süz ve yan etkisiz kalmalıdır); rol sorgusu
 * use-case'in işidir, karar buradadır (`assertNoBlock` ile AYNI desen).
 */
export function assertAdmin(isAdmin: boolean): void {
  if (!isAdmin) {
    throw new AdminRequiredError();
  }
}

/**
 * Gövdedeki ham durumu daraltır.
 *
 * **KIRPMA YOKTUR** — `parseReportCategory` ile AYNI kural: sözlük
 * eşleşmesi TAM olmalıdır. `' resolved '` kabul edilseydi, aynı hatanın
 * istemci tarafında sessizce düzeltilebilir hâle gelmesi, sunucunun
 * sözleşmesini "yaklaşık" hâle getirirdi.
 */
export function parseReportStatus(value: unknown): ReportStatus {
  if (typeof value !== 'string' || !(REPORT_STATUSES as readonly string[]).includes(value)) {
    throw new InvalidReportStatusError('UNKNOWN_STATUS', String(value));
  }
  return value as ReportStatus;
}

/**
 * `current` durumundan `next` durumuna geçilebilir mi?
 *
 * **AYNI DURUMA GEÇİŞ DE YASAKTIR** (`current === next`): istemci
 * zaten `resolved` olan bir kaydı tekrar `resolved` yapmaya çalışıyorsa
 * bu bir İDEMPOTENT çağrı değil, BAYAT bir ekrandan geldiğinin
 * işaretidir. Sessizce başarı döndürmek, `reviewed_at`i gereksiz yere
 * ilerletir ve denetim günlüğünü "aynı şey iki kez oldu" gibi
 * göstererek asıl bilgiyi gürültüye boğardı.
 */
export function assertReportTransitionAllowed(current: ReportStatus, next: ReportStatus): void {
  const allowed = REPORT_STATUS_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw new InvalidReportStatusError('FORBIDDEN_TRANSITION', `${current} → ${next}`);
  }
}
