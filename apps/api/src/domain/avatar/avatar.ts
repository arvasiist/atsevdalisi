import {
  AVATAR_FIELDS,
  createSeededRandom,
  type AvatarAppearance,
  type AvatarField,
} from '@at-sevdalisi/shared-types';
import type { AvatarConfig } from '@at-sevdalisi/game-config';
import { InvalidAvatarError } from './errors';

/**
 * AVATAR KURALLARI (07.10.2026, brief §44/§49) — saf, framework'süz.
 *
 * - Her alan kataloğun bir listesine/sözlüğüne bağlıdır; değer o kataloğun
 *   bir KİMLİĞİ olmalıdır (renk de hex değil kimlikle seçilir).
 * - Varsayılan avatar oyuncu kimliğinden TÜRETİLİR (`createSeededRandom`,
 *   `Math.random()` YOK — CLAUDE.md kural 3): oyuncu hiç seçim yapmasa da
 *   her yerde aynı avatarla görünür.
 */
export const AVATAR_CATALOG_KEYS: Record<AvatarField, keyof AvatarConfig> = {
  skinTone: 'skinTones',
  hairStyle: 'hairStyles',
  hairColor: 'hairColors',
  socialOutfit: 'socialOutfits',
  outfitColor: 'outfitColors',
  shoes: 'shoes',
  hat: 'hats',
  accessory: 'accessories',
  raceOutfit: 'raceOutfits',
  silksPrimary: 'silkColors',
  silksSecondary: 'silkColors',
};

/** Alanın seçenek kimlikleri (config sırasıyla). */
export function avatarOptions(field: AvatarField, config: AvatarConfig): string[] {
  const entry = config[AVATAR_CATALOG_KEYS[field]];
  return Array.isArray(entry) ? [...entry] : Object.keys(entry);
}

export function deriveDefaultAvatar(playerId: string, config: AvatarConfig): AvatarAppearance {
  const appearance = {} as AvatarAppearance;
  for (const field of AVATAR_FIELDS) {
    const options = avatarOptions(field, config);
    const roll = createSeededRandom(`${playerId}:avatar:${field}`)();
    appearance[field] = options[Math.min(options.length - 1, Math.floor(roll * options.length))]!;
  }
  return appearance;
}

/**
 * İstemci gövdesini doğrular: nesne olmalı, TAM alan kümesi (eksik ya da
 * fazla alan yok), her değer katalogda. Hata mesajı ilk sorunlu alanı söyler.
 */
export function validateAvatarAppearance(raw: unknown, config: AvatarConfig): AvatarAppearance {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new InvalidAvatarError('Avatar bir nesne olmalı.');
  }
  const input = raw as Record<string, unknown>;
  const unknownKey = Object.keys(input).find((key) => !(AVATAR_FIELDS as readonly string[]).includes(key));
  if (unknownKey !== undefined) {
    throw new InvalidAvatarError(`Bilinmeyen avatar alanı: ${unknownKey.slice(0, 40)}`);
  }
  const appearance = {} as AvatarAppearance;
  for (const field of AVATAR_FIELDS) {
    const value = input[field];
    if (typeof value !== 'string' || !avatarOptions(field, config).includes(value)) {
      throw new InvalidAvatarError(`Geçersiz avatar seçimi: ${field}`);
    }
    appearance[field] = value;
  }
  return appearance;
}

/** Config bütünlüğü: her katalog boş değil, kimlikler tekil ve kalıba uygun, renkler hex. */
export function validateAvatarConfig(config: AvatarConfig): string[] {
  const problems: string[] = [];
  const idPattern = /^[a-z][a-z0-9-]{0,30}$/;
  const hexPattern = /^#[0-9a-f]{6}$/i;
  for (const key of new Set(Object.values(AVATAR_CATALOG_KEYS))) {
    const entry = config[key];
    const ids = Array.isArray(entry) ? entry : Object.keys(entry);
    if (ids.length === 0) problems.push(`${key}: boş katalog`);
    if (new Set(ids).size !== ids.length) problems.push(`${key}: tekrar eden kimlik`);
    for (const id of ids) if (!idPattern.test(id)) problems.push(`${key}: kalıp dışı kimlik ${id}`);
    if (!Array.isArray(entry)) {
      for (const [id, hex] of Object.entries(entry)) if (!hexPattern.test(hex)) problems.push(`${key}.${id}: hex değil`);
    }
  }
  return problems;
}
