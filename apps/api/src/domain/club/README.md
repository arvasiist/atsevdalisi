# domain/club

FAZ 7 — brief §44 KULÜP: "Kulüp adı, Logo, Üyeler, Kulüp seviyesi, Kulüp
puanı, Kulüp sıralaması, Kulüp sohbeti, Kulüp yarışları, Kulüp görevleri."

- `club.ts` — `createClub`, `joinClub`/`leaveClub`, `kickMember`,
  `assertHasClubPermission` (rol hiyerarşisi: `leader` > `officer` >
  `member`), `calculateClubLevel` (puan eşik tablosu —
  `domain/stable/stable.ts`'teki kapasite eşik deseniyle aynı), `addClubPoints`.
- `errors.ts` — `ClubFullError`, `AlreadyClubMemberError`,
  `NotClubMemberError`, `InsufficientClubPermissionError`,
  `ClubLeaderCannotLeaveError`.

Config: `online.config.json` (`club` bölümü: `maxMembers`, `levelThresholds`).

**Kapsam notu:** "Kulüp sıralaması" brief maddesi ayrı bir sistem DEĞİLDİR —
`domain/ranking/leaderboard.ts`'in `scope='club'` ile kullanılmasıdır.
**Kapsam dışı:** "Kulüp sohbeti" (gerçek zamanlı mesajlaşma altyapısı),
"Kulüp yarışları/görevleri" (içerik/görev sistemi — brief §45 GÖREV
SİSTEMİ'nin kulübe özel bir uzantısı) bu oturumun kapsamı dışında
bırakılmıştır; üyelik/seviye/puan çekirdeği bu içerik sistemlerinin ÜZERİNE
inşa edilebilecek şekilde tasarlanmıştır.

Testler: `apps/api/test/domain/club/club.spec.ts`.
