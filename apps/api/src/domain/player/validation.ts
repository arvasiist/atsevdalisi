/**
 * Kayıt kuralları (brief §7 Player, §31/§42 hesap oluşturma).
 *
 * KARAR (docs/ARCHITECTURE.md §10 madde 1 — proje sahibi tarafından
 * onaylandı): kimlik doğrulama **yalnızca Google/Apple Sign-In** ile
 * yapılır. `players` tablosunda şifre/e-posta hash'i TUTULMAZ — bkz.
 * `auth-provider.ts` ve `database/migrations/0011_create_player_auth_providers`.
 * Bu dosyadaki kurallar, sağlayıcıdan bağımsız oyun-içi profil alanlarını
 * (kullanıcı adı, görünen ad) doğrular.
 */

import { InvalidDisplayNameError, InvalidUsernameError } from './errors';

// FAZ 1 wiring: dışa aktarıldı — `api/player/dto/register-player.dto.ts`
// (class-validator `@Length`) AYNI sınırları burada tekrar sabit sayı
// olarak YAZMAK yerine buradan içe aktarır (tek doğruluk kaynağı,
// docs/CODING_CONVENTIONS.md #6/7 "magic number yasak").
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 30;

/** `players.username` (brief §7: UNIQUE, DB'de). Küçük harf, rakam, alt çizgi. */
export function validateUsername(username: string): void {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    throw new InvalidUsernameError(
      `Kullanıcı adı ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} karakter arasında olmalıdır.`,
    );
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new InvalidUsernameError('Kullanıcı adı yalnızca küçük harf, rakam ve alt çizgi (_) içerebilir.');
  }
}

/** `players.display_name` — oyun içinde görünen isim, daha esnek kurallar. */
export function validateDisplayName(displayName: string): void {
  const trimmed = displayName.trim();
  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH || trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new InvalidDisplayNameError(
      `Görünen ad ${DISPLAY_NAME_MIN_LENGTH}-${DISPLAY_NAME_MAX_LENGTH} karakter arasında olmalıdır.`,
    );
  }
}
