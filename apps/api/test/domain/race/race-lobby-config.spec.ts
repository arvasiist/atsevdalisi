import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';

/**
 * `config/race-lobby.config.json` DEĞİŞMEZLERİ (invariants) — brief §1-§11,
 * §42 PHASE 1.
 *
 * `chat-config.spec.ts`/`social-config.spec.ts`/`gift-config.spec.ts` ile
 * AYNI gerekçe: `packages/game-config/src/index.ts`'teki `load*Config()`
 * fonksiyonları `JSON` import'unu tip iddiasıyla (`as unknown as X`) döndüren
 * SAF cast'lerdir — ÇALIŞMA ZAMANI DOĞRULAMASI YOKTUR. Config'e yazılan bir
 * yazım hatası ne TypeScript'te ne derlemede yakalanır.
 *
 * **BU DOSYANIN ASIL DEĞERİ İKİ KATMANLIDIR:**
 *
 *  1. **Kendi içinde tutarlılık.** Örneğin `minPlayers`, `fieldSizes`'ın
 *     EN KÜÇÜĞÜ olmalıdır: `minPlayers = 10` iken `fieldSizes = [8, …]`
 *     olsaydı, 8 atlık bir yarış HİÇBİR ZAMAN başlayamazdı — ve bu,
 *     `validateRaceCreation`'ın `maxPlayers >= minPlayers` kontrolü
 *     yüzünden 8 atlık yarışın HİÇ OLUŞTURULAMAMASI demek olurdu. İki
 *     ayrı config alanının sessizce çelişmesi, tam olarak bu testin
 *     yakaladığı hata sınıfıdır.
 *  2. **Config ↔ MİGRASYON uyumu.** `nameLength.max` ile migration
 *     0036'daki `races_name_length` CHECK'i AYNI sayıyı söylemelidir;
 *     `allowedSurfaces`/`allowedWeather` ile migration 0006'daki CHECK
 *     kümeleri AYNI olmalıdır. Sayıları buraya elle yazmak (ör.
 *     `toBe(60)`) yalnızca config'i sabitlerdi; migrasyon okunduğunda ise
 *     "config ile veritabanı ayrıştı" hatası CI'da YAKALANIR — ki bu,
 *     kullanıcıya 500 dönen gerçek bir üretim hatasıdır.
 */
const config = loadRaceLobbyConfig();

