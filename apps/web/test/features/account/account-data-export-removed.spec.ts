import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 16.10.2026 — brief §5 (sahibinin kararı, 08.10.2026'da uygulandı): hesap
 * ekranında "Verilerimi indir" YOKTUR ve web hiçbir yerden dışa aktarma ucunu
 * çağırmaz. Uç (`GET /account/export`, KVKK talebi destekle karşılanır) ve hesap
 * SİLME duruyor — bu test yalnızca istemci yüzeyinin kalktığını kilitler.
 */
const SRC = resolve(__dirname, '../../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

describe('hesap ekranı — "Verilerimi indir" kaldırıldı', () => {
  const files = sourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

  it('hiçbir ekran "Verilerimi indir" yazmaz ve dışa aktarma ucunu çağırmaz', () => {
    for (const { path, text } of files) {
      expect(text, path).not.toMatch(/Verilerimi indir/i);
      expect(text, path).not.toMatch(/account\/export/);
    }
  });

  it('hesap silme hâlâ hesap ekranındadır (gizlilik hakkı kaldırılmadı)', () => {
    const account = readFileSync(join(SRC, 'app', 'account', 'page.tsx'), 'utf8');
    expect(account).toMatch(/<DeleteAccountPanel/);
  });
});
