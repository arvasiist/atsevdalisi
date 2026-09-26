# DATABASE.md — Veritabanı Şeması

> Kaynak: `docs/PROJECT_BRIEF.md` §7 (Veri Modeli), §55 (Database Kuralları),
> §77 (Database Indexleri). Migration dosyaları: `database/migrations/`.

## 1. Genel kurallar

- Veritabanı motoru **PostgreSQL**'dir (brief'te değişmedi).
- Tüm birincil anahtarlar `UUID` (`gen_random_uuid()`, `pgcrypto` uzantısı ile).
- Para (`money`, `gems`, `price`, `entry_fee`, `prize_pool`, `salary`, `fee`)
  alanları `BIGINT` olarak tutulur (kuruş/cent bazlı hesaplama ileride
  gerekirse kolayca eklenebilir); tümü `>= 0` kısıtı ile korunur — brief
  §31 "negatif para oluşmamalı" kuralı doğrudan veritabanı seviyesinde
  uygulanır.
- 0-100 aralığındaki tüm oransal stat/durum alanları (`health`, `fitness`,
  `fatigue`, `energy`, `morale`, stat'lar vb.) `CHECK (... BETWEEN 0 AND 100)`
  ile sınırlandırılır.
- Para veya mülkiyet değiştiren her işlem PostgreSQL transaction'ı içinde,
  gerektiğinde `SELECT ... FOR UPDATE` ile çalıştırılır (brief §55).
- `updated_at` alanları bir trigger (`set_updated_at()`, migration 0010)
  ile otomatik güncellenir; uygulama kodu bunu manuel yapmak zorunda değildir.

## 2. Migration listesi

| # | Dosya | İçerik |
|---|---|---|
| 0001 | `create_extensions_and_players` | `pgcrypto` uzantısı, `players` tablosu |
| 0002 | `create_tracks_and_horses` | `tracks`, `horses` |
| 0003 | `create_horse_stat_tables` | `horse_stats`, `horse_surface_stats`, `horse_distance_stats`, `horse_health` |
| 0004 | `create_jockeys` | `jockeys` |
| 0005 | `create_training_sessions` | `training_sessions` |
| 0006 | `create_races_and_entries` | `races`, `race_entries`, `race_entry_segments` |
| 0007 | `create_market_listings` | `market_listings` |
| 0008 | `create_breeding_and_pedigree` | `breeding_pairs`, `pedigrees` |
| 0009 | `create_indexes` | brief §77'deki tüm indexler |
| 0010 | `add_updated_at_triggers` | Otomatik `updated_at` trigger'ı |
| 0011 | `create_player_auth_providers` | `player_auth_providers` (Google/Apple Sign-In eşlemesi — proje sahibinin kararı, bkz. `ARCHITECTURE.md` §10 madde 1) |
| 0012 | `create_staff_and_stable_level` | `staff` (brief §33 Personel, jokey hariç) + `players.stable_level` (FAZ 1'de domain/stable'ın parametre olarak beklediği ama hiçbir migration'ın eklemediği sütun — FAZ 2 ahır yükseltmesi için burada tamamlandı) |
| 0013 | `create_facilities` | `facilities` (brief §32 Çiftlik tesisleri — Paddock, Antrenman pisti, Veteriner merkezi, Nalbant alanı, Üreme merkezi, Depo, Personel binası; ahır hariç, bkz. `domain/farm/README.md`) |
| 0014 | `add_race_segment_faz5_fields` | `race_entry_segments.blocked`/`jockey_decision` (brief §21 geçiş/bloklanma, §60 jokey AI kararları — bkz. `domain/race/overtaking.ts`, `domain/race/jockey-decisions.ts`) |
| 0015 | `create_horse_care_log` | `horse_care_log` — bakım eylemi soğuma (cooldown) takibi (brief §11, `domain/care/care.ts`) |
| 0016 | `add_last_daily_reward_claimed_at` | `players.last_daily_reward_claimed_at` — günlük ödül cooldown'u (brief §37) |
| 0017 | `add_market_listings_indexes` | `market_listings` tarama (`WHERE`/`ORDER BY`) index'leri — At Pazarı listeleme endpoint'leri için |
| 0018 | `add_pvp_matchmaking` | `players.rating` + `matchmaking_tickets` + `pvp_matches` (brief §41 online mimari, §43 Elo) |
| 0019 | `add_economy_ledger` | `economy_transactions` — kalıcı para hareketleri defteri; cüzdan mutasyonuyla AYNI transaction'da yazılır (brief §65) |
| 0020 | `add_idempotency_keys` | `idempotency_keys` — Redis TTL'inin ötesinde KALICI idempotency rezervasyonu (`INSERT ... ON CONFLICT DO NOTHING`) |
| 0021 | `add_race_versioning` | `races`'a `engine_version`/`ruleset_version`/`config_version` — brief §58'in dörtlüsünün (seed + config + snapshot + taktik) config ayağı |
| 0022 | `document_unwired_horse_compatibility_stats` | `horse_surface_stats`/`horse_distance_stats`'ın o an BAĞLANMAMIŞ olduğunu belgeleyen `COMMENT`'ler (bkz. `entrant-snapshot.ts` `UNMODELED_SNAPSHOT_FIELDS`) |
| 0023 | `add_market_listing_unique_active_index` | "Bir atın en fazla bir AKTİF ilanı olabilir" kısmi tekil index'i (Bulgu D1 — yalnızca application katmanında uygulanıyordu) |
| 0024 | `add_weather_config_versioning` | `config/weather.config.json` için sürüm bütünlüğü — 0021'in `race.config.json` için kapattığı riskin AYNISI (Bulgu R1) |
| 0025 | `add_race_entry_bot_support` | `race_entries.bot_label` + `horse_id`/`bot_label` XOR CHECK kısıtı — botların tam alan (full-field) replay'i (Bulgu R2) |
| 0026 | `wire_horse_surface_and_distance_stats` | `horse_surface_stats`/`horse_distance_stats`'ın Track Fit hesabına bağlanması (R3 — `domain/race/track-fit.ts`) |
| 0027 | `backfill_horse_weight_kg` | `horses.weight_kg` backfill'i (R4 — Carried Weight, `domain/horse/weight.ts`) |
| 0028 | `create_horse_equipment` | `horse_equipment` — at ekipman envanteri (brief §14 PHASE 14, §17 PHASE 17) |
| 0029 | `add_race_segment_telemetry_fields` | `race_entry_segments.fatigue_level`/`pace_score` — yarış İÇİ canlı yorgunluk ve tempo telemetrisi (mevcut `fatigue` sütunu statik/yarış öncesi değeri taşımaya DEVAM eder) |

Her migration'ın bir `.up.sql` (uygula) ve `.down.sql` (geri al) karşılığı
vardır. Çalıştırma aracı olarak `node-pg-migrate` veya eşdeğeri önerilir
(`apps/api/package.json` içinde tanımlıdır); proje sahibi tercih ederse
Prisma/Knex gibi bir ORM'e de kolayca taşınabilir çünkü şema saf SQL'dir.

> FAZ 7 (Online) aşamasında eklenecek olan `leaderboards` ve `clubs`
> tablolarının migration'ları o faza gelindiğinde yazılacaktır (brief'in
> "önce core, sonra online" sıralamasına uygun olarak, bkz. §73).

## 3. Varlıklar arası ilişkiler (özet)

```text
players 1───∞ horses (owner_id)
players 1───∞ market_listings (seller_id)
players 1───∞ jockeys (owner_id, opsiyonel — NPC jokeyler owner_id=NULL)
players 1───∞ player_auth_providers (Google/Apple ile birden fazla giriş yöntemi bağlanabilir)
players 1───∞ facilities (owner_id — oyuncu başına tesis tipi başına en fazla 1 kayıt, UNIQUE(owner_id, type))

horses 1───1 horse_stats
horses 1───1 horse_surface_stats
horses 1───1 horse_distance_stats
horses 1───1 horse_health
horses 1───1 pedigrees
horses 1───∞ training_sessions
horses ∞───1 horses (sire_id, dam_id — kendine referans, soy ağacı)

tracks 1───∞ races

races 1───∞ race_entries
race_entries ∞───1 horses
race_entries ∞───1 jockeys
race_entries 1───∞ race_entry_segments

horses(mare) + horses(stallion) ───∞ breeding_pairs
```

## 4. Tasarım notları ve brief'e eklenen noktalar

1. **`tracks` tablosu eklendi.** Brief'te `Race.track_id` alanı geçiyor
   ancak ayrı bir `Track` varlığı tanımlanmamıştı. Referans bütünlüğü için
   minimal bir `tracks` tablosu eklendi (id, name, location, length_m,
   turn_count, track_width_m). İleride pist-özel bonuslar/rekorlar bu
   tabloya eklenebilir.
2. **`race_entry_segments` tablosu eklendi.** Brief §19 (segment tabanlı
   yarış), §24 (race telemetry) ve §57'de (`segment_data` alanı) geçen
   segment verisi, `race_entries.segment_data` gibi tek bir JSON alanına
   sıkıştırmak yerine ayrı bir tabloya normalize edildi; böylece belirli
   bir mesafedeki tüm atların telemetrisini sorgulamak (örn. balance testi
   için, brief §83) kolaylaşır.
3. **`horse_snapshot` (JSONB) `race_entries` içine eklendi.** Brief §56
   RaceSnapshot yapısını birebir karşılar: yarış başladığında atın o anki
   tüm değerleri JSON olarak donmuş şekilde saklanır, böylece yarış
   sırasında oyuncu atın statını değiştirse bile sonucu etkileyemez.
4. **`stat_gain` (JSONB) `training_sessions` içine eklendi.** Antrenman
   türüne göre hangi stat'ların ne kadar etkilendiği esnek bir yapıda
   saklanır; bu, config'deki ağırlıklar değiştikçe şema değişikliği
   gerektirmez (brief §52 config prensibiyle uyumlu).
5. **Leaderboard ve Club tabloları bilinçli olarak bu migration setine
   dahil edilmedi** çünkü brief'in kendi geliştirme sırası (§73) bunları
   FAZ 7'ye (Online) yerleştiriyor; FAZ 0'da sadece MVP + temel veri modeli
   (brief §7) kapsanmıştır.

## 5. Örnek veri (seed)

`database/seeds/001_dev_seed.sql`, referans UI konseptindeki oyuncuyu
("AtSevdalısı", seviye 12, 125.450 para, 320 gem) ve 5 atı (Şimşek, Kara
Yel, Fırtına, Bulut, Prens) birebir eşleşen değerlerle oluşturur; bu sayede
frontend geliştirilirken gerçek görünüme yakın veriyle çalışılabilir.
**Sadece geliştirme ortamında çalıştırılmalıdır.**
