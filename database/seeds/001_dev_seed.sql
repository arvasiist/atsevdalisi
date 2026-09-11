-- Geliştirme ortamı için örnek veri seti.
-- Referans UI konseptindeki oyuncu ve atlarla birebir eşleşir (bkz. docs/GAME_DESIGN.md).
-- ÜRETİM ORTAMINDA ÇALIŞTIRILMAMALIDIR.

BEGIN;

INSERT INTO players (id, username, display_name, avatar_id, level, xp, money, gems, reputation)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'atsevdalisi',
  'AtSevdalısı',
  'avatar_default_01',
  12,
  2450,
  125450,
  320,
  0
);

INSERT INTO tracks (id, name, location, length_m, turn_count, track_width_m)
VALUES (
  '00000000-0000-0000-0000-0000000000t1',
  'İstanbul Hipodromu',
  'İstanbul',
  1600,
  2,
  24.0
);

-- Ahırdaki 5 at (referans görseldeki isimlerle birebir)
INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, level, xp, quality, potential, health, fitness, fatigue, energy, morale, weight_kg, status)
VALUES
  ('00000000-0000-0000-0000-000000000h01', '00000000-0000-0000-0000-000000000001', 'Şimşek',   'stallion', 'Safkan İngiliz', '2022-03-14', 4, 1200, 82, 90, 98, 88, 24, 76, 91, 480.5, 'active'),
  ('00000000-0000-0000-0000-000000000h02', '00000000-0000-0000-0000-000000000001', 'Kara Yel', 'stallion', 'Safkan Arap',    '2023-02-02', 3,  640, 74, 85, 95, 80, 30, 70, 85, 465.0, 'active'),
  ('00000000-0000-0000-0000-000000000h03', '00000000-0000-0000-0000-000000000001', 'Fırtına',  'mare',     'Safkan İngiliz', '2023-05-20', 2,  310, 68, 80, 97, 72, 18, 82, 88, 452.0, 'active'),
  ('00000000-0000-0000-0000-000000000h04', '00000000-0000-0000-0000-000000000001', 'Bulut',    'gelding',  'Anadolu Atı',    '2023-07-11', 2,  280, 60, 75, 94, 65, 22, 74, 80, 470.0, 'active'),
  ('00000000-0000-0000-0000-000000000h05', '00000000-0000-0000-0000-000000000001', 'Prens',    'stallion', 'Safkan Arap',    '2024-01-30', 1,   40, 55, 88, 100, 40, 5, 90, 95, 410.0, 'active');

INSERT INTO horse_stats (horse_id, speed, acceleration, stamina, strength, agility, balance, start_speed, sprint, cornering)
VALUES
  ('00000000-0000-0000-0000-000000000h01', 87, 83, 81, 78, 80, 82, 85, 92, 79),
  ('00000000-0000-0000-0000-000000000h02', 80, 79, 78, 74, 76, 77, 78, 84, 75),
  ('00000000-0000-0000-0000-000000000h03', 76, 74, 72, 70, 78, 75, 72, 79, 74),
  ('00000000-0000-0000-0000-000000000h04', 71, 70, 75, 72, 68, 70, 69, 72, 68),
  ('00000000-0000-0000-0000-000000000h05', 68, 72, 60, 62, 74, 70, 70, 75, 66);

INSERT INTO horse_surface_stats (horse_id, grass, dirt, wet, heavy, dry, mud)
SELECT id, 80, 60, 55, 50, 75, 45 FROM horses WHERE owner_id = '00000000-0000-0000-0000-000000000001';

INSERT INTO horse_distance_stats (horse_id, short_distance, middle_distance, long_distance)
SELECT id, 65, 82, 60 FROM horses WHERE owner_id = '00000000-0000-0000-0000-000000000001';

INSERT INTO horse_health (horse_id, health, injury_risk, recovery_rate, muscle_condition, joint_condition, respiratory_condition, weight_condition)
SELECT id, health, 8, 70, 90, 88, 92, 85 FROM horses WHERE owner_id = '00000000-0000-0000-0000-000000000001';

INSERT INTO jockeys (id, name, experience, start_skill, tactical_skill, sprint_skill, horse_control, risk_management, track_knowledge, salary)
VALUES
  ('00000000-0000-0000-0000-000000000j01', 'Mehmet Kaya', 120, 82, 79, 85, 88, 75, 80, 5000),
  ('00000000-0000-0000-0000-000000000j02', 'Ali Demir',    45, 70, 68, 72, 74, 70, 65, 2500);

COMMIT;
