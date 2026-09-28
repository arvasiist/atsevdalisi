/**
 * Race domain'ine özgü hata tipleri (brief §6, §14.2 — oyuncu taktik
 * kararları: racingStyle/riskLevel/startApproach/finalStretchPlan).
 */

/**
 * FAZ 1 wiring, sekizinci dilim (Pratik Yarış) — `register-player.dto.ts`
 * üstündeki genel "hiçbir tek katmana güvenme" ilkesiyle AYNI gerekçe
 * (docs/SECURITY.md §2). NOT — bu, `InvalidTrainingInputError`/
 * `InvalidCareInputError`'ın ÇÖZDÜĞÜ türden bir "sessizce 500'e düşme"
 * riski DEĞİL: `racingStyle`/`riskLevel` zaten `config/race.config.json`
 * lookup'larında (`domain/race/overtaking.ts` → `courageByRiskLevel`,
 * `assignInitialLane`) güvenli varsayılanlarla ÇÖKMEDEN geri düşüyor, ve
 * `startApproach`/`finalStretchPlan` şu an motor tarafından HİÇ
 * okunmuyor (henüz kullanılmayan, taşınan alanlar). Buradaki asıl amaç,
 * DTO doğrulaması bir şekilde atlanırsa geçersiz/anlamsız bir taktik
 * değerinin sessizce veritabanına (`race_entries.horse_snapshot`)
 * yazılmasını önlemek — davranışsal bir çökme değil, veri bütünlüğü
 * garantisi.
 */
export class InvalidRaceTacticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRaceTacticError';
  }
}

/**
 * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`
 * (tam alan replay) verilen `raceId` ile eşleşen bir `races` satırı yoksa
 * fırlatılır. `HorseNotFoundError`/`PlayerNotFoundError` ile AYNI "bulunamayan
 * kaynak" kategorisi, 404.
 */
export class RaceNotFoundError extends Error {
  constructor(raceId: string) {
    super(`Yarış bulunamadı: ${raceId}`);
    this.name = 'RaceNotFoundError';
  }
}

/**
 * Proje sahibinin açık talebi (27.09.2026) — "hazır olan kişiler
 * yarışabilsinler". `domain/race/readiness.ts`'teki `checkRaceReadiness`
 * `ready: false` döndüğünde fırlatılır.
 *
 * `HorseNotReadyForTrainingError` ile AYNI gerekçeyle 409 Conflict
 * (`http-exception.filter.ts`): bu GEÇİCİ bir engeldir — dinlenme/bakım
 * ile düzelir, kalıcı bir doğrulama hatası DEĞİLDİR (400 olmaz).
 */
export class HorseNotReadyToRaceError extends Error {
  constructor(public readonly reason: 'HORSE_NOT_ACTIVE' | 'INSUFFICIENT_HEALTH' | 'HORSE_TOO_TIRED' | 'INSUFFICIENT_ENERGY') {
    super(`At yarışa hazır değil: ${reason}`);
    this.name = 'HorseNotReadyToRaceError';
  }
}

/**
 * `POST /horses/:id/practice-race` gövdesindeki `tierId` config'deki
 * hiçbir kademeyle eşleşmiyorsa fırlatılır. `InvalidRaceTacticError` ile
 * AYNI kategori: gerçek bir DOĞRULAMA hatasıdır (kalıcı — aynı isteği
 * tekrarlamak düzeltmez), bu yüzden 400.
 *
 * NEDEN DOMAIN'DE: DTO'nun `@IsIn(...)` kontrolü statik bir liste ister,
 * oysa kademe kimlikleri `config/economy.config.json`'dan gelir. Ayrıca
 * esbuild altında DTO doğrulaması atlanabildiğinden (bkz. CLAUDE.md) bu
 * kontrol ZATEN domain katmanında olmak zorundadır.
 */
export class InvalidRaceTierError extends Error {
  constructor(public readonly tierId: string) {
    super(`Geçersiz yarış kademesi: ${tierId}`);
    this.name = 'InvalidRaceTierError';
  }
}

