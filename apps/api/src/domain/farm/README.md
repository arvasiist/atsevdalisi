# domain/farm

Çiftlik (Farm) tesisleri — brief §32. **Ahır (`stable`) buraya DAHİL
DEĞİLDİR** — ahırın kendi kapasite/yükseltme modeli FAZ 1/2'den beri
`domain/stable`'da yaşar (`getStableCapacity`, `getNextStableUpgradeCost`);
bu domain sadece brief §32'nin listelediği DİĞER 7 tesisi ekler:

- Paddock (`paddock`)
- Antrenman pisti (`training_track`)
- Veteriner merkezi (`vet_center`)
- Nalbant alanı (`farrier_area`)
- Üreme/yetiştirme merkezi (`breeding_center`)
- Depo (`warehouse`)
- Personel binası (`staff_building`)

## İçerik

- `farm.ts`:
  - `getNextFacilityUpgradeCost` / `getMaxDefinedFacilityLevel` /
    `getFacilityBonusValue` — `domain/stable`'daki
    `getNextStableUpgradeCost` / `getStableCapacity` ile BİREBİR AYNI DESEN
    (config'te tanımlı en yakın-altı seviyeye geriye doğru düşme, en üst
    seviyede `MaxFacilityLevelReachedError`).
  - `buildFacility` (level 0 → 1) / `upgradeFacility` (level N → N+1) — saf
    fonksiyonlar, para düşme işlemini YAPMAZ (bunu application layer
    `domain/economy` ile birlikte yürütür).
  - `get*Multiplier` fonksiyonları (`getPaddockRecoveryMultiplier`,
    `getTrainingTrackInjuryRiskMultiplier`, `getVetCenterCostMultiplier`,
    `getFarrierAreaInjuryRiskMultiplier`,
    `getBreedingCenterHealthRiskMultiplier`,
    `getWarehouseFeedCostMultiplier`) — ham `bonusValue`'yu [1,2] artış veya
    [0.5,1] azaltma çarpanına çevirir (brief §32 "Bonuslar kontrollü
    olmalıdır" — üst/alt sınır `clamp` ile savunmaya alınmıştır, config zaten
    makul aralıkta tutulur).
  - `getMaxStaffCapacity` / `canHireMoreStaff` / `assertCanHireMoreStaff` —
    `staff_building` seviyesine göre TOPLAM personel kapasitesi (mutlak
    sayı) ve `domain/stable`'daki `assertCanAddHorseToStable` ile aynı
    desende bir guard.
- `errors.ts` — `MaxFacilityLevelReachedError`, `StaffCapacityExceededError`.

Config: `farm.config.json` (7 tesis tipi × seviye başına maliyet + bonus).

## Kapsam dışı (bilinçli olarak bırakılan wiring kararları)

`domain/staff`'taki `calculateStaffBonusMultiplier` için verilen gerekçenin
AYNISI burada da geçerlidir: her `get*Multiplier` fonksiyonunun HANGİ
formüle (hangi `training.config.json`/`care.config.json`/
`genetics.config.json` alanına) uygulanacağı bir wiring kararıdır ve mevcut,
zaten test edilmiş Training/Care/Genetics modüllerini değiştirmeden bu
teslimatın kapsamı dışında bırakılmıştır. Yorumlarda her fonksiyonun hangi
alana uygulanması ÖNERİLDİĞİ ayrıca belirtilmiştir.

`staff_building` istisnadır: `getMaxStaffCapacity`/`assertCanHireMoreStaff`
kendi başına tam bir guard'dır (personel domain'ini değiştirmeden,
`domain/staff.hireStaff` çağrılmadan ÖNCE application layer tarafından
çağrılması beklenir) — `domain/stable`'daki
`assertCanAddHorseToStable`/`canAddHorseToStable`'ın at ekleme akışına göre
konumlandığı yerin birebir aynısı.

## Tasarım notları

- **Tek bir bonus değeri, tesis başına**: brief §32 "Bonuslar kontrollü
  olmalıdır" ilkesi gereği her tesis tipi TEK bir `bonusValue` üretir
  (birden çok etkiye sahip bir tesis tasarlamak, dengeyi kontrol etmeyi
  zorlaştırır). `bonusValue`'nun birimi tesis tipine göre değişir (fraksiyon
  ya da mutlak kapasite) — bkz. `packages/game-config/src/types.ts`
  `FacilityLevelDefinition` yorumu.
- **Ahırla paralel sayı seçimi**: `staff_building` kapasiteleri (taban 3, +2/+5/+9
  → toplam 5/8/12) bilinçli olarak brief §32'nin kendi ahır kapasite
  örneğiyle (5/8/12) aynı sayılardır — oyuncunun zaten aşina olduğu bir
  ilerleme hissi.
- **Tesis kaydı `players`e değil ayrı bir tabloya bağlanır** (bkz.
  `database/migrations/0013`): bir oyuncunun aynı tesis tipinden birden
  fazla kaydı olmaması UNIQUE kısıtıyla veritabanı seviyesinde garanti
  edilir (`stable_level` gibi tek bir sütun yerine, 7 farklı tesis tipini
  ayrı satırlar olarak tutmak şema tarafında daha esnektir — yeni bir tesis
  tipi eklemek migration gerektirmez).

Testler: `apps/api/test/domain/farm/farm.spec.ts`.
