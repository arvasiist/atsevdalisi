import type { RaceLobbyConfig } from '@at-sevdalisi/game-config';
// Katılım (PHASE 1b) taktik/risk alanları — `RacingStyle`/`RiskLevel`
// `race_entries` CHECK kısıtlarının (migration 0006) TS karşılığıdır.
import type { RaceEntryStatus, RacingStyle, RiskLevel } from '@at-sevdalisi/shared-types';

/**
 * Oyuncunun OLUŞTURDUĞU yarışın tanımı (brief §1-§7, §9-§11, §42 PHASE 1).
 *
 * `domain/race/prize.ts` ile AYNI "SAF fonksiyon" ilkesi: bu dosya hiçbir
 * DB/HTTP/NestJS erişimi içermez, yalnızca girdi + config'ten "bu tanım
 * geçerli mi?" sorusunu cevaplar. Gerçek `races` satırı
 * `application/use-cases/create-race.use-case.ts` içinde yazılır.
 *
 * **NEDEN `Race Engine`'E GİRMİYOR (CLAUDE.md "RACE ENGINE'E DOKUNMA"):**
 * buradaki hiçbir alan simülasyonun FİZİĞİNİ değiştirmez — motor, kendisine
 * verilen `RaceEntrantSnapshot` dizisini koşar ve "bu yarış nasıl
 * doğrulanır" sorusunu hiç sormaz. Bir yarışın kaç atı olacağı motora
 * SNAPSHOT'IN UZUNLUĞU olarak girer, `races` satırının bir sütunu olarak
 * değil. Bu ayrım korunduğu sürece determinizm sözleşmesi (aynı seed +
 * aynı snapshot + aynı config = bit bit aynı sonuç) bozulmaz.
 *
 * **TÜM ALANLAR `unknown`'DIR — VE BU BİLİNÇLİDİR.** Bu tip, gövdeden
 * (HTTP) geldiği GİBİ taşınan ham veriyi temsil eder. `string`/`number`
 * diye tiplamak, derleyiciyi susturup hatayı GİZLEMEZ, taşır: `@Body() dto`
 * esbuild altında `design:paramtypes` üretilmediği için `ValidationPipe`
 * tarafından HİÇ doğrulanmaz (CLAUDE.md kural 5), yani `dto.name` gerçekten
 * bir sayı olabilir. `string` diye tiplamak olsaydı `normalizeRaceName(42)`
 * → `42.trim is not a function` → istemci **500** görürdü; `unknown` diye
 * tiplamak ise derleyiciyi "önce kontrol et" demeye ZORLAR. Aşağıdaki
 * `validateRaceCreation` bu yüzden hem DOĞRULAR hem DARALTIR — ikisi tek
 * geçişte, tek doğruluk kaynağı olarak.
 *
 * **`raceType` NEDEN VAR (ve neden `entryFee`'den TÜRETİLMİYOR):** brief §1
 * "yarış tipi"yi AYRI bir alan olarak sayar. Değerleri `free`/`paid`
 * seçildi çünkü brief §41 "ücretli yarış sistemini doğrudan … production'a
 * açma, önce Virtual Coin / Mock Wallet olarak geliştir" diyerek ekonominin
 * iki rejimini zaten ayırır. İkisi TUTARLI olmak zorundadır
 * (`free` ⇒ `entryFee = 0`, `paid` ⇒ `entryFee > 0`) — bu, hem burada hem
 * `races_race_type_matches_fee` DB kısıtıyla (migration 0036) uygulanır.
 */
export interface RaceCreationInput {
  /** Yarış adı — `trim()` edilmiş hâliyle doğrulanır (bkz. `validateRaceCreation`). */
  name: unknown;
  /** brief §1/§7 "at sayısı" — `config.fieldSizes` üyelerinden biri (8/10/12/14/16). */
  fieldSize: unknown;
  /** brief §1 "maksimum oyuncu" / §6 MAX_PLAYERS — `fieldSize`'ı aşamaz. */
  maxPlayers: unknown;
  /** brief §2 giriş ücreti. `raceType = 'free'` ise 0 olmak ZORUNDADIR. */
  entryFee: unknown;
  /** brief §1 "yarış tipi" — `'free'` | `'paid'`. */
  raceType: unknown;
  /** brief §1 "başlangıç zamanı" — ISO 8601 metni. */
  startTime: unknown;
  /** brief §1 "pist" — yüzey (`races.surface` CHECK'i ile AYNI küme). */
  surface: unknown;
  /** Hava durumu (`races.weather` CHECK'i ile AYNI küme) — §1'de ayrı sayılmaz ama `races` satırı zorunlu kılar. */
  weather: unknown;
  /** brief §1 "yarış mesafesi" (metre). */
  distanceMeters: unknown;
  /** brief §10 tribün ücreti. **0 = FREE** — ayrı bir `tribuneType` alanı bilinçli olarak YOKTUR. */
  tribuneFee: unknown;
  /** brief §11 izleyici kapasitesi. */
  spectatorCapacity: unknown;
}

