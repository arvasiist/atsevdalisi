# domain/player

Oyuncu hesabı (brief §7, §31, §42).

**Karar (bkz. `docs/ARCHITECTURE.md` §10 madde 1 — proje sahibi tarafından
onaylandı):** kimlik doğrulama yalnızca **Google/Apple Sign-In** ile
yapılır. `players` tablosunda şifre/e-posta hash'i TUTULMAZ; eşleme
`player_auth_providers` tablosunda tutulur (bkz.
`database/migrations/0011_create_player_auth_providers`).

- `player.ts` — `createNewPlayer`: yeni hesap için başlangıç durumu
  (level 1, xp 0, `config/economy.config.json` → `newPlayerStartingBalance`).
- `validation.ts` — `validateUsername`, `validateDisplayName` (oyun-içi
  profil alanları, sağlayıcıdan bağımsız).
- `auth-provider.ts` — `createPlayerAuthProviderLink`: Google/Apple'dan
  ZATEN doğrulanmış olarak gelen kimliği (`provider`, `providerUserId`,
  `email`) bir `player_auth_providers` kaydına dönüştürür. Gerçek ID token
  doğrulaması (imza kontrolü vb.) bir infrastructure detayıdır, domain'e
  sızdırılmaz.
- `errors.ts` — `InvalidUsernameError`, `InvalidDisplayNameError`, `InvalidAuthProviderTokenError`.

Testler: `apps/api/test/domain/player/player.spec.ts`.
