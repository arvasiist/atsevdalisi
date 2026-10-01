import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PasswordHasher } from '../../application/ports/password-hasher';
import { AppConfigService } from '../config/config.service';

const PREFIX = 'scrypt';
const PARTS = 6;
/** Node'un varsayılan `maxmem`i (32 MiB) yüksek `cost`ta yetmez; gereken bellek ~128·N·r bayttır. */
const MAXMEM_MULTIPLIER = 256;

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) => {
      if (error) {
        reject(error);
      } else {
        resolve(derived);
      }
    });
  });
}

/**
 * scrypt şifre özetleyici (30.09.2026). Yeni bağımlılık YOK — Node'un
 * yerleşik `crypto.scrypt`i (bellek-zor, parola türetimi için tasarlanmış).
 *
 * Saklanan biçim: `scrypt$N$r$p$tuz(base64)$özet(base64)`. Parametreler
 * özetle birlikte saklanır; `auth.config.json`daki maliyet artırılırsa eski
 * özetler kendi parametreleriyle doğrulanmaya devam eder.
 */
@Injectable()
export class ScryptPasswordHasher implements PasswordHasher {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async hash(password: string): Promise<string> {
    const { cost, blockSize, parallelization, keyLength, saltBytes } = this.config.auth.scrypt;
    const salt = randomBytes(saltBytes);
    const derived = await scryptAsync(password, salt, keyLength, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: MAXMEM_MULTIPLIER * cost * blockSize,
    });
    return [PREFIX, cost, blockSize, parallelization, salt.toString('base64'), derived.toString('base64')].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== PARTS || parts[0] !== PREFIX) {
      return false;
    }
    const [, costRaw, blockSizeRaw, parallelizationRaw, saltRaw, hashRaw] = parts as [string, string, string, string, string, string];
    const cost = Number(costRaw);
    const blockSize = Number(blockSizeRaw);
    const parallelization = Number(parallelizationRaw);
    if (![cost, blockSize, parallelization].every((value) => Number.isInteger(value) && value > 0)) {
      return false;
    }
    const expected = Buffer.from(hashRaw, 'base64');
    const derived = await scryptAsync(password, Buffer.from(saltRaw, 'base64'), expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: MAXMEM_MULTIPLIER * cost * blockSize,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }
}