/**
 * `races` tablosuna yazılabileceği KANITLANMIŞ yarış tanımı — yani
 * `validateRaceCreation` içinden yalnızca `problems` BOŞKEN çıkan değer.
 *
 * `RaceCreationInput`'tan üç farkı vardır ve üçü de bilinçlidir:
 *
 *  1. Her alan ARTIK SOMUT bir tiptir (`unknown` değil). Bu tipin
 *     varoluş sebebi budur: "doğrulandı" iddiasını TİP SİSTEMİNE taşır.
 *     `CreateRaceUseCase` bu tipten başka bir şeyle repository'yi
 *     çağıramaz, yani doğrulanmamış bir gövdenin veritabanına ulaşması
 *     derleme zamanında imkânsızdır.
 *  2. `name` artık `trim()` edilmiştir — DB'ye hiçbir zaman
 *     baştaki/sondaki boşluklu bir ad yazılmaz (aksi hâlde `char_length`
 *     CHECK'i ile istemcinin gördüğü uzunluk AYRIŞIRDI).
 *  3. `startTime` bir `Date`'tir — metin değil. Dönüşüm TEK bir yerde
 *     yapılır ki "geçerli mi" ile "hangi an" soruları karışmasın.
 *  4. `prizePool` EKLENMİŞTİR ve `0`'dır: havuz katılımcılarla BÜYÜR
 *     (brief §3 `entryFee × participantCount`) — yarış açıldığı anda
 *     ortada henüz katılımcı yoktur.
 */
export interface ValidatedRaceCreation {
  name: string;
  fieldSize: number;
  maxPlayers: number;
  entryFee: number;
  raceType: 'free' | 'paid';
  startTime: Date;
  surface: string;
  weather: string;
  distanceMeters: number;
  tribuneFee: number;
  spectatorCapacity: number;
  prizePool: number;
}

/**
 * `validateRaceCreation`'ın sonucu.
 *
 * **NEDEN `problems` İLE `value` AYNI NESNEDE:** ikisi ayrı fonksiyonlardan
 * dönseydi (`validate()` + `narrow()`), "geçerli" kararını veren kod ile
 * değeri ÜRETEN kod iki ayrı yer olurdu ve zamanla ayrışırdı — bir alan
 * doğrulamaya eklenip daraltmaya eklenmezse `undefined` DB'ye sızardı.
 * Burada ikisi tek geçiştedir: `problems` boşsa `value` DOLUDUR, doluysa
 * `value` `null`'dır. Bu değişmez `lobby.spec.ts`'te ayrıca test edilir.
 */
export interface RaceCreationValidation {
  problems: string[];
  value: ValidatedRaceCreation | null;
}

/** Yarış adının başındaki/sonundaki boşlukları atar. Doğrulama BUNUN üzerinde çalışır. */
export function normalizeRaceName(name: string): string {
  return name.trim();
}

/**
 * Bir yarış tanımının `config/race-lobby.config.json` sınırlarına uyup
 * uymadığını denetler, bulunan sorunları toplar ve geçerliyse yazılabilir
 * değeri üretir (bkz. `RaceCreationValidation`).
 *
 * **FIRLATMAZ** — `validateRaceTiers` (bkz. `prize.ts`) ile AYNI gerekçe:
 * çağıran (`CreateRaceUseCase`) sorunların TAMAMINI tek seferde görmek
 * ister, ilkini değil; ayrıca bu fonksiyon bir testin içinden de doğrudan
 * çağrılabilir olmalıdır.
 *
 * `now` PARAMETRE OLARAK ALINIR (içeride `new Date()` çağrılmaz): aksi
 * hâlde fonksiyon SAF olmaktan çıkar ve "başlangıç zamanı sınırın hemen
 * altında/üstünde" durumlarını sınamak imkânsızlaşırdı (test, çalışma
 * anına bağlı olarak bir kez geçip bir kez düşerdi). Bu, CLAUDE.md'nin
 * "Math.random() yasak" kuralının ZAMAN için olan karşılığıdır: saf
 * fonksiyonun gizli bir küresel kaynağı olmamalıdır.
 */
