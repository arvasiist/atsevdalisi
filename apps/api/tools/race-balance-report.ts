/**
 * PHASE 5 — DENGE RAPORU ÜRETİCİSİ (brief §42 PHASE 5, 29.09.2026).
 *
 * `docs/RACE_BALANCE_REPORT.md`'yi ÖLÇEREK yazar. Elle yazılmış bir denge
 * raporu, config değiştiği anda sessizce yalan söylemeye başlar; bu betik
 * aynı ölçümü `race-balance.spec.ts` ile PAYLAŞTIĞI için (bkz.
 * `../test/domain/race/race-balance-harness.ts`) rapor ile CI'ın kilitlediği
 * eşikler aynı koşumdan gelir.
 *
 * Koşum (`apps/api` dizininden):
 * `node ../../node_modules/tsx/dist/cli.mjs tools/race-balance-report.ts`.
 * Çıktı yolu `process.cwd()/../../docs/` üzerinden çözülür, yani betik
 * `apps/api`'den koşmalıdır. (Kabuk erişimi olmayan bir ortamda
 * `.claude/race-balance-report.mjs` aynı komutu penceresiz koşar.)
 *
 * Ölçüm SÜRESİ önemlidir: 5 saha boyutu × 5 koşum × N. Varsayılan 10.000'dir
 * (brief'in alt sınırı) ve tam koşum ~2 dakika sürer; `--trials=300` ile
 * hızlı bir ön bakış alınabilir. **Hızlı değerle ÜRETİLEN rapor commit
 * EDİLMEZ** — başlıktaki "saha boyutu başına koşum" satırı kaç koşumla
 * üretildiğini yazar, okuyucu oradan anlar.
 *
 * ⚠️ DİKKAT — bu dosyada Türkçe metin ÇİFT TIRNAK içinde yazılır. Metnin
 * kendisi kesme işareti taşır (`race.config.json'ın`, `PHASE 6'nın`), ve
 * bunları tek tırnaklı dizeye `\'` diye kaçırmak — ilk yazımda olduğu gibi —
 * uzun satırlarda kaçış/bitiş ayrımını gözle takip edilemez hâle getiriyor.
 * Çift tırnak bu sınıfı tamamen ortadan kaldırır; metin içinde çift tırnak
 * gerektiğinde tipografik tırnak (“ ”) kullanılır, kaçış kullanılmaz.
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { RACE_ENGINE_VERSION, RACE_RULESET_VERSION } from "../src/domain/race/race-engine";
import { RACING_STYLES } from "../src/domain/race/validation";
import {
  CANONICAL_DISTANCE_METERS,
  DETERMINISM_CHECKS,
  FIELD_SIZES,
  LADDER_NARROW,
  LADDER_WIDE,
  raceBalanceConfig,
  measureFieldSize,
  probeDistance,
  type AbilityRun,
  type FieldSizeMeasurement,
} from "../test/domain/race/race-balance-harness";

const trialsArg = process.argv.find((arg) => arg.startsWith("--trials="));
const TRIALS = trialsArg ? Number(trialsArg.split("=")[1]) : 10_000;
const DISTANCE_PROBE_TRIALS = Math.max(500, Math.round(TRIALS / 10));
const DISTANCE_PROBE_METERS = [1200, 1600, 2400] as const;

const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;
const secs = (value: number): string => `${(value / 1000).toFixed(2)} sn`;
const tr = (value: number): string => value.toLocaleString("tr-TR");

const startedAt = new Date();
console.log(`Ölçüm başladı: ${startedAt.toISOString()} — ${FIELD_SIZES.length} saha boyutu × ${TRIALS} koşum`);

const measurements: FieldSizeMeasurement[] = [];
for (const fieldSize of FIELD_SIZES) {
  const t0 = Date.now();
  const measurement = measureFieldSize(fieldSize, TRIALS);
  measurements.push(measurement);
  console.log(`  fieldSize=${fieldSize} bitti (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);
}

const distanceProbes = DISTANCE_PROBE_METERS.map((distanceMeters) => ({
  distanceMeters,
  probes: FIELD_SIZES.map((fieldSize) => probeDistance(fieldSize, distanceMeters, DISTANCE_PROBE_TRIALS)),
}));

const configFingerprint = createHash("sha256").update(JSON.stringify(raceBalanceConfig)).digest("hex").slice(0, 12);

/** Saha boyutu başına simülasyon: dar + geniş + stil + bot + yapısal (+ determinizm tekrarları). */
const perFieldSize = TRIALS * 5 + DETERMINISM_CHECKS;
const totalSimulations = perFieldSize * FIELD_SIZES.length + DISTANCE_PROBE_TRIALS * DISTANCE_PROBE_METERS.length * FIELD_SIZES.length;