/**
 * Oyuncunun oluşturduğu yarış (brief §1-§7, §42 PHASE 1) — gövdedeki
 * alanlardan en az biri `config/race-lobby.config.json` sınırlarının
 * dışındaysa fırlatılır. 400 (kalıcı doğrulama hatası —
 * `InvalidRaceTacticError`/`InvalidRaceTierError` ile AYNI kategori).
 *
 * **NEDEN BİR DİZİ TAŞIR, TEK MESAJ DEĞİL:** yarış oluşturma bir FORM
 * işlemidir ve dokuz alanın birden fazla olanı aynı anda hatalı olabilir.
 * İlk hatada durmak, kullanıcıyı "düzelt, gönder, ikinci hatayı gör,
 * düzelt, gönder…" döngüsüne sokardı. Bu yüzden `validateRaceCreation`
 * (bkz. `lobby.ts`) TÜM sorunları toplar — `validateRaceTiers`'ın (bkz.
 * `prize.ts`) "fırlatma, sonuç döndür" deseniyle AYNI.
 *
 * **NEDEN DOMAIN'DE, DTO'DA DEĞİL:** DTO dekoratörleri (`@IsIn`, `@Min`,
 * `@Max`) Vitest/esbuild altında SESSİZCE atlanır — `design:paramtypes`
 * üretilmediği için `ValidationPipe` gövdeyi hiç doğrulamaz (CLAUDE.md
 * kural 5). Yani DTO TEK BAŞINA bir kapı DEĞİLDİR; asıl kapı burasıdır,
 * dekoratörler yalnızca gerçek bir HTTP sunucusunda çalışan ikinci
 * katmandır.
 */
export class InvalidRaceDefinitionError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Geçersiz yarış tanımı: ${problems.join(' ')}`);
    this.name = 'InvalidRaceDefinitionError';
  }
}

/**
 * `RaceLobbyConfig.maxOpenRacesPerPlayer` tavanı aşıldı — 409 (bkz.
 * `ErrorCode.RaceLimitReached`'in doc yorumu: engelleyen şey isteğin
 * biçimi değil, oyuncunun MEVCUT açık yarışlarının sayısıdır).
 *
 * `SocialLimitReachedError`/`DailyGiftLimitReachedError` ile AYNI sınıf
 * savunma: bu tavan olmadan tek bir hesap saniyeler içinde binlerce yarış
 * kaydı açabilir — hem depolama hem de "keşif listesini çöple doldurma"
 * (brief §26) vektörü.
 */
export class RaceLimitReachedError extends Error {
  constructor(public readonly limit: number) {
    super(`Aynı anda en fazla ${limit} açık yarış oluşturabilirsiniz.`);
    this.name = 'RaceLimitReachedError';
  }
}

/**
 * Katılım isteğinin gövdesi geçersiz (PHASE 1b) — `horseId` UUID değil,
 * taktik/risk bilinen bir değer değil. 400 (kalıcı doğrulama hatası,
 * `InvalidRaceDefinitionError` ile AYNI kategori).
 *
 * `problems` dizisi `InvalidRaceDefinitionError` ile AYNI gerekçeyle
 * taşınır: katılım formu da birden fazla alanı aynı anda hatalı
 * gönderebilir ve kullanıcı hepsini TEK yanıtta görmelidir.
 *
 * NEDEN AYRI BİR TİP: `InvalidRaceDefinitionError`'ın mesajı "Geçersiz
 * yarış tanımı" diye başlar ve `POST /races`'e aittir; katılımda aynı
 * metni görmek yanıltıcı olurdu.
 */
export class InvalidRaceJoinInputError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Geçersiz katılım isteği: ${problems.join(' ')}`);
    this.name = 'InvalidRaceJoinInputError';
  }
}

/**
 * At, isteği yapan oyuncuya ait değil (403). `MareNotOwnedError`
 * (`domain/breeding/errors.ts`) ile AYNI sınıf: bu bir YETKİ sorunudur,
 * isteğin biçimi kusursuzdur — 400 değil 403.
 *
 * NEDEN GEREKLİ: at kimliği bu uçta URL parametresi DEĞİL, GÖVDEDEDİR.
 * `HorseOwnerGuardByParam` yalnızca `:id` parametresini korur, dolayısıyla
 * sahiplik kontrolü burada AÇIKÇA yapılmak zorundadır — aksi hâlde bir
 * oyuncu başkasının atını ücretli bir yarışa sokup sahibini borçlandırabilir.
 */
export class HorseNotOwnedError extends Error {
  constructor(public readonly horseId: string) {
    super(`Bu at size ait değil: ${horseId}`);
    this.name = 'HorseNotOwnedError';
  }
}

/**
 * Yarışa katılma penceresi kapalı (409) — yarış `scheduled` değil ya da
 * başlangıç zamanı geçmiş. Ret nedeni `RaceJoinRejection`'dan gelir
 * (`domain/race/lobby.ts` → `checkRaceJoinable`).
 *
 * `RaceLimitReachedError` ile AYNI gerekçeyle 409: istek biçimsel olarak
 * kusursuz, engelleyen şey yarışın DURUMUDUR.
 */
export class RaceNotJoinableError extends Error {
  constructor(public readonly reason: 'NOT_SCHEDULED' | 'ALREADY_STARTED') {
    super(reason === 'ALREADY_STARTED' ? 'Yarış başladı, artık katılınamaz.' : 'Bu yarış katılıma açık değil.');
    this.name = 'RaceNotJoinableError';
  }
}

