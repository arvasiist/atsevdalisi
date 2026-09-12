# domain/season

FAZ 7 — brief §69 SEZON SİSTEMİ: "Her sezon: yarış takvimi, leaderboard,
görevler, ödüller, özel turnuvalar içerebilir. Sezon reseti oyuncunun tüm
ilerlemesini silmemelidir. Sadece sezon skorları resetlenir."

- `season.ts` — `getSeasonStatus` (upcoming/active/ended, tarihlerden
  türetilir), `resetSeasonProgress`, `applySeasonRaceResult`,
  `calculateSeasonEndDate`.

Config: `online.config.json` (`season.durationDays`).

**Tasarım kararı — brief §69'un "silinmemeli" kuralı TİP SEVİYESİNDE
garanti edilir:** `PlayerSeasonState` (bkz. `packages/shared-types/src/
online.ts`) KASITLI olarak `Player`'dan tamamen ayrı, kendi başına küçük bir
arayüzdür. `resetSeasonProgress` bu arayüz DIŞINDA hiçbir şeye erişemez —
yani `Player.level`/`Player.money`/`Horse.*` gibi kalıcı alanları YANLIŞLIKLA
sıfırlaması derleme zamanında imkânsızdır (fonksiyon imzası onları hiç
parametre olarak almaz).

**Kapsam dışı:** "yarış takvimi/görevler/ödüller/özel turnuvalar" birer
İÇERİK sistemidir (zaten var olan `domain/tournament/`, gelecekteki bir görev
sistemi) — bu dosya sadece sezonun YAŞAM DÖNGÜSÜNÜ (durum + reset) yönetir.

Testler: `apps/api/test/domain/season/season.spec.ts`.