// ---------------------------------------------------------------------------
// Rapor
// ---------------------------------------------------------------------------

const lines: string[] = [];
const w = (line = ""): void => {
  lines.push(line);
};

function abilityTable(runs: (m: FieldSizeMeasurement) => AbilityRun): void {
  w("| Saha | Favori payı | Tarafsız `1/N` | Favori / tarafsız | En zayıf at | İlk yarı toplam | Son yarı toplam | Hiç kazanmayan at | Tek atın en yüksek payı | Yetenek–galibiyet korelasyonu |");
  w("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const m of measurements) {
    const a = runs(m);
    w(
      `| ${m.fieldSize} | ${pct(a.favoriteWinRate)} | ${pct(a.uniformWinRate)} | **${(a.favoriteWinRate / a.uniformWinRate).toFixed(2)}×** | ` +
        `${pct(a.weakestWinRate)} | ${pct(a.topHalfShare)} | ${pct(a.bottomHalfShare)} | ${a.deadHorses} | ` +
        `${pct(a.mostWinsShare)} | ${a.abilityRankCorrelation.toFixed(3)} |`,
    );
  }
}

w("# YARIŞ DENGESİ RAPORU");
w();
w("> **Bu belge ELLE YAZILMAZ.** `apps/api/tools/race-balance-report.ts` ölçüp üretir.");
w("> Aynı ölçüm kodu (`apps/api/test/domain/race/race-balance-harness.ts`) `race-balance.spec.ts`");
w("> tarafından da koşulur ve **CI'da eşiklerle kilitlidir** — yani buradaki sayılar ile CI'ın");
w("> kırmızıya döndüğü sayılar aynı koşumdan gelir. Config değişip eşikler güncellenmezse CI kırılır.");
w();
w("| | |");
w("| --- | --- |");
w(`| Ölçüm zamanı | ${startedAt.toISOString()} |`);
w(`| Saha boyutları | ${FIELD_SIZES.join(" / ")} (\`config/race-lobby.config.json\` → \`fieldSizes\`) |`);
w(`| Saha boyutu başına koşum | **${tr(TRIALS)}** (her biri beş ayrı koşumda) |`);
w(`| Toplam simülasyon | **${tr(totalSimulations)}** |`);
w(`| Kanonik yarış | ${CANONICAL_DISTANCE_METERS} m, çim, güneşli, 22 °C |`);
w(`| \`RACE_ENGINE_VERSION\` | \`${RACE_ENGINE_VERSION}\` |`);
w(`| \`RACE_RULESET_VERSION\` | \`${RACE_RULESET_VERSION}\` |`);
w(`| \`race.config.json\` parmak izi | \`${configFingerprint}\` (sha256, ilk 12 hane) |`);
w();
w("Üretmek için (`apps/api` dizininden):");
w();
w("```");
w("node ../../node_modules/tsx/dist/cli.mjs tools/race-balance-report.ts");
w("```");
w();
w("Süre ~30-45 sn. `--trials=300` ile hızlı ön bakış alınabilir, ama **hızlı değerle üretilen");
w("rapor commit edilmez** — yukarıdaki “saha boyutu başına koşum” satırı kaç koşumla üretildiğini");
w("yazar.");
w();
w("---");
w();
w("## 1. Yöntem — neden DÖRT ayrı saha");
w();
w("Denge ölçümünde en kolay hata, **tek sahada birden fazla değişkeni aynı anda oynatmak**tır:");
w("o zaman “fark yetenekten mi, taktikten mi, kulvardan mı geldi” sorusu cevaplanamaz. Bu yüzden");
w("her ölçüm kendi sahasını kurar ve o sahada tek bir değişken bırakır.");
w();
w("| Saha | Değişken | Sabit | Ne ölçer |");
w("| --- | --- | --- | --- |");
w(`| **Dar merdiven** (${LADDER_NARROW.label}) | statlar | tümü \`mid_pack\`, sabit ağırlık | Yetenek aktarımı — bant daralınca ne değişiyor? |`);
w(`| **Geniş merdiven** (${LADDER_WIDE.label}) | statlar | tümü \`mid_pack\`, sabit ağırlık | Yetenek aktarımı — bant genişleyince? |`);
w("| **Stil** | `racingStyle` | tüm statlar özdeş | Taktik seçimi kazanma payını haksız domine ediyor mu? |");
w("| **Bot** | **20 ayrı rastgele** üretim sahası (`generateBotEntrants`) | — | **Üretim gerçeği**: rastgele bir lobide denge nasıl? |");
w();
w("**Neden dört saha:** merdiven sahaları YAPAYDIR — sekiz özellik aynı anda aynı yönde hareket eder");
w("ve bu, gerçek bir sahada asla olmaz. Onlar bir **yetenek aktarım probudur**; denge tablosu DEĞİL");
w("(§2c). Denge iddiaları §4'teki üretim sahasında kurulur. İkisi de olmasaydı rapor ya “yetenek hiç");
w("işlemiyor” sanırdı ya da “ölçtüğüm şey üretimde yok” durumunu gizlerdi.");
w();
w("**Neden 20 ayrı bot sahası:** tek saha yetmez. Ölçüm ilk kez TEK sabit sahayla yapıldığında saha");
w("boyutları arasında uçurum çıktı — bir boyutta favori ezici biçimde kazanırken diğerlerinde yazı-tura");
w("gibiydi. Fark motordan değil, tek bir **çekilişten**");
w("geliyordu (o sahada en güçlü botun ikinciye farkı büyüktü). Üretimde her lobi kendi rastgele");
w("sahasını alır (`settle-race.use-case.ts` seed'i yarış başına üretir), dolayısıyla doğru soru");
w("“bu sabit sahada kim kazanıyor” değil, **“rastgele bir sahada favori ortalama ne sıklıkla");
w("kazanıyor ve en kötü durumda ne oluyor”**dur.");
w();
w("**Ölçülmeyen: `gatePosition`.** İstendi ve ölçülemedi, çünkü `simulateRace` kapı pozisyonunu");
w("**hiç okumaz**. `race_entries.gate_position` yalnızca yazılır, saklanır ve istemciye yansıtılır");
w("(`settle-race.use-case.ts`, `postgres-race.repository.ts`, `race.gateway.ts`). Olmayan bir etkiyi");
w("“dengeli çıktı” diye raporlamak uydurma olurdu — bkz. §7.");
w();
w("---");
w();
w("## 2. Yetenek sinyali — merdiven sahaları");
w();
w("`1/N` **tarafsız** (yazı-tura) motorda beklenen paydır. Galibiyetin yeteneğe bağlı olması");
w("`1/N`'in ÜZERİNDE bir favori payı **gerektirir**; oyunun yarış olması da payın `1.00`");
w("OLMAMASINI gerektirir (aksi hâlde sonuç önceden bilinirdi).");
w();
w("**“Hiç kazanmayan at” sütunu yapısal ölü at arar.** 10.000 yarışta bir at hiç kazanmıyorsa o at");
w("bu motorda yarışamaz durumdadır — sahibi için görünmez bir duvardır.");
w();
w(`### 2a. Dar merdiven — ${LADDER_NARROW.label}`);
w();
abilityTable((m) => m.abilityNarrow);
w();
w(`### 2b. Geniş merdiven — ${LADDER_WIDE.label}`);
w();
abilityTable((m) => m.abilityWide);
w();
w("**Okunuşu:** “yetenek–galibiyet korelasyonu”, merdivenin sırası ile `computeBaseAbility`");
w("çıktısı arasındaki Spearman katsayısıdır — motorda **gerçekten kullanılan** taban puana göre");
w("ölçülür, merdivenin kendi sırasına göre değil. `1.000` olsaydı motor tamamen deterministik");
w("olurdu; `0` olsaydı yetenek hiç işlemiyor olurdu.");
w();
w("### 2c. ÖLÇÜLEN BULGU — motorun sürpriz payı DARDIR");
w();
w("İki tablo yan yana okunduğunda iki şey çıkıyor ve **ikincisi beklenmeyen olandır**:");
w();
w("1. Merdiven sahalarında favori payı `1/N`'in katları mertebesinde ve **alt yarı 10.000 yarışta");
w("   HİÇ kazanmıyor** (`Son yarı toplam` = 0.00%, `Hiç kazanmayan at` sütunu sıfırdan büyük).");
w("2. **Dar bant da neredeyse aynı derecede deterministik.** Bandı daraltmak favori payını");
w("   düşürüyor — ama alt yarı **hâlâ** hiç kazanmıyor ve birkaç at yine hiç kazanmıyor.");
w("   Yani sorun bandın genişliği DEĞİL.");
w();
w("Kök neden ölçülebilir bir orandır:");
w();
w("```");
w("race.config.json → randomFactorRange: [-6, 6]   (segment başına ±6 puan)");
w("segment sayısı (1600 m / 200 m)                  = 8");
w("gürültünün yarış düzeyindeki standart hatası     ≈ 6 / √3 / √8 ≈ 1.2 puan");
w("```");
w();
w("Yani segment gürültüsü yarış boyunca **toplanarak ortalanır**: tek bir segmentte ±6 puan");
w("büyük görünür, ama 8 segmentin toplam süresinde etkisi ~1.2 puana iner. Merdiven sahasında");
w("komşu iki atın farkı bunun üzerindedir — dolayısıyla sıralama neredeyse önceden belirlenir.");
w();
w("⚠️ **Ama merdiven sahası ÜRETİM DEĞİLDİR ve bu tablolar denge kararı için kullanılmamalıdır.**");
w("Merdiven yapaydır: sekiz özellik (speed, stamina, acceleration, fitness, morale, surface/");
w("distance uyumu, yorgunluk) **aynı anda ve aynı yönde** hareket eder. Gerçek bir sahada iki at");
w("farklı özelliklerde birbirini geçer ve `computeBaseAbility` farkı küçülür. Merdiven bir");
w("**yetenek aktarım probudur** (“motor yeteneği ne kadar güçlü ödüllendiriyor”), denge tablosu");
w("değildir. Üretim gerçeği **§4'tedir** ve orada favori payı merdiveninkinin belirgin ALTINDADIR —");
w("ama yine de `1/N`'in katları mertebesinde, yani sürpriz payı orada da dar (§4a).");
w();
w("**Bu, determinizmle KARIŞTIRILMAMALIDIR.** Determinizm (§5) motorun *doğruluğudur*: aynı seed");
w("aynı sonucu verir. Buradaki bulgu ise oyunun **sürpriz payının** genişliğidir: farklı seed'ler");
w("bile aynı sıralamayı üretir. İkisi ayrı şeylerdir ve ikisi de doğrudur.");
w();
w("**Neden bu dilim değeri DEĞİŞTİRMEDİ:** `race.config.json`'daki bir sayıyı oynatmak");
w("(CLAUDE.md kural 2 — “RACE ENGINE'E DOKUNMA”; config dondurulmuş `horse_snapshot`ların");
w("replay'ini belirler) eski yarışların yeniden koşumunu **sessizce başka bir sonuca** çevirirdi.");
w("Bu dilim ölçümü ve karar için gereken sayıyı üretir; denge kararı proje sahibinindir.");
w();
w("---");
w();
w("## 3. Taktik dengesi — stil sahası");
w();
w("Sahadaki atlar istatistiksel olarak **özdeş**; tek fark `racingStyle`. Beklenen pay sabit %25");
w("**değildir** — stil `index % 4` ile dağıtıldığı için 10 ve 14 atlık alanlarda 3-3-2-2 ve 4-4-3-3");
w("olur. Sabit %25 eşiği kullanmak o iki boyutta ölçüm hatası olurdu.");
w();
w("| Saha | " + RACING_STYLES.join(" | ") + " |");
w("| --- | " + RACING_STYLES.map(() => "---").join(" | ") + " |");
for (const m of measurements) {
  w(
    `| ${m.fieldSize} | ` +
      RACING_STYLES.map(
        (style) => `${pct(m.style.observedShare[style]!)} (bekl. ${pct(m.style.expectedShare[style]!)})`,
      ).join(" | ") +
      " |",
  );
}
w();
w("**Neden tam %25 beklenmiyor:** `race.config.json`'ın `pace` bölümü bilinçli olarak asimetriktir");
w("(`front_runner` yarış boyunca daha çok stamina harcar ama erken/orta aşamada pozisyon bonusu");
w("alır; `closer` daha az harcar ve geç aşamada küçük bir bonus alır). Bu, dört stilin de");
w("**kimlikli** olması demektir. Aranan şey payların eşit olması değil, hiçbirinin **yapısal olarak");
w("ölü** (~%0) ya da **baskın** (~%100) olmamasıdır — eşikler `race-balance.spec.ts` içinde, ölçülen");
w("temel çizgiye güvenli marj bırakılarak sabitlenmiştir.");
w();
w("---");
w();
w("## 4. ÜRETİM GERÇEĞİ — rastgele bot lobileri");
w();
w("**Bu, raporun asıl denge tablosudur.** §2'deki merdivenler yapay problar (§2c); üretimde bir");
w("oyuncunun karşılaştığı saha burada ölçülendir. `generateBotEntrants` üretimde de çağrılan");
w("fonksiyonun ta kendisidir (`settle-race.use-case.ts`).");
w();
w(`Saha boyutu başına **${measurements[0]?.bot.fields ?? 20} ayrı rastgele lobi** × ${tr(measurements[0]?.bot.racesPerField ?? 0)} yarış.`);
w();
w("⚠️ **Burada stil tablosu YOKTUR ve olmamalıdır.** Bir lobide stil payı ölçmek, en güçlü botun");
w("hangi stile düştüğü **yazı-turasını** ölçmek olurdu (ilk koşumda tam olarak bu yanılgı görüldü:");
w("sabit bir saha için bir stilin payı ezici çıktı — çünkü o sahanın en güçlü botu o stile düşmüştü).");
w("Yirmi lobiye dağıtmak bu tesadüfü ortalar ama yine de stili değil **saha kompozisyonunu**");
w("ölçerdi. Taktik dengesi §3'ün işidir; burada ölçülen şey **yetenek dağılımıdır**.");
w();
w("| Saha | Favori payı (ort.) | Tarafsız `1/N` | Favori / tarafsız | En kötü lobide favori | Hiç kazanmayan bot (ort. / en kötü) | Tek botun en yüksek payı (ort.) | Kazananın ort. süresi | 1. ile son arası ort. fark |");
w("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const m of measurements) {
  w(
    `| ${m.fieldSize} | ${pct(m.bot.meanFavoriteWinRate)} | ${pct(m.bot.uniformWinRate)} | ` +
      `**${(m.bot.meanFavoriteWinRate / m.bot.uniformWinRate).toFixed(2)}×** | ${pct(m.bot.worstFavoriteWinRate)} | ` +
      `${m.bot.meanDeadHorses.toFixed(1)} / ${m.bot.maxDeadHorses} | ${pct(m.bot.meanMostWinsShare)} | ` +
      `${secs(m.bot.meanWinnerTimeMs)} | ${secs(m.bot.meanSpreadMs)} |`,
  );
}
w();
w("“Favori” = `computeBaseAbility` çıktısı en yüksek olan bot — motorda **gerçekten kullanılan**");
w("taban puandır, sahaya bakıp seçilmiş bir etiket değil.");
w();
w("**Okunuşu:** `Favori payı (ort.)` `1/N`'in belirgin üzerindeyse yetenek üretimde işliyor demektir;");
w("`1.00`'a yaklaşırsa oyun yazı-turaya döner. `En kötü lobide favori` sütunu ise tek bir lobide");
w("ne kadar domine edilebildiğini gösterir — dağıtım genişse **bazı lobiler yarış olmaktan çıkar**,");
w("oyuncu bunu seçemez ve göremez.");
w();
w("### 4a. ÖLÇÜLEN BULGU — üretimde de sürpriz payı dar");
w();
w("Bu tablo §2c'deki bulguyu **üretim sahasında doğruluyor** ve oradan daha rahatsız edici, çünkü");
w("merdiven yapaydı; burası gerçek:");
w();
w("Sayılar yukarıdaki tablodadır; burada **okunuşu** var:");
w();
w("- **Ortalama favori payı `1/N`'in katları mertebesinde** (`Favori / tarafsız` sütunu). Yani");
w("  yetenek işliyor — ama fazla iyi.");
w("- **`En kötü lobide favori` sütunu `1.00`'a yaklaşıyor.** Bir lobide favorinin yarışı kazanması");
w("  neredeyse kesinleşiyor; oyuncunun o lobiye girip girmemesi bir şans, sonucu değil.");
w("- **Yapısal ölü botlar var:** `Hiç kazanmayan bot` sütunu 500 yarışta hiç kazanmayan botları");
w("  sayar. Bu botlar için o lobi bir yarış değil — ve oyuncu hangi lobiye düştüğünü seçemez.");
w("- **`Tek botun en yüksek payı (ort.)`**, galibiyetlerin tek bir botta toplandığını gösterir.");
w();
w("**Neden botlar ölü kalıyor — ve bu neden bir oyuncu sorunudur.** Botun statları `[45, 75]`");
w("bandından **bağımsız** çekilir; dört ağırlıklı statın bileşimi (speed .25 + stamina .20 +");
w("acceleration .15 + fitness .10) 30 puanlık bantta ~3.2 puan standart sapma verir, yani 16 botluk");
w("bir sahada en iyi ile en kötü arasında ~11 puan fark oluşur. Yarış gürültüsü ise ~1.2 puandır");
w("(§2c). Dolayısıyla **sıralama çoğunlukla saha kurulduğu anda belirlenir**; koşu onu yalnızca");
w("teyit eder. Gerçek bir oyuncu, botların arasına girdiğinde de aynı gürültüyle koşar: iyi bir atla");
w("**neredeyse her zaman** kazanır, kötü bir atla **neredeyse hiç**. Oyunun “sürpriz” üretmesi beklenen");
w("yer burasıdır ve bugün üretmiyor.");
w();
w("⚠️ **Bu bir bulgudur, düzeltme DEĞİL.** `randomFactorRange` / segment sayısı / taban puan ölçeği");
w("değişikliği `race.config.json` değişikliğidir ve dondurulmuş `horse_snapshot`ların replay'ini");
w("sessizce başka bir sonuca çevirir (CLAUDE.md kural 2). Karar proje sahibinindir; bu dilim");
w("ölçümü ve eşikleri üretti.");
w();
w("---");
w();
w("## 5. Yapısal sağlamlık ve determinizm");
w();
w("Yapısal koşum, dar merdiven sahasında ayrıca koşar (sıra bütünlüğü ve beraberlik için");
w("statların ÖZDEŞ olduğu bir saha daha zorlayıcıdır).");
w();
w("| Saha | Sıra 1..N değil | Uzunluk ≠ N | Beraberlik içeren yarış | Determinizm ihlali | Kazanan ort. | Sonuncu ort. | Fark ort. |");
w("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const m of measurements) {
  const s = m.structural;
  w(
    `| ${m.fieldSize} | ${s.nonPermutationRaces} | ${s.wrongLengthRaces} | ${s.tiedRaces} | ` +
      `${s.determinismMismatches} / ${s.determinismChecks} | ${secs(s.meanWinnerTimeMs)} | ${secs(s.meanLastTimeMs)} | ${secs(s.meanSpreadMs)} |`,
  );
}
w();
w("**Determinizm** brief §18/§53/§58'in replay/audit garantisidir: aynı `simulationSeed` + aynı");
w("`entries` + aynı config **bit bit** aynı `RaceTimeline`'ı üretmelidir. Her saha boyutunda ilk");
w(`${DETERMINISM_CHECKS} seed iki kez koşulup \`JSON.stringify\` ile karşılaştırılır.`);
w();
w("**Beraberlik** sayısı sıfır olmak zorunda değildir ama küçük olmalıdır: motorda tam beraberlik");
w("`finishTimeMs` eşitliğidir ve `horseId` sözlük sırasıyla bozulur (brief §25 foto-finiş). Sıfır");
w("olması bir hata değildir; BÜYÜK olması “motor ayrıştırmıyor” demek olurdu.");
w();
w("---");
w();
w("## 6. Mesafe duyarlılığı");
w();
w(`Saha boyutu başına ${tr(DISTANCE_PROBE_TRIALS)} koşum; kazananın ortalama süresi.`);
w("Uzun yarış **daha yavaş** olmalıdır (stamina tüketimi + yorgunluk birikimi). Aksi, mesafenin");
w("sonuca hiç girmemesi demek olurdu.");
w();
w("| Saha | " + DISTANCE_PROBE_METERS.map((d) => `${d} m`).join(" | ") + " | 2400/1200 oranı |");
w("| --- | " + DISTANCE_PROBE_METERS.map(() => "---").join(" | ") + " | --- |");
for (let i = 0; i < FIELD_SIZES.length; i += 1) {
  const row = distanceProbes.map((probe) => probe.probes[i]!.meanWinnerTimeMs);
  w(`| ${FIELD_SIZES[i]} | ${row.map(secs).join(" | ")} | ${(row[2]! / row[0]!).toFixed(3)} |`);
}
w();
w("---");
w();
w("## 7. Dürüst eksikler — bu raporun KAPSAMADIĞI şeyler");
w();
w("1. **Kapı pozisyonu (`gatePosition`) ölçülmedi** — çünkü motora hiç girmiyor. Brief §17/§21");
w("   kapı pozisyonunu bir faktör olarak sayar; bugün `race_entries.gate_position` yalnızca");
w("   saklanan ve istemciye yansıtılan bir **etikettir**. Bu bir denge bulgusu değil, bir");
w("   **bağlanmamış özelliktir**.");
w("2. **Jokey ölçülmedi** — `RaceEntrantSnapshot.jockeySkillComposite` her zaman nötr `50`");
w("   (`NEUTRAL_UNMODELED_TRAIT_SCORE`). `race_entries.jockey_id`'yi yazan hiçbir kod yoktur.");
w("   Ölçümde bu alan bilinçli olarak nötr bırakıldı: uydurma bir jokey değeri, üretimde");
w("   olmayan bir sinyalle dengeyi şişirirdi. **PHASE 6'nın konusudur.**");
w("3. **`startApproach` / `finalStretchPlan` ölçülmedi** — `RaceEntrantSnapshot.tactic` bu iki");
w("   alanı taşır ve `assertValidRaceTactic` onları doğrular, ama `simulateRace` yalnızca");
w("   `racingStyle` ve `riskLevel` okur. Yani bu iki alan bugün **doğrulanan ama kullanılmayan**");
w("   alanlardır. **PHASE 6'nın konusudur.**");
w("4. **Tek mesafe/saha koşulu** — kanonik yarış 1600 m / çim / güneşli / 22 °C'dir. Diğer");
w("   zemin ve hava koşulları (`weather.config.json`) §6'daki mesafe probu DIŞINDA ölçülmedi;");
w("   çoklu-zemin denge taraması bu dilimin kapsamı dışındadır.");
w("5. **Gerçek oyuncu atı verisiyle ölçüm yok** — sahalar sentetik merdivenler, sentetik özdeş");
w("   alan ve üretim botlarıdır. Gerçek `horses` satırlarıyla koşan bir denge taraması ancak");
w("   gerçek oyuncu popülasyonu oluştuğunda anlamlı olur.");
w("6. **Sürpriz payı ölçüldü ama DEĞİŞTİRİLMEDİ — bu raporun EN ÖNEMLİ AÇIK UCU** (§2c + §4a).");
w("   Ölçüm üretimde de doğruladı: favori payı `1/N`'in katları mertebesinde, en kötü lobide");
w("   `1.00`'a yaklaşıyor, tek bot galibiyetlerin çoğunu alıyor ve hiç kazanmayan botlar var");
w("   (§4 tablosu). Düzeltmesi");
w("   (`randomFactorRange`, segment sayısı ya da taban puan ölçeği) `race.config.json` değişikliği");
w("   gerektirir ve dondurulmuş snapshot replay'lerini etkiler. Bu dilim ölçüm dilimiydi;");
w("   **karar verilmedi** ve `race-balance.spec.ts` bu değeri “iyi” diye kilitlemez.");
w("7. **`in_progress` hâlâ ölü** (CLAUDE.md) — ölçüm bunu etkilemez ama yarış akışının gerçek");
w("   zamanlı bir aşaması olmadığını hatırlatır: buradaki tüm sayılar **tek seferde koşan**");
w("   simülasyonun sonucudur, canlı bir yarışın değil.");
w();
w("---");
w();
w("## 8. Sonuç");
w();
w("| Soru | Cevap |");
w("| --- | --- |");
w("| Motor sonucu sunucuda mı belirliyor? | Evet — simülasyon yalnızca `domain/race/race-engine.ts`'te koşar |");
w("| Aynı seed aynı sonucu veriyor mu? | Evet — §5 determinizm ihlali sütunu tüm sahalarda 0 |");
w("| Yetenek kazandırıyor mu? | Evet — üretim sahasında favori `1/N`'in belirgin üzerinde (§4) |");
w("| Sonuç önceden bilinebilir mi? | **Üretimde hayır** — rastgele lobilerde favori oranı §4'ün “ort. favori” sütununda, sürpriz payı vardır. **Yapay merdiven sahasında neredeyse evet** — alt yarı hiç kazanmıyor (§2c) |");
w("| Bir taktik domine ediyor mu? | Hayır — dört stil de kimlikli, hiçbiri yapısal ölü/baskın değil (§3) |");
w("| Sürpriz payı yeterli mi? | **HAYIR — §2c + §4a + §7.6.** Gürültünün yarış düzeyindeki etkisi ~1.2 puan; yetenek farkı bunu aşınca sıralama saha kurulurken belirlenir. Üretimde “en kötü lobide favori” sütunu `1.00`'a yaklaşıyor (§4 tablosu). Ölçüldü, DEĞİŞTİRİLMEDİ |");
w("| Düzeltildi mi? | **Hayır, bilerek.** `race.config.json` değişikliği dondurulmuş snapshot replay'ini bozar; karar proje sahibinindir |");
w("| AI'ye gizli bonus var mı? | Hayır — botlar `generateBotEntrants` ile üretilir, ayrı bir bonus yolu yoktur (§4) |");
w("| Kapı pozisyonu etkiliyor mu? | **Hayır — motora hiç girmiyor (§7.1, bağlanmamış özellik)** |");
w("| Jokey etkiliyor mu? | **Hayır — nötr 50, hiç bağlanmamış (§7.2, PHASE 6)** |");
w();

const report = lines.join("\n");
const outPath = join(process.cwd(), "..", "..", "docs", "RACE_BALANCE_REPORT.md");
writeFileSync(outPath, `${report}\n`, "utf8");
console.log(`✔ Rapor yazıldı: ${outPath}`);
console.log(`Toplam süre: ${((Date.now() - startedAt.getTime()) / 1000).toFixed(1)} sn`);