export function validateRaceCreation(input: RaceCreationInput, config: RaceLobbyConfig, now: Date): RaceCreationValidation {
  const problems: string[] = [];

  // --- Ad (brief §1) ---
  // `name` HAM hâliyle `typeof` ile sınanır; `normalizeRaceName` yalnızca
  // metin olduğu KANITLANDIKTAN sonra çağrılır (aksi hâlde `42.trim()`
  // 500 fırlatırdı — bu tipin `unknown` olmasının asıl sebebi).
  let name: string | null = null;
  if (typeof input.name !== 'string') {
    problems.push(`Yarış adı bir metin olmalıdır (verilen tip: ${describeType(input.name)}).`);
  } else {
    name = normalizeRaceName(input.name);
    if (name.length < config.nameLength.min || name.length > config.nameLength.max) {
      problems.push(
        `Yarış adı ${config.nameLength.min}-${config.nameLength.max} karakter arasında olmalıdır (verilen: ${name.length}).`,
      );
      name = null;
    }
  }

  // --- At sayısı (brief §1/§7) ---
  let fieldSize: number | null = null;
  if (typeof input.fieldSize !== 'number' || !config.fieldSizes.includes(input.fieldSize)) {
    problems.push(`At sayısı ${config.fieldSizes.join('/')} değerlerinden biri olmalıdır (verilen: ${describe(input.fieldSize)}).`);
  } else {
    fieldSize = input.fieldSize;
  }

  // --- Oyuncu tavanı (brief §6) ---
  let maxPlayers: number | null = null;
  if (typeof input.maxPlayers !== 'number' || !Number.isInteger(input.maxPlayers) || input.maxPlayers < 1) {
    problems.push(`Maksimum oyuncu en az 1 olan bir tam sayı olmalıdır (verilen: ${describe(input.maxPlayers)}).`);
  } else {
    // `fieldSize` GEÇERSİZSE bu karşılaştırma ANLAMSIZDIR ("12, geçersiz
    // bir at sayısını aşamaz" gibi bir cümle kullanıcıya hiçbir şey
    // söylemez) — o yüzden yalnızca `fieldSize` geçerliyken çalışır.
    // Zaten `fieldSize` için bir hata mesajı yukarıda ÜRETİLMİŞTİR, yani
    // kullanıcı yalnız kalmaz.
    if (fieldSize !== null && input.maxPlayers > fieldSize) {
      problems.push(
        `Maksimum oyuncu (${input.maxPlayers}) at sayısını (${fieldSize}) aşamaz — ` +
          "aşan oyuncunun atı start gate'te yer bulamaz (brief §6).",
      );
    } else if (input.maxPlayers > config.maxPlayers) {
      problems.push(`Maksimum oyuncu ${config.maxPlayers}'ı aşamaz (verilen: ${input.maxPlayers}).`);
    } else if (input.maxPlayers < config.minPlayers) {
      // ALT SINIR KONTROLÜ BİLİNÇLİDİR: `minPlayers`'ın altında bir tavanla
      // açılan yarış HİÇBİR ZAMAN başlayamaz (brief §6 "Yarışın
      // başlayabilmesi için gereken minimum katılımcı sayısı"). Böyle bir
      // yarışı oluşturmaya izin vermek, oyuncuya sessizce ölü bir kayıt
      // üretmek olurdu.
      problems.push(
        `Maksimum oyuncu en az ${config.minPlayers} olmalıdır — altında bir yarış hiçbir zaman başlayamaz (brief §6).`,
      );
    } else {
      maxPlayers = input.maxPlayers;
    }
  }

  // --- Yarış tipi + giriş ücreti (brief §1/§2, §41) ---
  let raceType: 'free' | 'paid' | null = null;
  let entryFee: number | null = null;
  if (input.raceType !== 'free' && input.raceType !== 'paid') {
    problems.push(`Yarış tipi 'free' ya da 'paid' olmalıdır (verilen: ${describe(input.raceType)}).`);
  } else if (input.raceType === 'free') {
    if (input.entryFee !== 0) {
      problems.push(`Ücretsiz yarışta giriş ücreti 0 olmalıdır (verilen: ${describe(input.entryFee)}).`);
    } else {
      raceType = 'free';
      entryFee = 0;
    }
  } else if (typeof input.entryFee !== 'number' || !config.paidEntryFeeOptions.includes(input.entryFee)) {
    problems.push(
      `Giriş ücreti ${config.paidEntryFeeOptions.join('/')} değerlerinden biri olmalıdır (verilen: ${describe(input.entryFee)}).`,
    );
  } else {
    raceType = 'paid';
    entryFee = input.entryFee;
  }

  // --- Tribün (brief §10/§11) ---
  let tribuneFee: number | null = null;
  if (typeof input.tribuneFee !== 'number' || !config.tribuneFeeOptions.includes(input.tribuneFee)) {
    problems.push(`Tribün ücreti ${config.tribuneFeeOptions.join('/')} değerlerinden biri olmalıdır (verilen: ${describe(input.tribuneFee)}).`);
  } else {
    tribuneFee = input.tribuneFee;
  }

  let spectatorCapacity: number | null = null;
  if (typeof input.spectatorCapacity !== 'number' || !config.spectatorCapacityOptions.includes(input.spectatorCapacity)) {
    problems.push(
      `Tribün kapasitesi ${config.spectatorCapacityOptions.join('/')} değerlerinden biri olmalıdır (verilen: ${describe(input.spectatorCapacity)}).`,
    );
  } else {
    spectatorCapacity = input.spectatorCapacity;
  }

  // --- Mesafe (brief §1) ---
  let distanceMeters: number | null = null;
  if (
    typeof input.distanceMeters !== 'number' ||
    !Number.isInteger(input.distanceMeters) ||
    input.distanceMeters < config.distanceMeters.min ||
    input.distanceMeters > config.distanceMeters.max
  ) {
    problems.push(
      `Mesafe ${config.distanceMeters.min}-${config.distanceMeters.max} metre arasında bir tam sayı olmalıdır (verilen: ${describe(input.distanceMeters)}).`,
    );
  } else {
    distanceMeters = input.distanceMeters;
  }

  // --- Pist + hava (brief §1) ---
  let surface: string | null = null;
  if (typeof input.surface !== 'string' || !config.allowedSurfaces.includes(input.surface)) {
    problems.push(`Pist yüzeyi ${config.allowedSurfaces.join('/')} değerlerinden biri olmalıdır (verilen: ${describe(input.surface)}).`);
  } else {
    surface = input.surface;
  }

  let weather: string | null = null;
  if (typeof input.weather !== 'string' || !config.allowedWeather.includes(input.weather)) {
    problems.push(`Hava durumu ${config.allowedWeather.join('/')} değerlerinden biri olmalıdır (verilen: ${describe(input.weather)}).`);
  } else {
    weather = input.weather;
  }

  // --- Başlangıç zamanı (brief §1) ---
  let startTime: Date | null = null;
  if (typeof input.startTime !== 'string') {
    problems.push(`Başlangıç zamanı bir ISO 8601 metni olmalıdır (verilen tip: ${describeType(input.startTime)}).`);
  } else {
    const startMs = Date.parse(input.startTime);
    if (Number.isNaN(startMs)) {
      problems.push(`Başlangıç zamanı geçerli bir ISO 8601 tarihi olmalıdır (verilen: ${input.startTime}).`);
    } else {
      // Saniye cinsinden fark — `Date.parse` milisaniye döndürdüğü için
      // config'teki saniye değerleriyle karşılaştırmadan önce bölünür.
      const delaySeconds = (startMs - now.getTime()) / 1000;
      if (delaySeconds < config.startDelaySeconds.min) {
        problems.push(
          `Başlangıç zamanı en az ${config.startDelaySeconds.min} saniye sonra olmalıdır ` +
            `(verilen: ${Math.round(delaySeconds)} saniye sonra) — lobinin dolması için zaman gerekir.`,
        );
      } else if (delaySeconds > config.startDelaySeconds.max) {
        problems.push(
          `Başlangıç zamanı en fazla ${config.startDelaySeconds.max} saniye sonra olabilir ` +
            `(verilen: ${Math.round(delaySeconds)} saniye sonra).`,
        );
      } else {
        startTime = new Date(startMs);
      }
    }
  }

  if (problems.length > 0) {
    return { problems, value: null };
  }

  // BURAYA YALNIZCA HİÇBİR SORUN KALMADIĞINDA GELİNİR, yani yukarıdaki
  // yerel değişkenlerin HEPSİ doludur. TypeScript bunu kanıtlayamaz
  // (`problems.push` ile `fieldSize = …` arasındaki bağı göremez), bu
  // yüzden burada `!` kullanılır — bu, projedeki TEK "derleyiciye güven"
  // noktasıdır ve iddiası `lobby.spec.ts`'te iki yönlü olarak test edilir:
  // (a) geçerli girdi ⇒ `value !== null`, (b) herhangi bir sorun ⇒
  // `value === null`. Yeni bir alan eklenirse bu listenin de güncellenmesi
  // ZORUNLUDUR; unutulursa (a) testi kırılır.
  return {
    problems: [],
    value: {
      name: name!,
      fieldSize: fieldSize!,
      maxPlayers: maxPlayers!,
      entryFee: entryFee!,
      raceType: raceType!,
      startTime: startTime!,
      surface: surface!,
      weather: weather!,
      distanceMeters: distanceMeters!,
      tribuneFee: tribuneFee!,
      spectatorCapacity: spectatorCapacity!,
      // brief §3 — havuz katılımcılarla BÜYÜR; yarış açıldığı anda
      // katılımcı sayısı sıfırdır, dolayısıyla havuz da sıfırdır.
      prizePool: 0,
    },
  };
}

