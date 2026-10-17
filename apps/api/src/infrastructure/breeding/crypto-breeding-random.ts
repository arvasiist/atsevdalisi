import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BreedingRandomSource } from '../../application/ports/breeding.repository';

const RESOLUTION = 1_000_000;

/**
 * Döllenme zarı + tay cinsiyeti (16.10.2026). Kriptografik kaynak: sonuç
 * istemcinin göndereceği hiçbir şeye bağlı değildir ve önceden hesaplanamaz.
 * E2E bu sağlayıcıyı sabit değerle EZER (`overrideProvider(BREEDING_RANDOM)`).
 */
@Injectable()
export class CryptoBreedingRandom implements BreedingRandomSource {
  next(): number {
    return randomInt(0, RESOLUTION) / RESOLUTION;
  }
}
