# domain/jockey

Jokey sistemi (brief §13, docs/ALGORITHMS.md §12 jokey-at uyumu).

- `jockey.ts` — `calculateJockeySkillComposite` (jockeys tablosundaki tekil
  yetenek alanlarının `RaceEntrantSnapshot.jockeySkillComposite` için tek
  bir puana indirgenmesi — bu alan FAZ 1'de zaten `base-ability.ts`
  tarafından beklenen ama üreticisi olmayan bir girdiydi), `calculateJockeyHorseCompatibility`
  (temperament/style/experience/history bileşenleri), `hireJockey`/
  `assertJockeyAvailableForHire`.
- `errors.ts` — `JockeyAlreadyOwnedError`.

Config: `jockey.config.json`.

**Kapsam dışı:** `calculateJockeySkillComposite`'in gerçekten
`domain/race/race-engine.ts`'e bağlanması (wiring) bu teslimatın kapsamı
dışındadır — mevcut, zaten test edilmiş Race Engine'i değiştirmeden,
onun ihtiyaç duyduğu girdiyi üretecek fonksiyonu hazırlamakla
sınırlandırılmıştır; bağlama NestJS use-case katmanında yapılacaktır.

Testler: `apps/api/test/domain/jockey/jockey.spec.ts`.