/**
 * Hata mesajlarında kullanılan "verilen değer" biçimlendirmesi.
 *
 * `JSON.stringify` KULLANILIR çünkü `String(value)` `null` ile `'null'`
 * metnini, `{}` ile `'[object Object]'`u ayırt edemez — kullanıcı
 * "verilen: null" gördüğünde alanı hiç göndermediğini anlamalıdır.
 * `undefined` `JSON.stringify`'ta `undefined` döndürür (metin değil), o
 * yüzden ayrıca ele alınır.
 */
function describe(value: unknown): string {
  if (value === undefined) {
    return 'gönderilmedi';
  }
  return JSON.stringify(value);
}

/** `describe`'ın tip sorusu için olan eşi — `null`'ın `typeof`'u `'object'`tir, o yüzden ayrılır. */
function describeType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'dizi';
  }
  return typeof value;
}

/**
 * Lobi yarışına KATILMA isteğinin ham gövdesi (brief §2/§3/§6, PHASE 1b).
 *
 * `RaceCreationInput` ile AYNI gerekçeyle TÜM alanlar `unknown`'dır: gövde
 * esbuild altında doğrulanmadan gelir (CLAUDE.md kural 5), `horseId` gerçekten
 * bir dizi olabilir ve `.trim()`/`String(...)` çağrıları 500 fırlatırdı.
 *
 * **`playerId` BİLİNÇLİ OLARAK YOKTUR.** Katılımcı, isteğin GÖVDESİNDEN değil
 * `CurrentPlayer()`'dan (JWT) alınır — CLAUDE.md kural 1 "SUNUCU OTORİTESİ".
 * Gövdede böyle bir alan bulunsa bile yok sayılır.
 */