/** `chat-config.spec.ts` ile AYNI "yukarı yürü" deseni (sabit `../..` sayısı iki çalıştırma yolundan birinde kırılırdı). */
const MAX_PARENT_WALK_DEPTH = 10;

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let depth = 0; depth < MAX_PARENT_WALK_DEPTH; depth += 1) {
    try {
      readdirSync(join(dir, 'database'));
      return dir;
    } catch {
      const parent = join(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error(`Depo kökü bulunamadı (database/ klasörü yok): ${startDir}`);
}

const repoRoot = findRepoRoot(process.cwd());
const migrationsDir = join(repoRoot, 'database', 'migrations');

const LOBBY_MIGRATION = readdirSync(migrationsDir).find((name) => name.endsWith('add_race_lobby_fields.up.sql'));
const RACES_MIGRATION = readdirSync(migrationsDir).find((name) => name.endsWith('create_races_and_entries.up.sql'));
/** §42 PHASE 1b — `race_entries.player_id`/`status` sütunlarını ekleyen migrasyon. */
const ENTRY_JOIN_MIGRATION = readdirSync(migrationsDir).find((name) =>
  name.endsWith('add_race_entry_join_fields.up.sql'),
);

function readMigration(fileName: string | undefined): string {
  // `chat-config.spec.ts`'teki AYNI savunma: dosya yeniden adlandırılırsa
  // aşağıdaki karşılaştırmalar `undefined` üzerinde çalışır ve koruma
  // SESSİZCE kaybolurdu — bu yüzden önce varlığı iddia edilir.
  expect(fileName).toBeDefined();
  return readFileSync(join(migrationsDir, fileName as string), 'utf-8');
}

/** SQL'deki `IN ('a', 'b', …)` listesini okur — `string` karşılaştırması için sıralı diziye çevirir. */
function quotedListAfter(sql: string, anchor: RegExp): string[] {
  const match = anchor.exec(sql);
  if (match === null) {
    throw new Error(`SQL'de beklenen liste bulunamadı: ${anchor}`);
  }
  return [...match[0].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('race-lobby.config.json — at sayısı / oyuncu tavanı (brief §1, §6, §7)', () => {
  it('fieldSizes boş değildir ve hepsi pozitif tam sayıdır', () => {
    expect(config.fieldSizes.length).toBeGreaterThan(0);
    for (const size of config.fieldSizes) {
      expect(Number.isInteger(size)).toBe(true);
      expect(size).toBeGreaterThan(0);
    }
  });

  it('fieldSizes brief §2/§7\'nin saydığı beş seçeneği İÇERİR (8/10/12/14/16)', () => {
    // Brief "8/10/12/14/16 at" diye AÇIKÇA beş seçenek sayar. `toContain`
    // kullanılır, `toEqual` DEĞİL: listeye 20 eklemek brief'e aykırı
    // değildir (brief "en az bunlar" der), ama birinin ÇIKARILMASI
    // aykırıdır ve bu test onu yakalar.
    for (const required of [8, 10, 12, 14, 16]) {
      expect(config.fieldSizes).toContain(required);
    }
  });

  it('minPlayers, fieldSizes\'ın EN KÜÇÜĞÜdür', () => {
    // Bu iddia olmadan `minPlayers = 10` + `fieldSizes = [8, …]` gibi bir
    // config geçer: 8 atlık yarış hiçbir zaman başlayamaz, üstelik
    // `validateRaceCreation`'ın `maxPlayers >= minPlayers` kontrolü
    // yüzünden HİÇ OLUŞTURULAMAZ da.
    expect(config.minPlayers).toBe(Math.min(...config.fieldSizes));
  });

  it('maxPlayers, fieldSizes\'ın EN BÜYÜĞÜdür (brief §6 MAX_PLAYERS)', () => {
    // Aynı mantıkla: `maxPlayers = 16` iken `fieldSizes` 16'yı içermezse
    // 16 oyunculu bir yarış hiçbir zaman kurulamaz (tavan at sayısını
    // aşamaz kuralı).
    expect(config.maxPlayers).toBe(Math.max(...config.fieldSizes));
  });

  it('minPlayers < maxPlayers', () => {
    expect(config.minPlayers).toBeLessThan(config.maxPlayers);
  });

  it('aiFillEnabled bir boolean\'dır (brief §6 "kalan koltuklar AI ile dolar")', () => {
    expect(typeof config.aiFillEnabled).toBe('boolean');
  });
});

describe('race-lobby.config.json — para seçenekleri (brief §2, §10, §11)', () => {
  it('paidEntryFeeOptions pozitif tam sayılardır', () => {
    expect(config.paidEntryFeeOptions.length).toBeGreaterThan(0);
    for (const fee of config.paidEntryFeeOptions) {
      expect(Number.isInteger(fee)).toBe(true);
      // 0 OLMAMALIDIR: `paid` bir yarışın giriş ücreti 0 ise
      // `races_race_type_matches_fee` kısıtı (`(race_type = 'paid') =
      // (entry_fee > 0)`) INSERT'i düşürür ve kullanıcı 500 görürdü.
      expect(fee).toBeGreaterThan(0);
    }
  });

  it('tribuneFeeOptions 0\'ı İÇERİR (brief §9 FREE tribün) ve negatif değer yoktur', () => {
    // 0'ın BULUNMASI ZORUNLUDUR: brief §9/§10 "FREE" tribünü ayrı bir tip
    // değil, tam olarak `tribune_fee = 0` olarak tanımlar. Listeden
    // çıkarılsaydı ücretsiz tribün diye bir şey kalmazdı.
    expect(config.tribuneFeeOptions).toContain(0);
    for (const fee of config.tribuneFeeOptions) {
      expect(Number.isInteger(fee)).toBe(true);
      // `races_tribune_fee_non_negative` kısıtı (migration 0036) ile AYNI.
      expect(fee).toBeGreaterThanOrEqual(0);
    }
  });

  it('spectatorCapacityOptions brief §11\'in üç seçeneğini İÇERİR ve pozitiftir', () => {
    for (const required of [500, 1_000, 5_000]) {
      expect(config.spectatorCapacityOptions).toContain(required);
    }
    for (const capacity of config.spectatorCapacityOptions) {
      expect(Number.isInteger(capacity)).toBe(true);
      // `races_spectator_capacity_positive` (migration 0036) `> 0` der.
      expect(capacity).toBeGreaterThan(0);
    }
  });
});

describe('race-lobby.config.json — mesafe, ad, başlangıç zamanı', () => {
  it('distanceMeters aralığı geçerlidir', () => {
    expect(Number.isInteger(config.distanceMeters.min)).toBe(true);
    expect(Number.isInteger(config.distanceMeters.max)).toBe(true);
    expect(config.distanceMeters.min).toBeGreaterThan(0);
    expect(config.distanceMeters.min).toBeLessThan(config.distanceMeters.max);
  });

  it('nameLength.min >= 1 ve min <= max', () => {
    expect(Number.isInteger(config.nameLength.min)).toBe(true);
    expect(Number.isInteger(config.nameLength.max)).toBe(true);
    // `races_name_length` CHECK'i `char_length(name) BETWEEN 1 AND 60`
    // der; `min = 0` olsaydı boş ad domain'den geçip DB'de patlardı.
    expect(config.nameLength.min).toBeGreaterThanOrEqual(1);
    expect(config.nameLength.min).toBeLessThanOrEqual(config.nameLength.max);
  });

  it('nameLength.max, `races_name_length` CHECK\'iyle AYNI sayıdır', () => {
    const sql = readMigration(LOBBY_MIGRATION);
    const match = /char_length\(name\)\s+BETWEEN\s+\d+\s+AND\s+(\d+)/i.exec(sql);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(config.nameLength.max);
  });

  it('startDelaySeconds pozitif ve artan bir aralıktır', () => {
    expect(Number.isInteger(config.startDelaySeconds.min)).toBe(true);
    expect(Number.isInteger(config.startDelaySeconds.max)).toBe(true);
    // `min > 0` ŞARTTIR: 0 olsaydı `now`'a eşit (ya da geçmiş) bir
    // `startTime` kabul edilir, yarış "açılır açılmaz başlamış" olurdu.
    expect(config.startDelaySeconds.min).toBeGreaterThan(0);
    expect(config.startDelaySeconds.min).toBeLessThan(config.startDelaySeconds.max);
  });
});

describe('race-lobby.config.json — pist/hava kümeleri migrasyonla AYNI', () => {
  it('allowedSurfaces, `races.surface` CHECK kümesiyle AYNI', () => {
    const sql = readMigration(RACES_MIGRATION);
    const dbSet = quotedListAfter(sql, /surface\s+IN\s*\([^)]*\)/i);
    expect([...config.allowedSurfaces].sort()).toEqual([...dbSet].sort());
  });

  it('allowedWeather, `races.weather` CHECK kümesiyle AYNI', () => {
    const sql = readMigration(RACES_MIGRATION);
    const dbSet = quotedListAfter(sql, /weather\s+IN\s*\([^)]*\)/i);
    expect([...config.allowedWeather].sort()).toEqual([...dbSet].sort());
  });

  it('kümeler boş değildir (boş küme TÜM değerleri reddeder, yarış hiç açılamazdı)', () => {
    expect(config.allowedSurfaces.length).toBeGreaterThan(0);
    expect(config.allowedWeather.length).toBeGreaterThan(0);
  });
});

describe('race-lobby.config.json — tavan ve migrasyon varsayılanları', () => {
  it('maxOpenRacesPerPlayer pozitif bir tam sayıdır', () => {
    expect(Number.isInteger(config.maxOpenRacesPerPlayer)).toBe(true);
    // 0 olsaydı HİÇBİR yarış oluşturulamazdı — kontrol `openRaces (0) >=
    // maxOpenRaces (0)` ile her zaman doğru dönerdi.
    expect(config.maxOpenRacesPerPlayer).toBeGreaterThan(0);
  });

  it('migrasyonun `spectator_capacity` VARSAYILANI bir seçenek olmalıdır', () => {
    // Varsayılan yalnızca backfill için değil, aynı zamanda "sütun
    // listesinde yer almayan bir yarış" durumu için de geçerlidir:
    // varsayılan bir seçenek DEĞİLSE, `spectatorCapacityOptions` dışı bir
    // değer sessizce var olur ve `validateRaceCreation`'ın "yalnızca
    // seçenekler kabul edilir" kuralı ile çelişirdi.
    const sql = readMigration(LOBBY_MIGRATION);
    const match = /ADD COLUMN spectator_capacity INTEGER NOT NULL DEFAULT (\d+)/i.exec(sql);
    expect(match).not.toBeNull();
    expect(config.spectatorCapacityOptions).toContain(Number(match?.[1]));
  });

  it('migrasyonun `race_type` VARSAYILANI geçerli bir tiptir', () => {
    const sql = readMigration(LOBBY_MIGRATION);
    const match = /ADD COLUMN race_type TEXT NOT NULL DEFAULT '(\w+)'/i.exec(sql);
    expect(match).not.toBeNull();
    expect(['free', 'paid']).toContain(match?.[1]);
  });

  it('migrasyon `race_type` ile `entry_fee` çelişkisini DB\'de de yasaklar', () => {
    // `validateRaceCreation` bu kuralı zaten uygular; bu iddia, DB
    // kısıtının SİLİNMEDİĞİNİ garanti eder (son savunma hattı yerinde mi).
    const sql = readMigration(LOBBY_MIGRATION);
    expect(/\(race_type = 'paid'\)\s*=\s*\(entry_fee > 0\)/.test(sql)).toBe(true);
  });

  it('migrasyon `max_players <= participant_limit` kısıtını içerir (brief §6)', () => {
    const sql = readMigration(LOBBY_MIGRATION);
    expect(/max_players\s*<=\s*participant_limit/.test(sql)).toBe(true);
  });
});

describe('race-lobby.config.json — katılım durumları migrasyonla AYNI (brief §6, §42 PHASE 1b)', () => {
  it('entryStatuses, `race_entries.status` CHECK kümesiyle AYNI', () => {
    // `allowedSurfaces`/`allowedWeather` iddialarıyla AYNI gerekçe:
    // config'e eklenip CHECK'e eklenmeyen bir değer, katılım yolunda
    // `23514 check_violation` ile 500 üretir — kullanıcıya ulaşan gerçek
    // bir üretim hatası. İki listeyi elle senkron tutmak yerine burada
    // karşılaştırılır.
    const sql = readMigration(ENTRY_JOIN_MIGRATION);
    const dbSet = quotedListAfter(sql, /status\s+IN\s*\([^)]*\)/i);
    expect([...config.entryStatuses].sort()).toEqual([...dbSet].sort());
  });

  it("entryStatuses 'waiting' İÇERİR — katılım yolu bu değeri yazar", () => {
    // `joinLobbyRace` yeni satırı `status = 'waiting'` ile açar (brief §6:
    // oyuncu READY düğmesine basana kadar bekler). Bu değer config'ten
    // çıkarılırsa CHECK ile çelişir.
    expect(config.entryStatuses).toContain('waiting');
  });

  it('migrasyon kısmi tekil indeksi içerir: bir oyuncu bir yarışa BİR KEZ', () => {
    // Brief §2 — giriş ücreti KİŞİ BAŞINA alınır. Bu indeks olmadan bir
    // oyuncu aynı yarışa iki atla girip havuzu kendi lehine şişirebilirdi;
    // üstelik uygulama katmanındaki ön kontrol TOCTOU'ya açıktır, yani
    // kuralın ASIL garantisi bu indekstir.
    const sql = readMigration(ENTRY_JOIN_MIGRATION);
    expect(/CREATE UNIQUE INDEX\s+race_entries_race_player_uq/i.test(sql)).toBe(true);
    // KISMİ olmalıdır: bot satırlarında `player_id` NULL'dır ve tam
    // indeks olsaydı aynı yarışa ikinci bir bot giremezdi.
    expect(/WHERE\s+player_id\s+IS\s+NOT\s+NULL/i.test(sql)).toBe(true);
  });

  it('migrasyon "bot satırının oyuncusu olamaz" kısıtını içerir', () => {
    const sql = readMigration(ENTRY_JOIN_MIGRATION);
    expect(/CHECK\s*\(\s*player_id\s+IS\s+NULL\s+OR\s+horse_id\s+IS\s+NOT\s+NULL\s*\)/i.test(sql)).toBe(true);
  });

  it('migrasyon `status` sütununu VARSAYILANSIZ ekler', () => {
    // Varsayılan verilseydi, geçmişte koşmuş pratik/PvP girişleri (bu
    // sütun eklenmeden önce yazılmış satırlar) yanlışlıkla "bekliyor"
    // sayılırdı. NULL "bu satır katılım akışından geçmedi" demektir.
    const sql = readMigration(ENTRY_JOIN_MIGRATION);
    const addColumn = /ADD COLUMN\s+status\s+TEXT([^;]*);/i.exec(sql);
    expect(addColumn).not.toBeNull();
    expect(/DEFAULT/i.test(addColumn?.[1] as string)).toBe(false);
  });
});
