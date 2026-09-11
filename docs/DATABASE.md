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
