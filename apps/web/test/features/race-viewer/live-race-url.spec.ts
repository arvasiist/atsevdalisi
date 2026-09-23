import { describe, expect, it } from 'vitest';
import { deriveSocketOrigin } from '../../../src/features/race-viewer/live-race-url';

describe('deriveSocketOrigin', () => {
  it('bir REST API URL\'sinden (/api/v1 önekiyle) soket origin\'ini (önek OLMADAN) çıkarır', () => {
    expect(deriveSocketOrigin('http://localhost:3000/api/v1')).toBe('http://localhost:3000');
  });

  it('bir prod HTTPS URL\'si için de doğru origin\'i döner', () => {
    expect(deriveSocketOrigin('https://api.atsevdalisi.com/api/v1')).toBe('https://api.atsevdalisi.com');
  });

  it('zaten bir önek İÇERMEYEN bir URL için de aynı origin\'i döner (idempotent)', () => {
    expect(deriveSocketOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('portlu bir origin\'i KORUR', () => {
    expect(deriveSocketOrigin('http://127.0.0.1:4000/api/v1')).toBe('http://127.0.0.1:4000');
  });

  it('geçersiz/parse edilemeyen bir girdi için girdiyi OLDUĞU GİBİ geri döner (savunmacı son çare)', () => {
    expect(deriveSocketOrigin('gecersiz bir url degil')).toBe('gecersiz bir url degil');
    expect(deriveSocketOrigin('')).toBe('');
  });
});
