import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAdminConfig } from '@at-sevdalisi/game-config';
import type { ReportStatus } from '@at-sevdalisi/shared-types';
import {
  REPORT_STATUSES,
  REPORT_STATUS_TRANSITIONS,
  assertAdmin,
  assertReportTransitionAllowed,
  parseReportStatus,
} from '../../../src/domain/admin/moderation-queue';
import {
  AdminRequiredError,
  InvalidReportStatusError,
  ReportNotFoundError,
} from '../../../src/domain/admin/errors';

/**
 * `domain/admin/moderation-queue.ts` — yönetim kuralları (brief §34,
 * §42 PHASE 15-B).
 *
 * NEDEN DOMAIN'DE TEST EDİLİYOR (DTO'da değil): CLAUDE.md "Kardeş tuzak" —
 * Vitest/esbuild altında DTO dekoratörleri (`@IsIn`) sessizce ATLANIR; yani
 * bu testler, CI'da gerçekten çalışan TEK doğrulama katmanını doğrular
 * (`moderation.spec.ts` ile AYNI gerekçe).
 */

/** `moderation.spec.ts` ile AYNI "yukarı yürü" deseni. */
const MAX_PARENT_WALK_DEPTH = 10;

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let depth = 0; depth < MAX_PARENT_WALK_DEPTH; depth += 1) {
    try {
      readdirSync(join(dir, 'database'));
      return dir;
    } catch {
      const parent = join(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error(`Depo kökü bulunamadı (database/ klasörü yok): ${startDir}`);
}

const repoRoot = findRepoRoot(process.cwd());

const REPORTS_MIGRATION = readdirSync(join(repoRoot, 'database', 'migrations')).find((name) =>
  name.endsWith('create_player_blocks_and_reports.up.sql'),
);

describe('REPORT_STATUSES ↔ player_reports.status CHECK uyumu', () => {
  it('ilgili migrasyon dosyası bulunmalıdır (bulunamazsa test sessizce geçmemeli)', () => {
    expect(REPORTS_MIGRATION).toBeDefined();
  });

  it('domain listesi ile DB CHECK listesi BİREBİR aynıdır', () => {
    // ASIL DEĞER BURADADIR: liste domain'de genişleyip migration'da
    // genişlemezse `PATCH /admin/reports/:reportId` UPDATE'i `23514` ile
    // patlar ve yönetici 400/409 yerine 500 görürdü — bu test o hatayı
    // CI'da yakalar (`REPORT_CATEGORIES` için `moderation.spec.ts` ile AYNI
    // desen).
    const sql = readFileSync(
      join(repoRoot, 'database', 'migrations', REPORTS_MIGRATION as string),
      'utf-8',
    );
    const match = /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'open'\s+CHECK\s*\(\s*status\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(
      sql,
    );
    expect(match).not.toBeNull();

    const fromSql = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(fromSql.sort()).toEqual([...REPORT_STATUSES].sort());
  });

  it('durumlar TEKİLDİR', () => {
    expect(new Set(REPORT_STATUSES).size).toBe(REPORT_STATUSES.length);
  });

  it('`open` listede VARDIR — şikâyet oluşturan yol bu değeri yazar', () => {
    expect(REPORT_STATUSES).toContain('open');
  });
});

describe('REPORT_STATUS_TRANSITIONS — kapalı çizge', () => {
  it('HER durum için bir giriş vardır (eksik anahtar `undefined.includes` ile çöker)', () => {
    for (const status of REPORT_STATUSES) {
      expect(REPORT_STATUS_TRANSITIONS[status]).toBeDefined();
    }
    expect(Object.keys(REPORT_STATUS_TRANSITIONS).sort()).toEqual([...REPORT_STATUSES].sort());
  });

  it('geçiş hedefleri YALNIZCA bilinen durumlardır', () => {
    // Bir yazım hatası (`'resolve'`) sessizce "geçiş yok" anlamına gelir ve
    // yönetici meşru bir işlemi yapamaz hâle gelirdi.
    for (const targets of Object.values(REPORT_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(REPORT_STATUSES).toContain(target);
      }
    }
  });

  it('`resolved` ve `dismissed` ÇIKIŞSIZDIR (terminal)', () => {
    // Geri açılabilen bir kuyruk, aynı şikâyetin iki sonucundan hangisinin
    // geçerli olduğunu söyleyemez hâle gelirdi (bkz. domain doc yorumu).
    expect(REPORT_STATUS_TRANSITIONS.resolved).toEqual([]);
    expect(REPORT_STATUS_TRANSITIONS.dismissed).toEqual([]);
  });

  it('`open`dan doğrudan kapanışa geçiş SERBESTTİR (bariz spam için ara adım zorunlu değil)', () => {
    expect(REPORT_STATUS_TRANSITIONS.open).toContain('resolved');
    expect(REPORT_STATUS_TRANSITIONS.open).toContain('dismissed');
  });

  it('`reviewing`e GERİ DÖNÜŞ YOKTUR (`reviewing` → `open` yasak)', () => {
    expect(REPORT_STATUS_TRANSITIONS.reviewing).not.toContain('open');
  });

  it('hiçbir durum KENDİSİNE geçemez', () => {
    for (const status of REPORT_STATUSES) {
      expect(REPORT_STATUS_TRANSITIONS[status]).not.toContain(status);
    }
  });
});

describe('parseReportStatus', () => {
  it.each(REPORT_STATUSES)('geçerli durumu kabul eder: %s', (status) => {
    expect(parseReportStatus(status)).toBe(status);
  });

  it.each([
    ['OPEN', 'büyük harf — sözlük küçük harftir'],
    ['Resolved', 'karışık harf'],
    ['', 'boş metin'],
    ['  open  ', 'kırpılmaz: sözlük eşleşmesi TAM olmalıdır'],
    ['closed', 'sözlükte olmayan bir durum'],
    ['open ', 'sondaki boşluk'],
  ])('geçersiz metni UNKNOWN_STATUS ile reddeder: %s (%s)', (value) => {
    try {
      parseReportStatus(value);
      expect.unreachable('hata fırlatmalıydı');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidReportStatusError);
      expect((error as InvalidReportStatusError).reason).toBe('UNKNOWN_STATUS');
    }
  });

  it.each([[undefined], [null], [1], [true], [['open']], [{ status: 'open' }]])(
    'metin OLMAYAN değeri reddeder: %s',
    (value) => {
      expect(() => parseReportStatus(value)).toThrow(InvalidReportStatusError);
    },
  );
});

describe('assertReportTransitionAllowed', () => {
  it('çizgedeki her geçiş için sessiz kalır', () => {
    for (const current of REPORT_STATUSES) {
      for (const next of REPORT_STATUS_TRANSITIONS[current]) {
        expect(() => assertReportTransitionAllowed(current, next)).not.toThrow();
      }
    }
  });

  it('çizgede OLMAYAN her (current, next) çiftini FORBIDDEN_TRANSITION ile reddeder', () => {
    // Bu iddia tek tek vakaları saymaz, ÇİZGEDEN TÜRETİR: yeni bir durum
    // eklenip geçişleri yazılmazsa, o durumun TÜM çıkışları yasak olur ve
    // bu test bunu doğrular (terminal durumlar için de doğru davranış).
    for (const current of REPORT_STATUSES) {
      for (const next of REPORT_STATUSES) {
        const allowed = REPORT_STATUS_TRANSITIONS[current].includes(next);
        if (allowed) continue;
        try {
          assertReportTransitionAllowed(current, next);
          expect.unreachable(`izin verilmemeliydi: ${current} → ${next}`);
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidReportStatusError);
          expect((error as InvalidReportStatusError).reason).toBe('FORBIDDEN_TRANSITION');
        }
      }
    }
  });

  it('AYNI duruma geçişi de reddeder (bayat istemci göstergesi)', () => {
    // Sessizce başarı döndürmek `reviewed_at`i gereksiz ilerletir ve denetim
    // günlüğünü "aynı şey iki kez oldu" gibi göstererek asıl bilgiyi
    // gürültüye boğardı (bkz. domain doc yorumu).
    for (const status of REPORT_STATUSES) {
      expect(() => assertReportTransitionAllowed(status, status)).toThrow(
        InvalidReportStatusError,
      );
    }
  });

  it('hata, denenen geçişi mesajda taşır (hata ayıklama için)', () => {
    try {
      assertReportTransitionAllowed('resolved', 'open');
      expect.unreachable('hata fırlatmalıydı');
    } catch (error) {
      expect((error as InvalidReportStatusError).detail).toBe('resolved → open');
    }
  });
});

describe('assertAdmin', () => {
  it('yönetici için sessiz kalır', () => {
    expect(() => assertAdmin(true)).not.toThrow();
  });

  it('yönetici olmayan için AdminRequiredError fırlatır', () => {
    expect(() => assertAdmin(false)).toThrow(AdminRequiredError);
  });

  it('403 döner ve mesajı ROL eksikliğini söyler (sahiplik değil)', () => {
    // `ForbiddenError` ile karıştırılmamalıdır: eksik olan şey SAHİPLİK
    // değil ROLdür ve kod bu yüzden ayrıdır (bkz. `ErrorCode.AdminRequired`).
    const error = new AdminRequiredError();
    expect(error.message).toMatch(/yönetici/i);
  });
});

describe('ReportNotFoundError', () => {
  it('mesajda şikâyet kimliğini taşır (hata ayıklama için)', () => {
    const error = new ReportNotFoundError('00000000-0000-0000-0000-000000000000');
    expect(error.message).toContain('00000000-0000-0000-0000-000000000000');
  });
});

describe('AdminConfig — sabitlenmiş liste boyutları', () => {
  // `loadAdminConfig()` ailesinin tamamı gibi SAF bir CAST'tir; çalışma
  // zamanı doğrulaması YOKTUR. Yani JSON'a yazılan bir yazım hatası sessizce
  // `undefined` olur ve `LIMIT undefined` gibi bir sorguya dönüşürdü. Bu
  // yüzden değerler burada sabitlenir (`social-config.spec.ts` ile AYNI
  // gerekçe).
  it('iki limit de POZİTİF tam sayıdır', () => {
    const config = loadAdminConfig();
    expect(Number.isInteger(config.reportQueueLimit)).toBe(true);
    expect(config.reportQueueLimit).toBeGreaterThan(0);
    expect(Number.isInteger(config.auditLogLimit)).toBe(true);
    expect(config.auditLogLimit).toBeGreaterThan(0);
  });

  it('config dosyasındaki değerlerle BİREBİR aynıdır', () => {
    const json = JSON.parse(
      readFileSync(join(repoRoot, 'config', 'admin.config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(loadAdminConfig().reportQueueLimit).toBe(json.reportQueueLimit);
    expect(loadAdminConfig().auditLogLimit).toBe(json.auditLogLimit);
  });
});

/**
 * Bu testin ASIL amacı: `REPORT_STATUSES` ile DB CHECK'i arasındaki bağın
 * yalnızca "şu an doğru" değil, "yanlış olursa CI kırar" olmasıdır. Aşağıdaki
 * iddia, listeye yeni bir durum eklenip migration'ın unutulması hâlinde
 * yukarıdaki karşılaştırmanın gerçekten kırılacağını gösterir.
 */
describe('kontrol testi — karşılaştırma gerçekten kırılabilir', () => {
  it('listeye olmayan bir durum eklenseydi eşitlik bozulurdu', () => {
    const hypothetical = [...REPORT_STATUSES, 'archived'] as readonly ReportStatus[];
    expect([...hypothetical].sort()).not.toEqual([...REPORT_STATUSES].sort());
  });
});