/**
 * Yarışın GERÇEK OYUNCU kontenjanı doldu (409) — brief §6 "MAX_PLAYERS".
 * Kalan at koltukları yapay zekâyla doldurulduğu için (brief §6: "12 atlık
 * yarış = 8 oyuncu + 4 AI horse") bu, yarışın dolduğu anlamına GELMEZ;
 * dolan şey oyuncu kontenjanıdır ve `races.max_players` ile sınırlıdır.
 */
export class RaceFullError extends Error {
  constructor(public readonly maxPlayers: number) {
    super(`Yarışın oyuncu kontenjanı doldu (en fazla ${maxPlayers} oyuncu).`);
    this.name = 'RaceFullError';
  }
}

/**
 * Oyuncu bu yarışa zaten katılmış (409) — brief §2 gereği katılım ücreti
 * KİŞİ BAŞINA alınır, at başına değil; bir oyuncunun iki atla girip
 * havuzu kendi lehine şişirmesi engellenir.
 *
 * Kuralın ASIL garantisi veritabanındadır: `race_entries_race_player_uq`
 * kısmi tekil indeksi (migration 0037). Bu hata, indeksin fırlatacağı
 * `23505`'i kullanıcıya 500 yerine anlamlı bir 409 olarak göstermek için
 * vardır — uygulama katmanındaki ön kontrol tek başına yeterli DEĞİLDİR
 * (iki eşzamanlı istek arasında TOCTOU penceresi kalır).
 */
export class AlreadyJoinedRaceError extends Error {
  constructor(public readonly raceId: string) {
    super('Bu yarışa zaten katıldınız.');
    this.name = 'AlreadyJoinedRaceError';
  }
}

/**
 * READY gövdesi geçersiz (400) — brief §6, §42 PHASE 3.
 * `InvalidRaceJoinInputError` ile AYNI gerekçe: gövde esbuild altında
 * doğrulanmadan gelir, kural `domain/race/lobby.ts` → `validateEntryReady`
 * içinde BAĞIMSIZ olarak durur.
 */
