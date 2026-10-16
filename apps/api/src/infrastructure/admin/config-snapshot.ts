import { createHash } from 'node:crypto';
import * as gameConfig from '@at-sevdalisi/game-config';
import type { AdminConfigEntry } from '@at-sevdalisi/shared-types';

/**
 * ETKİN OYUN AYARLARI (02.10.2026, Faz 10) — `@at-sevdalisi/game-config`ın
 * dışa açtığı BÜTÜN `load*Config` yükleyicileri (liste elle tutulmaz: yeni
 * bir config eklenince kendiliğinden görünür). Config dosyalarında gizli
 * anahtar YOKTUR (gizliler ortam değişkenindedir, gitleaks bunu tarar).
 * Değerler salt okunur: config dağıtımla değişir, çalışma anında değil.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function configSnapshot(): AdminConfigEntry[] {
  return Object.entries(gameConfig as Record<string, unknown>)
    .filter(([name, value]) => /^load[A-Z]\w*Config$/.test(name) && typeof value === 'function')
    .map(([name, loader]) => {
      const values = (loader as () => unknown)();
      const shortName = name.replace(/^load/, '').replace(/Config$/, '');
      return {
        name: shortName.charAt(0).toLowerCase() + shortName.slice(1),
        sha256: createHash('sha256').update(canonical(values)).digest('hex'),
        values,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
