// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AvatarAppearance } from '@at-sevdalisi/shared-types';
import {
  AVATAR_FIELDS,
  AVATAR_FIELD_LABELS,
  avatarColors,
  avatarOptions,
  avatarSwatch,
  optionLabel,
} from '../../../src/features/avatar/avatar-catalog';
import { AvatarPortrait } from '../../../src/features/avatar/AvatarPortrait';

const firstOf = (): AvatarAppearance =>
  Object.fromEntries(AVATAR_FIELDS.map((field) => [field, avatarOptions(field)[0]!])) as AvatarAppearance;

describe('avatar kataloğu (istemci)', () => {
  afterEach(() => cleanup());

  it('her alanın etiketi ve en az bir seçeneği var; her seçeneğin Türkçe adı var', () => {
    for (const field of AVATAR_FIELDS) {
      expect(AVATAR_FIELD_LABELS[field].length).toBeGreaterThan(0);
      const options = avatarOptions(field);
      expect(options.length).toBeGreaterThan(0);
      // Adı olmayan seçenek ekranda ham kimlik olarak görünürdü.
      for (const option of options) expect(optionLabel(option)).not.toBe(option);
    }
  });

  it('renk alanları hex döner, diğerleri null; bilinmeyen kimlik çökmez (nötr gri)', () => {
    expect(avatarSwatch('hairColor', avatarOptions('hairColor')[0]!)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(avatarSwatch('hairStyle', avatarOptions('hairStyle')[0]!)).toBeNull();
    expect(avatarColors({ ...firstOf(), hairColor: 'kaldirilmis' }).hair).toBe('#808080');
  });

  it('portre erişilebilir adla çizilir; gözlük ve şapka seçimi SVG\'ye yansır', () => {
    const { container } = render(
      <AvatarPortrait appearance={{ ...firstOf(), accessory: 'glasses', hat: 'fedora' }} label="Ayşe avatarı" />,
    );
    expect(screen.getByRole('img', { name: 'Ayşe avatarı' })).toBeTruthy();
    expect(container.querySelectorAll('circle[r="5"]').length).toBe(2);
    expect(container.querySelector('rect[width="56"]')).not.toBeNull();
  });
});