export class InvalidEntryReadyInputError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Geçersiz katılım durumu isteği: ${problems.join(' ')}`);
    this.name = 'InvalidEntryReadyInputError';
  }
}

/**
 * Oyuncunun bu yarışta bir katılım satırı yok (404) — READY/ileride iptal
 * uçlarının ortak ön koşulu (brief §6, §42 PHASE 3).
 *
 * **NEDEN 403 DEĞİL 404:** `HorseNotOwnedError`'un 403 olmasından AYRIŞMASI
 * bilinçlidir. Orada oyuncu VAR OLAN bir kaynağa (başkasının atına)
 * erişmeye çalışır ve reddedilir. Burada ise oyuncunun bu yarışta hiç
 * katılımı YOKTUR — yani üzerinde işlem yapılacak kaynak bulunamaz.
 * Ayrıca 403 dönmek "bu yarışta bir katılım var ama senin değil" bilgisini
 * sızdırırdı; lobide bu bilgi zaten açıktır ama uç noktanın kendisi böyle
 * bir çıkarım için zemin olmamalıdır.
 */
export class RaceEntryNotFoundError extends Error {
  constructor(public readonly raceId: string, public readonly playerId: string) {
    super('Bu yarışta size ait bir katılım bulunamadı.');
    this.name = 'RaceEntryNotFoundError';
  }
}

/**
 * READY penceresi kapalı (409) — yarış `scheduled` değil, başlangıç zamanı
 * geçmiş ya da katılım İPTAL edilmiş. Ret nedeni `EntryReadyRejection`'dan
 * gelir (`domain/race/lobby.ts` → `checkEntryReadyable`).
 *
 * `RaceNotJoinableError` ile AYNI gerekçeyle 409: istek biçimsel olarak
 * kusursuz, engelleyen şey DURUMDUR.
 */
export class RaceEntryNotReadyableError extends Error {
  constructor(public readonly reason: 'NOT_SCHEDULED' | 'ALREADY_STARTED' | 'CANCELLED') {
    super(
      reason === 'ALREADY_STARTED'
        ? 'Yarış başladı, katılım durumu artık değiştirilemez.'
        : reason === 'CANCELLED'
          ? 'Katılımınız iptal edilmiş.'
          : 'Bu yarışta katılım durumu değiştirilemez.',
    );
    this.name = 'RaceEntryNotReadyableError';
  }
}

/**
 * Yarıştan AYRILINAMAZ (brief §20 `REFUND`, §42 PHASE 4c) — yarış
 * `scheduled` değil, başlangıç zamanı geçmiş ya da katılım zaten iptal
 * edilmiş. Ret nedeni `RaceLeaveRejection`'dan gelir
 * (`domain/race/lobby.ts` → `checkRaceLeavable`).
 *
 * `RaceEntryNotReadyableError` ile AYNI gerekçeyle 409: istek biçimsel
 * olarak kusursuz, engelleyen şey DURUMDUR. Ve bu uç PARA İADE ettiği için
 * "yarış başladı" cevabının DOĞRU olması hayatidir — koşmuş bir yarıştan
 * iade edilen her kuruş, havuzdan ödül alacak diğer oyunculardan çalınmış
 * olurdu.
 */
export class RaceEntryNotLeavableError extends Error {
  constructor(public readonly reason: 'NOT_SCHEDULED' | 'ALREADY_STARTED' | 'ALREADY_CANCELLED') {
    super(
      reason === 'ALREADY_STARTED'
        ? 'Yarış başladı, artık ayrılamazsınız.'
        : reason === 'ALREADY_CANCELLED'
          ? 'Bu yarıştaki katılımınız zaten iptal edilmiş.'
          : 'Bu yarıştan ayrılamazsınız.',
    );
    this.name = 'RaceEntryNotLeavableError';
  }
}

/**
 * Katılım DAHA ÖNCE İPTAL EDİLMİŞ ve oyuncu aynı yarışa yeniden katılmaya
 * çalışıyor (409) — `POST /races/:id/join`, §42 PHASE 4c.
 *
 * **NEDEN AYRI BİR HATA (`AlreadyJoinedRaceError` YETMEZ):** ikisi FARKLI
 * durumlardır ve farklı mesajı hak eder. `AlreadyJoinedRaceError`
 * "zaten katıldınız" der; burada ise ortada AKTİF bir katılım yoktur —
 * oyuncu ayrılmıştır. Aynı hatayı dönmek "zaten katıldınız" diyerek
 * yalan söylerdi ve oyuncuyu lobide olmayan bir katılımı aramaya
 * gönderirdi.
 *
 * **YENİDEN KATILMA NEDEN ENGELLENİR:** ayrılan satır `status='cancelled'`
 * olarak KALIR (silinmez — defterle birlikte denetim izi) ve
 * `race_entries_race_player_uq` kısmi tekil indeksi (migration 0037)
 * `player_id` dolu HER satırı kapsar, durumdan bağımsız olarak. Yani bu
 * bir uygulama tercihi değil, veritabanının koyduğu kuraldır. Tercih
 * olsaydı da doğru olurdu: ayrıl-yeniden katıl döngüsü, READY durumunu
 * sıfırlamanın ve havuzu kendi lehine oynatmanın bir yolu olurdu.
 * Ayrılan oyuncunun BOŞALTTIĞI koltuk BAŞKALARINA açıktır (doluluk
 * sayımı iptal edilmiş satırları saymaz) — bu ayrım bilinçlidir.
 */
export class RaceEntryCancelledError extends Error {
  constructor(public readonly raceId: string) {
    super('Bu yarıştaki katılımınızı iptal ettiniz; aynı yarışa yeniden katılamazsınız.');
    this.name = 'RaceEntryCancelledError';
  }
}

/**
 * Ödül dağıtımı (settlement) BU DURUMDA yapılamaz (409) — §42 PHASE 13.14.
 *
 * **NEDEN 400 DEĞİL 409:** istek biçimsel olarak kusursuzdur; engel
 * yarışın DURUMUNDADIR (henüz başlamamış, zaten koşulmuş, ya da hiç
 * katılımcısı yok). `RaceNotJoinableError`/`RaceEntryNotLeavableError` ile
 * AYNI kategori.
 *
 * **BU HATA AYNI ZAMANDA İDEMPOTENCY'NİN TA KENDİSİDİR.** Settlement
 * ucu Idempotency-Key KULLANMAZ; tekrar koruması `scheduled → finished`
 * durum geçişinin kendisidir. İkinci çağrı `NOT_SCHEDULED` alır, yani
 * ikinci bir ödeme YAPISAL OLARAK imkânsızdır — yeni bir idempotency
 * altyapısı gerekmez.
 */
export class RaceNotSettleableError extends Error {
  constructor(public readonly reason: 'NOT_SCHEDULED' | 'NOT_STARTED' | 'NO_PARTICIPANTS') {
    super(
      reason === 'NOT_STARTED'
        ? 'Yarış henüz başlamadı; ödüller başlangıç saatinden sonra dağıtılır.'
        : reason === 'NO_PARTICIPANTS'
          ? 'Bu yarışa hiç oyuncu katılmadı; dağıtılacak bir ödül havuzu yok.'
          : 'Bu yarış için ödüller zaten dağıtıldı ya da yarış iptal edildi.',
    );
    this.name = 'RaceNotSettleableError';
  }
}
