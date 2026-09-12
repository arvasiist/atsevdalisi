# domain/player

Oyuncu hesabı (brief §7, §31, §42).

- `player.ts` — `createNewPlayer`: yeni hesap için başlangıç durumu
  (level 1, xp 0, `config/economy.config.json` → `newPlayerStartingBalance`).
- `validation.ts` — `validateUsername`, `validateDisplayName`,
  `checkPasswordStrength`/`assertPasswordIsStrong`, ve sağlayıcıdan
  bağımsız `PasswordHasher` arayüzü (gerçek hash algoritması —
  bcrypt/argon2 — bir infrastructure detayıdır, domain'e sızdırılmaz).
- `errors.ts` — `InvalidUsernameError`, `InvalidDisplayNameError`, `WeakPasswordError`.

**Açık karar (bkz. `docs/ARCHITECTURE.md` §10 madde 1):** kimlik doğrulama
SAĞLAYICISI (e-posta/şifre mi, OAuth mu, misafir girişi mi) proje sahibinin
onayını bekliyor; bu klasördeki kurallar sağlayıcıdan bağımsız olacak
şekilde tasarlandı, karar netleşince `players` tablosuna gerekli kolonlar
bir migration ile eklenecek.

Testler: `apps/api/test/domain/player/player.spec.ts`.