export interface RaceJoinInput {
  /** Katılınacak at — oyuncunun KENDİ atı olmak zorundadır (aksi hâlde 403). */
  horseId: unknown;
  /** brief §14.2 taktik — verilmezse `mid_pack` kullanılır. */
  tacticalStyle: unknown;
  /** brief §14.2 risk — verilmezse `normal` kullanılır. */
  riskLevel: unknown;
}

/** Doğrulanmış + DARALTILMIŞ katılım girdisi — bkz. `validateRaceJoin`. */
export interface ValidatedRaceJoin {
  horseId: string;
  tacticalStyle: RacingStyle;
  riskLevel: RiskLevel;
}

export interface RaceJoinValidation {
  problems: string[];
  value: ValidatedRaceJoin | null;
}

/**
 * `race_entries.tactical_style` CHECK kısıtı (migration 0006) ile BİREBİR
 * aynı küme. `RacingStyle` tipinden TÜRETİLMEZ: `domain/` katmanı DB
 * kısıtını YANSITMAK zorundadır, tersi değil — tip genişleyip kısıt
 * genişlemezse `23514` ile 500 alınırdı.
 */
const ALLOWED_TACTICAL_STYLES: readonly RacingStyle[] = ['front_runner', 'tracker', 'mid_pack', 'closer'];
/** `race_entries.risk_level` CHECK kısıtı (migration 0006) ile BİREBİR aynı küme. */
const ALLOWED_RISK_LEVELS: readonly RiskLevel[] = ['low', 'normal', 'high'];

/** Taktik verilmediğinde kullanılan varsayılan — "dengeli" karşılığı. */
export const DEFAULT_TACTICAL_STYLE: RacingStyle = 'mid_pack';
/** Risk verilmediğinde kullanılan varsayılan. */
export const DEFAULT_RISK_LEVEL: RiskLevel = 'normal';

