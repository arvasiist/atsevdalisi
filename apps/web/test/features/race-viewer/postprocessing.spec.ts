import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 08.10.2026 — `@react-three/postprocessing` 3.x'te `<SSAO>` normal tamponu
 * ister; `<EffectComposer enableNormalPass>` olmadan yarış ekranında
 * "Please enable the NormalPass in the EffectComposer in order to use SSAO"
 * hatası çıkıyordu (yalnızca 'ultra' kademede SSAO açık olduğu için geç
 * görüldü). SSAO kullanan her dosyanın EffectComposer'ı normal geçişi açmalı.
 */
const SRC = join(__dirname, '../../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

describe('post-processing', () => {
  it('SSAO kullanan her bileşen EffectComposer’da normal geçişi açar', () => {
    const importsSsao = /import\s*\{[^}]*\bSSAO\b[^}]*\}\s*from\s*'@react-three\/postprocessing'/;
    const users = sourceFiles(SRC).filter((file) => importsSsao.test(readFileSync(file, 'utf8')));
    expect(users.length).toBeGreaterThan(0);
    for (const file of users) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/<EffectComposer[^>]*enableNormalPass/);
    }
  });
});