/**
 * UUID biçim denetimi. `@IsUUID()` DTO dekoratörü esbuild altında atlanır
 * (CLAUDE.md kural 5), bu yüzden biçim burada BAĞIMSIZ olarak doğrulanır:
 * geçersiz bir UUID veritabanına ulaşırsa `22P02` (invalid input syntax for
 * type uuid) ile 500 dönerdi, oysa doğru cevap 400'dür.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Katılım isteğini doğrular VE daraltır (tek geçiş) — `validateRaceCreation`
 * ile aynı desen, aynı gerekçe.
 *
 * Taktik/risk **isteğe bağlıdır**: brief §14.2 bunları yarış ÖNCESİ seçim
 * olarak tanımlar, §6 ise katılımdan SONRA ayrı bir READY adımı öngörür.
 * Zorunlu tutmak, istemciyi katılım anında henüz karar vermediği bir seçime
 * mecbur bırakırdı; verilmezse güvenli varsayılan yazılır.
 *
 * `horseId` için **yalnızca biçim** doğrulanır. Atın var olup olmadığı,
 * oyuncuya ait olup olmadığı ve sağlığı DB işleminde, yarış satırı
 * KİLİTLİYKEN kontrol edilir — burada yapılsaydı kontrol ile yazma arasında
 * yarışın durumu değişebilirdi (TOCTOU).
 */
export function validateRaceJoin(input: RaceJoinInput): RaceJoinValidation {
  const problems: string[] = [];

  let horseId: string | null = null;
  if (typeof input.horseId !== 'string') {
    problems.push(`At kimliği bir metin olmalıdır (verilen tip: ${describeType(input.horseId)}).`);
  } else if (!UUID_PATTERN.test(input.horseId)) {
    problems.push(`At kimliği geçerli bir UUID olmalıdır (verilen: ${describe(input.horseId)}).`);
  } else {
    horseId = input.horseId;
  }

  let tacticalStyle: RacingStyle | null = null;
  if (input.tacticalStyle === undefined) {
    tacticalStyle = DEFAULT_TACTICAL_STYLE;
  } else if (
    typeof input.tacticalStyle !== 'string' ||
    !ALLOWED_TACTICAL_STYLES.includes(input.tacticalStyle as RacingStyle)
  ) {
    problems.push(
      `Taktik şunlardan biri olmalıdır: ${ALLOWED_TACTICAL_STYLES.join(', ')} (verilen: ${describe(input.tacticalStyle)}).`,
    );
  } else {
    tacticalStyle = input.tacticalStyle as RacingStyle;
  }

  let riskLevel: RiskLevel | null = null;
  if (input.riskLevel === undefined) {
    riskLevel = DEFAULT_RISK_LEVEL;
  } else if (typeof input.riskLevel !== 'string' || !ALLOWED_RISK_LEVELS.includes(input.riskLevel as RiskLevel)) {
    problems.push(
      `Risk seviyesi şunlardan biri olmalıdır: ${ALLOWED_RISK_LEVELS.join(', ')} (verilen: ${describe(input.riskLevel)}).`,
    );
  } else {
    riskLevel = input.riskLevel as RiskLevel;
  }

  if (problems.length > 0) {
    return { problems, value: null };
  }

  // `problems` boşsa üç alan da yukarıdaki dallarda ATANMIŞTIR; `!` yalnızca
  // derleyiciyi ikna eder (bkz. `validateRaceCreation`'daki aynı not).
  return { problems: [], value: { horseId: horseId!, tacticalStyle: tacticalStyle!, riskLevel: riskLevel! } };
}

/**
 * Katılımın DURUM denetimi (brief §2/§6) — saf fonksiyon, hata FIRLATMAZ,
 * ret nedenini döndürür. Fırlatmak yerine sonuç döndürmek, kuralın DB
 * transaction'ı olmadan da tek başına test edilebilmesini sağlar; nedeni
 * domain hatasına çevirmek `join-race.use-case`'in işidir.
 *
 * `joinedPlayers` **GERÇEK oyuncu** sayısıdır (`player_id` dolu satırlar) —
 * bot girişleri sayılmaz, çünkü brief §6 at sayısı ile oyuncu sayısını
 * AÇIKÇA ayırır.
 */
export function checkRaceJoinable(
  race: { status: string; startTime: Date; maxPlayers: number; joinedPlayers: number },
  now: Date,
): RaceJoinRejection | null {
  if (race.status !== 'scheduled') {
    return 'NOT_SCHEDULED';
  }
  // brief §2 — katılım yarış BAŞLAYANA kadar açıktır. Sınırda
  // (`now === startTime`) katılım KAPALIDIR: motorun snapshot'ı tam o anda
  // alınır, sonradan gelen katılım koşulmuş bir yarışa girmek olurdu.
  if (race.startTime.getTime() <= now.getTime()) {
    return 'ALREADY_STARTED';
  }
  if (race.joinedPlayers >= race.maxPlayers) {
    return 'FULL';
  }
  return null;
}

/** `checkRaceJoinable`'ın ret nedenleri. */
export type RaceJoinRejection = 'NOT_SCHEDULED' | 'ALREADY_STARTED' | 'FULL';

/**
 * Katılıma atanacak start-gate (kulvar) numarası (brief §7: "start gate …
 * sayısına göre otomatik oluşturulmalı").
 *
 * Kulvarlar 1'den başlar ve EN KÜÇÜK BOŞ numara verilir: sıralı eklemede
 * `used.length + 1` ile aynı sonucu verir, ama aradan bir katılım İPTAL
 * edilirse (PHASE 3) boşluğu yeniden kullanır — `length + 1` bu durumda
 * kulvar atlar ve `participant_limit`'e gereksiz yer harcardı.
 */
export function nextGatePosition(used: readonly number[]): number {
  const taken = new Set(used);
  let candidate = 1;
  while (taken.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

/**
 * READY düğmesiyle SEÇİLEBİLECEK katılım durumları (brief §6, §42 PHASE 3).
 *
 * **NEDEN AYRI BİR LİSTE — config'teki `entryStatuses` DEĞİL:** ikisi
 * FARKLI soruları cevaplar. `entryStatuses` (config) "`race_entries.status`
 * sütununda HANGİ değerler bulunabilir" sorusunun cevabıdır ve migration
 * 0037'nin CHECK kısıtıyla birebir aynı olmak zorundadır. Buradaki liste
 * ise "bir OYUNCU hangilerini SEÇEBİLİR" sorusunun cevabıdır ve bu bir
 * oyun ayarı değil, protokol kuralıdır:
 *
 * - `waiting` SEÇİLEMEZ. Katılım anında yazılan başlangıç durumudur
 *   (`joinLobbyRace`); oyuncunun "kararımı geri aldım" demenin yolu
 *   `not_ready`'dir, `waiting`'e dönmek değil — aksi hâlde "hiç karar
 *   vermemiş" ile "kararını geri almış" ayırt edilemezdi ve lobi
 *   göstergesi yalan söylerdi.
 * - `cancelled` SEÇİLEMEZ. Katılım iptali bir PARA YOLUDUR: ücretli bir
 *   yarışta iade politikası gerektirir (`economy_transactions` kaydı,
 *   `prize_pool` düşümü). READY ucundan `cancelled` yazılabilseydi, ücret
 *   ödemeden çıkmanın ya da havuzu bozmanın bir yolu doğardı. İptal AYRI
 *   bir uç olarak, iade kararı verildiğinde eklenecektir.
 */
export const READY_SETTABLE_STATUSES: readonly RaceEntryStatus[] = ['ready', 'not_ready'];

/**
 * READY isteğinin HAM gövdesi (brief §6, §42 PHASE 3).
 *
 * Tek alan `unknown`'dır — `RaceJoinInput` ile AYNI gerekçe: gövde esbuild
 * altında doğrulanmadan gelir (CLAUDE.md kural 5), `status` çalışma anında
 * gerçekten bir sayı, dizi ya da `null` olabilir.
 */
export interface EntryReadyInput {
  /** Oyuncunun seçtiği yeni durum — `READY_SETTABLE_STATUSES`'tan biri. */
  status: unknown;
}

/** `validateEntryReady`'nin başarılı çıktısı — daraltılmış, güvenli değer. */
export interface ValidatedEntryReady {
  status: RaceEntryStatus;
}

export interface EntryReadyValidation {
  problems: string[];
  /** Sorun varsa `null`; yoksa DARALTILMIŞ değer. */
  value: ValidatedEntryReady | null;
}

/**
 * READY gövdesini doğrular ve daraltır (brief §6, §42 PHASE 3).
 *
 * **NEDEN DTO DEKORATÖRÜ YETMEZ:** CLAUDE.md kural 5 — Vitest/esbuild
 * `design:paramtypes` üretmediği için `ValidationPipe` gövdeyi HİÇ
 * doğrulamaz. `@IsIn(READY_SETTABLE_STATUSES)` yazmak gerçek bir HTTP
 * sunucusunda çalışır ama testlerde ve esbuild altında SESSİZCE atlanır;
 * bu yüzden kural burada, tek doğruluk kaynağı olarak durur.
 *
 * `problems` FIRLATMAZ, toplar — `validateRaceJoin`/`validateRaceCreation`
 * ile AYNI desen; nedeni domain hatasına çevirmek use-case'in işidir.
 */
export function validateEntryReady(input: EntryReadyInput): EntryReadyValidation {
  const problems: string[] = [];

  let status: RaceEntryStatus | null = null;
  if (typeof input.status !== 'string') {
    problems.push('Katılım durumu bir metin olmalıdır.');
  } else if (!READY_SETTABLE_STATUSES.includes(input.status as RaceEntryStatus)) {
    // `cancelled`/`waiting` burada AÇIKÇA reddedilir — sessizce yok saymak,
    // istemciye "durum değişti" dedirtip değiştirmemek olurdu.
    problems.push(`Katılım durumu şunlardan biri olmalıdır: ${READY_SETTABLE_STATUSES.join(', ')}.`);
  } else {
    status = input.status as RaceEntryStatus;
  }

  return { problems, value: status === null ? null : { status } };
}

/** `checkEntryReadyable`'ın ret nedenleri. */
export type EntryReadyRejection = 'NOT_SCHEDULED' | 'ALREADY_STARTED' | 'CANCELLED';

/**
 * READY isteğinin ŞU AN yapılıp yapılamayacağını söyler; engel yoksa `null`.
 *
 * `checkRaceJoinable` ile AYNI desen (fırlatmaz, sonuç döndürür) ve AYNI
 * gerekçe: kural DB transaction'ı olmadan tek başına test edilebilmelidir.
 * Nedeni domain hatasına çevirmek `set-entry-ready.use-case`'in işidir.
 *
 * **ZATEN İSTENEN DURUMDA OLMAK RED NEDENİ DEĞİLDİR.** İstemci aynı düğmeye
 * iki kez basarsa (ya da yanıt kaybolup istek tekrarlanırsa) sonuç aynı
 * olmalıdır — READY bir MUTASYON değil, bir DURUM BİLDİRİMİDİR ve
 * idempotenttir. Bu yüzden `checkEntryReadyable` mevcut duruma hiç bakmaz;
 * aynı değeri yeniden yazmak yalnızca gereksiz bir UPDATE olur.
 */
export function checkEntryReadyable(
  race: { status: string; startTime: Date },
  entry: { status: string | null },
  now: Date,
): EntryReadyRejection | null {
  if (race.status !== 'scheduled') {
    return 'NOT_SCHEDULED';
  }
  // Sınırda (`now === startTime`) KAPALI — `checkRaceJoinable` ile AYNI
  // kural: motorun snapshot'ı tam o anda alınır.
  if (race.startTime.getTime() <= now.getTime()) {
    return 'ALREADY_STARTED';
  }
  // `status` NULLABLE'dır (migration 0037): pratik/PvP satırları zaten
  // KOŞMUŞ yarışların kayıtlarıdır. Lobiye ait OLMAYAN bir satıra READY
  // yazmak anlamsızdır — ama bu durum pratikte `race.status` kontrolüne
  // takılır (o yarışlar `finished`'dir); yine de kural burada AÇIKÇA
  // durur, çünkü "hangi satırlara yazılabilir" sorusu yarışın durumuna
  // bırakılamayacak kadar kritiktir.
  if (entry.status === 'cancelled') {
    return 'CANCELLED';
  }
  return null;
}

/**
 * `GET /races`'in `limit` sorgu parametresini normalize eder (PHASE 3).
 *
 * **`unknown` ALIR** çünkü sorgu parametreleri her zaman METİNDİR
 * (`?limit=abc` gerçekten gelebilir) ve `@Query()` değerleri de esbuild
 * altında doğrulanmaz (CLAUDE.md kural 5).
 *
 * **HATALI GİRDİ 400 DEĞİL, VARSAYILANA DÜŞER — ve bu bilinçlidir:** bu
 * bir LİSTELEME ucudur, mutasyon değil. `limit=abc` yüzünden tüm lobiyi
 * göstermemek, kullanıcıya hiçbir şey kazandırmaz. Sessizce kırpma
 * `lobbyListMaxLimit` için de geçerlidir (bkz. o alanın doc yorumu).
 */
export function normalizeLobbyListLimit(
  raw: unknown,
  config: Pick<RaceLobbyConfig, 'lobbyListDefaultLimit' | 'lobbyListMaxLimit'>,
): number {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return config.lobbyListDefaultLimit;
  }
  const parsed = Number(raw);
  // `Number('')` 0'dır, `Number(' 12 ')` 12'dir, `Number('abc')` NaN'dır.
  // `Number.isInteger` NaN'ı ve ondalıkları birlikte eler.
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return config.lobbyListDefaultLimit;
  }
  return Math.min(parsed, config.lobbyListMaxLimit);
}
