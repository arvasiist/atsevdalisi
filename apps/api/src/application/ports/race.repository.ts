import type {
  PracticeRaceResult,
  PvpMatch,
  Race,
  RaceEntrantSnapshot,
  RaceEntry,
  RaceEntryStatus,
  RaceLobbyListItem,
  RaceLobbyView,
  RaceSegmentSnapshot,
  RaceSettlementResult,
  RaceStatus,
  RaceTacticInput,
  RaceTimelineView,
  RacingStyle,
  RecentRaceResultView,
  RiskLevel,
} from '@at-sevdalisi/shared-types';
import type { OnlineConfig } from '@at-sevdalisi/game-config';
import type { PlayerCommandLog } from '../../domain/race/interactive-race';

/**
 * `RaceRepository` — Application katmanının Infrastructure'a bağlandığı
 * PORT (interface), diğer repository port'larıyla AYNI desen
 * (docs/ARCHITECTURE.md §4).
 */
export interface RaceRepository {
  /**
   * FAZ 1 wiring, sekizinci dilim — Pratik Yarış (brief §6). `races` +
   * `race_entries` + `race_entry_segments` (migration 0006/0014) satırlarını
   * TEK bir transaction'da yazar (`withTransaction`, ama `SELECT ... FOR
   * UPDATE` YOK — bkz. `RunPracticeRaceUseCase` üstündeki not: bu, VAR
   * OLAN paylaşılan bir satırı güncellemek değil, TAMAMEN YENİ satırlar
   * eklemek, bu yüzden docs/SECURITY.md §5'in çözdüğü çift-harcama riski
   * burada YOK — transaction yalnızca "ya hepsi ya hiçbiri" garantisi
   * için kullanılıyor).
   *
   * Bot rakipler (`generateBotEntrants`) burada YAZILMAZ — bu metot
   * `RunPracticeRaceUseCase` tarafından ARTIK HİÇ ÇAĞRILMIYOR (bkz. dosya
   * sonundaki "Eski `savePracticeRace` metodu KALDIRILMADI" notu), bu
   * yüzden AUDIT_REPORT.md Bulgu R2 (bu oturum) düzeltmesi BURAYA
   * uygulanmadı — R2'nin çözümü (`RaceEntry.botLabel`, `horse_id` artık
   * nullable) yalnızca aşağıdaki `savePracticeRaceWithStakes`'te geçerlidir.
   */
  savePracticeRace(race: Race, entry: RaceEntry, segments: RaceSegmentSnapshot[]): Promise<void>;

  /**
   * AUDIT_REPORT.md Bulgu E1 (High, bu oturum) — `RunPracticeRaceUseCase`
   * ÖNCEDEN cüzdan mutasyonunu (`PlayerRepository.updateWithLock`) ve yarış
   * kaydını (`savePracticeRace`, yukarıdaki metot) İKİ AYRI transaction'da
   * yapıyordu: para transaction'ı commit olduktan SONRA yarış kaydı
   * BAŞARISIZ olursa (ör. bağlantı kopması), oyuncunun parası zaten
   * hareket etmiş ama hiçbir yarış kaydı YOKTUR — ve `IdempotencyInterceptor`
   * hata durumunda `pending` satırını SİLDİĞİNDEN, aynı Idempotency-Key
   * ile bir SONRAKİ deneme işlemi BAŞTAN çalıştırır (ÇİFT giriş ücreti
   * tahsilatı/ÇİFT ödül verme riski).
   *
   * Bu metot, `PostgresMarketPurchaseRepository.executePurchase` ile AYNI
   * ilkeyle (bkz. o dosyanın doc yorumu — "kendi transaction'ını yönetir"),
   * oyuncunun `players` satırını KİLİTLEMEYİ, `applyPracticeRaceStakes`
   * (saf domain fonksiyonu) ile bakiyeyi hesaplamayı, güncellenmiş satırı +
   * ledger girişlerini YAZMAYI, VE `races`/`race_entries`/
   * `race_entry_segments` satırlarını eklemeyi TEK bir Postgres
   * transaction'ında birleştirir — "ya hepsi ya hiçbiri" artık GERÇEKTEN
   * garantidir (bkz. `postgres-race.repository.spec.ts`'teki gerçek
   * Postgres'e karşı rollback testi: yarış kaydı taraf BAŞARISIZ olursa
   * bakiye de GERİ ALINIR).
   *
   * Eski `savePracticeRace` metodu KALDIRILMADI (`insertRaceRow`/
   * `insertEntryWithSegments` yardımcılarını PAYLAŞIR, `savePvpMatch`
   * hâlâ onu kullanır) — yalnızca `RunPracticeRaceUseCase` artık BUNU
   * çağırır.
   *
   * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `input.entry`/
   * `input.segments` (TEKİL, yalnızca oyuncunun atı) `input.entries`
   * (DİZİ — oyuncunun atı + `savePvpMatch`'teki AYNI desenle TÜM bot
   * rakipler) + `input.segments` (TÜM katılımcıların BİRLEŞTİRİLMİŞ
   * segmentleri, her biri KENDİ `entry.id`'sine göre filtrelenir) olarak
   * DEĞİŞTİ — tam alan (full-field) replay'in DB'den doğrudan okunabilmesi
   * için botların da artık `race_entries`/`race_entry_segments`'e
   * yazılması GEREKİYORDU (bkz. `RaceEntry.botLabel` doc yorumu,
   * `database/migrations/0025_add_race_entry_bot_support.up.sql`).
   * Dizideki İLK eleman HER ZAMAN oyuncunun kendi girişidir (`RunPracticeRaceUseCase`
   * bu sırayı garanti eder) — repository'nin kendisi bu SIRAYA bağımlı
   * DEĞİLDİR, yalnızca `RunPracticeRaceUseCase`'in dönüş değerini oluştururken
   * kullanışlıdır.
   */
  savePracticeRaceWithStakes(
    input: SavePracticeRaceWithStakesInput,
  ): Promise<SavePracticeRaceWithStakesResult>;

  /**
   * FAZ 1 wiring, on dördüncü dilim (bu oturum) — PvP Eşleştirme (brief
   * §41). `savePracticeRace` ile AYNI "ya hepsi ya hiçbiri" transaction
   * gerekçesi (satır kilitleme YOK, TAMAMEN yeni satırlar eklenir) — TEK
   * farkı, İKİ gerçek katılımcı olduğu için `race_entries`/segment
   * satırlarının İKİ SETİ ve ayrıca bir `pvp_matches` satırı yazılır
   * (bkz. `database/migrations/0018_add_pvp_matchmaking.up.sql`).
   * Botların AKSİNE (`savePracticeRace` doc yorumu), BURADA iki taraf da
   * gerçek `horses`/`players` satırlarına sahiptir — bu yüzden HER iki
   * katılımcı için de `race_entries` VE `race_entry_segments` yazılır
   * (pratik yarıştaki "yalnızca oyuncunun atı" kısıtlaması burada YOK).
   *
   * AUDIT_REPORT.md Bulgu E1'in PvP analogu (bu oturum, proje sahibinin
   * "hangi adımı istiyorsan yapabilirsin" yetkilendirmesiyle) — bu metot
   * ARTIK `JoinMatchmakingQueueUseCase` tarafından ÇAĞRILMIYOR (bkz.
   * dosya sonundaki "Eski `savePracticeRace` metodu KALDIRILMADI" notuyla
   * AYNI kategori: `insertRaceRow`/`insertEntryWithSegments` yardımcılarını
   * hâlâ PAYLAŞTIĞINDAN silinmedi, ama kullanıcı yolunda DEĞİL). Sorun:
   * `JoinMatchmakingQueueUseCase` Elo reyting güncellemesini
   * (`PlayerRepository.updateTwoWithLock`) ile yarış/PvP kaydını (BU
   * metot) İKİ AYRI transaction'da yapıyordu — E1 ile YAPISAL OLARAK AYNI
   * risk (ikinci transaction başarısız olursa reyting değişmiş ama maç
   * kaydı YOK kalır), ama `entryFee`/`prizePool` her zaman 0 olduğundan
   * mali risk TAŞIMIYORDU (bu yüzden E1'in kendisi bu turun kapsamı
   * dışında bırakılmıştı). Çözümü aşağıdaki `savePvpMatchWithRatings`'te.
   */
  savePvpMatch(
    race: Race,
    entries: [RaceEntry, RaceEntry],
    segments: RaceSegmentSnapshot[],
    match: PvpMatch,
  ): Promise<void>;

  /**
   * AUDIT_REPORT.md Bulgu E1'in PvP analogu (bu oturum) — bkz. yukarıdaki
   * `savePvpMatch` doc yorumundaki tam gerekçe. `savePracticeRaceWithStakes`
   * ile AYNI desen: bu metot `PlayerRepository`'yi HİÇ KULLANMAZ, kendi
   * transaction'ını yönetir — HER İKİ oyuncunun `players` satırını
   * `PlayerRepository.updateTwoWithLock` ile AYNI deadlock-önleme
   * mantığıyla (id'lerin SÖZLÜKSEL sırasına göre) KİLİTLER, `applyEloUpdate`
   * (saf domain fonksiyonu) ile yeni reytingleri hesaplar, HER İKİ satırı
   * günceller, SONRA (satırlar hâlâ AYNI transaction/client içindeyken)
   * `races`/`race_entries`/`race_entry_segments`/`pvp_matches` satırlarını
   * ekler. Herhangi bir adım başarısız olursa `withTransaction` TÜMÜNÜ
   * (reytingler dahil) ROLLBACK eder — artık Elo'nun maç kaydından
   * BAĞIMSIZ bir duruma düşmesi mümkün DEĞİL.
   */
  savePvpMatchWithRatings(
    input: SavePvpMatchWithRatingsInput,
  ): Promise<SavePvpMatchWithRatingsResult>;

  /**
   * Faz 2 (görsel kalite planı) — Ana Sayfa "Son Yarış Sonuçları" paneli
   * (brief §38'e komşu, `StableSummaryView` ile AYNI "Ana Sayfa kartı"
   * kategorisi). `races`/`race_entries`/`horses` (owner_id ile) JOIN
   * edilerek OYUNCUNUN KENDİ atlarının sonuçlanmış pratik yarışları en
   * yeniden eskiye doğru okunur — bkz. `RecentRaceResultView` doc yorumu
   * (bot rakipler dahil DEĞİLDİR, salt okunur bir sorgudur).
   */
  findRecentResultsByOwnerId(ownerId: string, limit: number): Promise<RecentRaceResultView[]>;

  /**
   * AUDIT_REPORT.md Bulgu R3 (Low, bu oturum) — `entrant-snapshot.ts`'in
   * `deriveFormFromRecentResults`'ı (bkz. o fonksiyonun doc yorumu) için:
   * `findRecentResultsByOwnerId` ile AYNI JOIN/şekil, ama OYUNCU değil TEK
   * bir AT bazında filtrelenir (`WHERE re.horse_id = $1`) — bir oyuncunun
   * BİRDEN FAZLA atı olabileceğinden, "formu" hesaplanan atın KENDİ
   * geçmişi, sahibinin TÜM atlarının karışık geçmişinden AYRI tutulmalı.
   * Salt okunur, `withTransaction` GEREKMEZ (`findRecentResultsByOwnerId`
   * ile AYNI gerekçe). Sonuçlar en yeniden eskiye sıralı döner (`limit`
   * uygulanan tarafta değil SQL'de) — çağıran `deriveFormFromRecentResults`
   * bu sıralamaya GÜVENİR, kendi başına yeniden sıralamaz.
   */
  findRecentResultsByHorseId(horseId: string, limit: number): Promise<RecentRaceResultView[]>;

  /**
   * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`.
   * `races` + TÜM `race_entries` (gerçek at VE bot satırları) + TÜM
   * `race_entry_segments`'i tek bir görünüme birleştirip döner; `race`
   * satırı yoksa `null` döner (use-case bunu `RaceNotFoundError`'a çevirir —
   * bu port'un kendisi HTTP/domain hatası BİLMEZ, docs/ARCHITECTURE.md §4).
   * Salt okunur, `withTransaction` GEREKMEZ (`findRecentResultsByOwnerId`
   * ile AYNI gerekçe).
   */
  findTimelineByRaceId(raceId: string): Promise<RaceTimelineView | null>;

  /**
   * Yarışın yalnızca durumu (01.10.2026) — tribün soketi, bitmemiş bir
   * yarışın kesinleşmesini ya da iptalini beklerken yoklar. Satır yoksa `null`.
   */
  findRaceStatus(raceId: string): Promise<RaceStatus | null>;

  /**
   * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`
   * yetkilendirmesi: bu yarışta `playerId`'ye ait EN AZ bir gerçek at
   * (bot DEĞİL) katılımcı olarak var mı? `HorseOwnerGuardByParam` ile AYNI
   * "sahiplik" ilkesi ama farklı şekil — burada tekil bir at DEĞİL, bir
   * YARIŞTA katılım sorgulanıyor, bu yüzden ayrı bir route guard yerine
   * use-case seviyesinde bir port metodu olarak modellendi (`assertSelf`
   * ile KARŞILAŞTIRILAMAZ: `playerId` her zaman `CurrentPlayer()`'dan gelir,
   * URL'den gelen bir "iddia edilen kimlik" değil).
   */
  isPlayerParticipant(raceId: string, playerId: string): Promise<boolean>;

  /**
   * Oyuncunun oluşturduğu ücretli yarışı (brief §1-§7, §42 PHASE 1)
   * `races` tablosuna yazar ve lobi görünümünü döner.
   *
   * **PARA HAREKETİ ÜRETMEZ** — giriş ücreti yarışa KATILIRKEN alınır
   * (PHASE 1b), yarış açılırken değil. Bu yüzden `savePracticeRaceWithStakes`
   * gibi bir ledger yazımı veya bakiye kilidi YOKTUR; tek kilit
   * `maxOpenRacesPerPlayer` tavanının atomik olması içindir (bkz.
   * `CreateLobbyRaceResult` doc yorumu).
   *
   * `races` satırı TEK bir `INSERT`tir, ama yine de bir transaction
   * içindedir: tavan kontrolü ile yazma AYNI transaction'da olmak
   * zorundadır, aksi hâlde eşzamanlı iki istek tavanı aşabilir.
   */
  createLobbyRace(input: CreateLobbyRaceInput): Promise<CreateLobbyRaceResult>;

  /**
   * Oyuncuyu bir lobi yarışına KATAR (brief §2/§3/§6, §42 PHASE 1b).
   *
   * **TEK ATOMİK İŞLEM — ve bu BİLİNÇLİDİR.** Katılımın tüm durum
   * kontrolleri (yarış katılabilir mi, kontenjan doldu mu, at oyuncunun mu,
   * at sağlıklı mı, zaten katılmış mı) yarış satırı `FOR UPDATE` ile
   * KİLİTLİYKEN AYNI transaction'da yapılır. Kontroller use-case'e
   * taşınsaydı, kontrol ile yazma arasında geçen sürede yarış dolabilir ya
   * da başlayabilirdi (TOCTOU) — ve burada söz konusu olan PARA.
   *
   * Kilit sırası HER ZAMAN önce `races`, sonra `players`'dır. Aynı yarışa
   * eşzamanlı katılımlar yarış satırında sıraya girer; bu, kilit
   * çevrimdışılığı (deadlock) riskini de ortadan kaldırır.
   *
   * Ücret yalnızca `races.entry_fee > 0` iken alınır; 0 ise `players`
   * satırına HİÇ dokunulmaz (`economy_transactions.amount <> 0` kısıtı
   * sıfır tutarlı bir defter satırını zaten reddederdi).
   *
   * Hata FIRLATIR (`CreateLobbyRaceResult`'ın aksine): buradaki her ret
   * nedeni, çağıranın doğrudan bir domain hatasına çevirdiği bir durumdur
   * ve `savePracticeRaceWithStakes` de aynı deseni kullanır
   * (`PlayerNotFoundError`, `InsufficientFundsError`).
   */
  joinLobbyRace(input: JoinLobbyRaceInput): Promise<RaceLobbyView>;

  /**
   * Katılınabilir lobi yarışlarını listeler (brief §5 "doluluk", §42
   * PHASE 3).
   *
   * **PARA/ENVANTER OKUMAZ-YAZMAZ** — yalnızca `races` + `race_entries`
   * okur. Bu yüzden kilit ve transaction YOKTUR: liste, ANLIK bir
   * görüntüdür ve tutarlılık gerektirmez. Kilit almak, her lobi
   * yenilemesini yarışa katılan oyuncuların arkasında sıraya sokardı.
   *
   * Sıralama `start_time ASC`'dir: en yakın başlayacak yarış en üstte
   * olmalıdır — oyuncunun kararı zaten "hangi yarışa YETİŞEBİLİRİM"
   * sorusudur.
   */
  listLobbyRaces(input: ListLobbyRacesInput): Promise<RaceLobbyListItem[]>;

  /**
   * Oyuncunun KENDİ katılım satırının durumunu değiştirir (brief §6, §42
   * PHASE 3) ve güncel lobi görünümünü döner.
   *
   * **PARA YOLU DEĞİLDİR:** bakiye, ödül havuzu ve deftere HİÇ
   * dokunulmaz — `status` alanı yalnızca "hazırım" bildirimidir. Bu
   * yüzden `joinLobbyRace`'in aksine `Idempotency-Key` de gerekmez:
   * aynı değeri iki kez yazmak sonucu değiştirmez (bkz.
   * `checkEntryReadyable` doc yorumu).
   *
   * Yine de TEK transaction'dır ve yarış satırını `FOR UPDATE` ile
   * KİLİTLER: aksi hâlde "yarış hâlâ `scheduled` mı" kontrolü ile yazma
   * arasında yarış başlayabilir ve koşmuş bir yarışa `ready` yazılırdı.
   *
   * Hata FIRLATIR (`RaceEntryNotFoundError`, `RaceEntryNotReadyableError`)
   * — `joinLobbyRace` ile AYNI desen.
   */
  setEntryReady(input: SetEntryReadyInput): Promise<RaceLobbyView>;

  /**
   * Oyuncuyu katıldığı lobi yarışından ÇIKARIR, giriş ücretini İADE eder ve
   * güncel lobi görünümünü döner (brief §20 `REFUND`, §42 PHASE 4c).
   *
   * **PARA YOLU (CLAUDE.md kural 7) — `joinLobbyRace`'in TAM TERSİ.**
   * `races` satırı kilitlenir, oyuncunun katılım satırı `status='cancelled'`
   * yapılır, `prize_pool` ödenen ücret kadar AZALTILIR, bakiye iade edilir
   * ve AYNI transaction'da `race_entry_refund` (`REFUND` ailesi) defter
   * kaydı yazılır. Dördü birlikte değilse havuz ile gerçek para ayrışır.
   *
   * **İADE TUTARI `races.entry_fee`'DEN DEĞİL, DEFTERDEN OKUNUR.** O an
   * geçerli ücret ile oyuncunun GERÇEKTE ödediği tutar aynı olmak zorunda
   * olsa da, iadeyi "şu anki ücret" üzerinden hesaplamak ileride ücret
   * güncellenebilir hâle geldiğinde sessizce yanlış tutar iade ederdi.
   * Defter zaten "ne ödendi" sorusunun tek doğruluk kaynağıdır.
   *
   * **KİLİT SIRASI: `races` → `race_entries` → `players`.** İlk iki adım
   * `setEntryReady` ile, ilk adım `joinLobbyRace` ile AYNIdır; ortak ilk
   * kilit `races` olduğu için bu üç yol arasında çapraz kilitlenme
   * (deadlock) oluşamaz.
   *
   * Hata FIRLATIR: `RaceNotFoundError` (404), `RaceEntryNotFoundError`
   * (404), `RaceEntryNotLeavableError` (409) — `joinLobbyRace` ile AYNI
   * desen. Ücretsiz yarışta (ödenmiş ücret yoksa) `players` satırına HİÇ
   * dokunulmaz ve defter satırı YAZILMAZ: `economy_transactions.amount <> 0`
   * kısıtı sıfır tutarlı bir satırı zaten reddederdi.
   */
  leaveLobbyRace(input: LeaveLobbyRaceInput): Promise<RaceLobbyView>;
  /**
   * READY ŞARTI (30.09.2026) — brief §6 / proje sahibinin talebi: "HAZIR
   * OLAN kişiler yarışabilsinler". Başlangıç zamanı gelmiş `scheduled` bir
   * yarışta `ready` DEMEMİŞ (`waiting`/`not_ready`) her gerçek katılımı
   * `cancelled` yapar ve ödediği giriş ücretini İADE eder
   * (`race_entry_refund`, tutar `leaveLobbyRace` gibi DEFTERDEN okunur).
   * Hiç hazır oyuncu kalmazsa yarışın kendisi `cancelled` olur.
   *
   * **NEDEN İADE, YAKMA DEĞİL:** hazır olmamak bir kural ihlali değil, bir
   * vazgeçmedir; `leaveLobbyRace` ile aynı sonucu üretir. Yakmak, READY
   * düğmesini görmeyen oyuncuyu cezalandırırdı.
   *
   * Kilitleme (`LockRaceUseCase`) ve `scheduled`dan doğrudan kesinleştirme
   * (`SettleRaceUseCase`) snapshot kurmadan ÖNCE çağırır; böylece kadro
   * tripwire'ı yalnızca hazır katılımları görür. Tek transaction, `races`
   * satırı `FOR UPDATE`; yarış `scheduled` değilse ya da başlangıç zamanı
   * gelmemişse HİÇBİR ŞEY yapmaz (idempotent — ikinci çağrı boş döner).
   */
  dropUnreadyLobbyEntries(input: {
    raceId: string;
    now: Date;
    /**
     * 30.09.2026 — düşürmeden sonra kalması gereken en az HAZIR oyuncu.
     * Varsayılan 1 (lobi). Turnuvada `online.tournament.minParticipants`:
     * altında kalınırsa KALANLAR da iade edilip yarış iptal edilir.
     */
    minRemaining?: number;
  }): Promise<DropUnreadyLobbyEntriesResult>;

  /** 30.09.2026 — yarış bir turnuva finaliyse kademesi ve seviye şartı; değilse `null`. */
  findTournamentInfo(raceId: string): Promise<TournamentInfo | null>;

  /** 30.09.2026 — kaydı AÇIK (`scheduled`) turnuvası olan kademeler. */
  findOpenTournamentTiers(): Promise<string[]>;

  /**
   * 30.09.2026 — turnuva finali olan bir lobi yarışı + `tournaments` satırı,
   * TEK transaction. `created_by` NULL'dır (sunucu üretimi yarış). O
   * kademede kaydı açık bir turnuva zaten varsa (eşzamanlı ikinci çağrı)
   * hiçbir şey yazmaz ve `null` döner.
   */
  createTournamentRace(input: CreateTournamentRaceInput): Promise<string | null>;

  /** 30.09.2026 — başlangıcı geçmiş, hiç katılımı olmayan turnuvaları iptal eder; iptal sayısını döner. */
  cancelEmptyDueTournaments(now: Date): Promise<number>;

  /**
   * 01.10.2026 — YARIŞ TAKVİMİ: verilen yuvalardan HANGİLERİ zaten açılmış
   * (`race_calendar_slots`). Yuvanın yarışı iptal edilmiş olsa bile açılmış
   * sayılır — iptal edilen yuva yeniden açılmaz.
   */
  findExistingCalendarSlots(programId: string, startTimes: Date[]): Promise<Date[]>;

  /**
   * 01.10.2026 — takvim yuvası için bir lobi yarışı + `race_calendar_slots`
   * satırı, TEK transaction. `created_by` NULL'dır. Yuva zaten açıksa
   * (eşzamanlı ikinci çağrı) hiçbir şey yazmaz ve `null` döner.
   */
  createCalendarRace(input: CreateCalendarRaceInput): Promise<string | null>;

  /** 01.10.2026 — başlangıcı geçmiş, hiç katılımı olmayan takvim yarışlarını iptal eder; iptal sayısını döner. */
  cancelEmptyDueCalendarRaces(now: Date): Promise<number>;

  /**
   * 01.10.2026 — OYUNCU KONTROLLÜ PRATİK YARIŞ başlatır: TEK transaction'da
   * `players` `FOR UPDATE` + giriş ücreti (`practice_race_entry_fee` defter
   * satırı, reference_id = oturum id) + oturum satırı. Oyuncunun süren bir
   * oturumu varsa HİÇBİR şey yazmaz ve onun kimliğini döner.
   */
  startInteractiveRace(
    input: StartInteractiveRaceInput,
  ): Promise<
    { ok: true; balance: { money: number; gems: number } } | { ok: false; runningRaceId: string }
  >;

  findInteractiveRace(raceId: string): Promise<InteractiveRaceRecord | null>;

  /**
   * 01.10.2026 — oyuncunun şu an CANLI koşan (kontrollü, `locking`) lobi
   * yarışı; yoksa `null`.
   */
  findLiveLobbyRaceIdForPlayer(playerId: string): Promise<string | null>;

  /**
   * 01.10.2026 — oyuncunun kendi katılımına komut yazar. `races` satırı
   * `FOR SHARE` (kesinleşme onu `FOR UPDATE` aldığından iki yazım
   * çakışmaz), katılım satırı `FOR UPDATE`. `mutate` fırlatırsa hiçbir şey
   * yazılmaz. Katılım yoksa `null`.
   */
  updateLobbyEntryCommands(
    raceId: string,
    playerId: string,
    mutate: (current: PlayerCommandLog, raceStatus: string) => PlayerCommandLog,
  ): Promise<PlayerCommandLog | null>;

  /** 01.10.2026 — kesinleşmiş lobi yarışında oyuncunun sırası ve aldığı ödül; yoksa `null`. */
  findLobbyOutcome(
    raceId: string,
    playerId: string,
  ): Promise<{ finishPosition: number; prizeWon: number; entryFee: number } | null>;

  findRunningInteractiveRaceId(playerId: string): Promise<string | null>;

  /** Zamanlayıcı için: süren oturumlar, en eski başlangıç önce. */
  findRunningInteractiveRaceIds(limit: number): Promise<string[]>;

  /**
   * Oturum satırı `FOR UPDATE` altında yeni komut kaydını hesaplatır ve
   * yazar (`mutate` fırlatırsa hiçbir şey yazılmaz). Oturum yoksa `null`.
   */
  updateInteractiveRaceCommands(
    raceId: string,
    mutate: (record: InteractiveRaceRecord) => PlayerCommandLog,
  ): Promise<InteractiveRaceRecord | null>;

  /**
   * Oturum satırı `FOR UPDATE` altında kesinleştirir: `build` kayıt girdisini
   * üretir (yarış henüz bitmediyse `null`), pratik yarış kayıt yolu AYNI
   * transaction'da koşar ve oturum `finished` olur. Tekrar koruması durum
   * geçişidir (`running → finished`).
   */
  finishInteractiveRace(
    raceId: string,
    build: (record: InteractiveRaceRecord) => {
      saveInput: SavePracticeRaceWithStakesInput;
      /** Kesinleşme sonucu (yeni bakiyeyle) — oturum satırına AYNI transaction'da yazılır. */
      result: (balance: { money: number; gems: number }) => PracticeRaceResult;
    } | null,
  ): Promise<
    | { status: 'finished'; balance: { money: number; gems: number } }
    | { status: 'not_due' }
    | { status: 'already_finished' }
    | null
  >;

  /**
   * Bir lobi yarışının KESİNLEŞME BAĞLAMINI okur (salt okuma, §42 PHASE
   * 13.14): yarışın simülasyon parametreleri + koşacak GERÇEK katılımcılar.
   *
   * **KİLİT ALMAZ, TRANSACTION AÇMAZ — ve bu GÜVENLİDİR.** Okuma ile
   * `settleLobbyRace` arasında katılımcı listesi DEĞİŞEMEZ: yarış
   * `startTime`'ı geçtiği anda katılma (`checkRaceJoinable`), hazır
   * bildirme (`checkEntryReadyable`) ve ayrılma (`checkRaceLeavable`)
   * ÜÇÜ BİRDEN kapanır — `checkRaceSettleable`'ın sınırı bunların TAM
   * TERSİDİR. Yani bu okumanın yaptığı iş "önizleme" değil, "donmuş
   * kadroyu okuma"dır. Yine de `settleLobbyRace` bu listeyi kilit altında
   * YENİDEN okur ve karşılaştırır (tripwire) — varsayım sessizce
   * yanlışlanmasın diye.
   *
   * **SNAPSHOT BURADA ALINMAZ, `race_entries`'te de YOKTUR:**
   * `joinLobbyRace` bilinçli olarak `horse_snapshot` yazmaz (bkz. o
   * metodun doc yorumu) — atın o andaki hâli değil, KOŞTUĞU andaki hâli
   * kayda geçmelidir. Bu yüzden çağıran (use-case) her katılımcı için atı
   * ve istatistiklerini ayrıca yükleyip `buildHorseEntrantSnapshot` ile
   * kendisi kurar.
   */
  findLobbySettlementContext(raceId: string): Promise<LobbySettlementContext | null>;

  /**
   * KİLİTLENMEYİ BEKLEYEN yarışların kimliklerini döner (brief §42 PHASE 1,
   * migration 0042) — zamanlayıcının (`race-lock.scheduler.ts`) tek okuma
   * kapısı.
   *
   * Ölçüt üç maddeden oluşur ve ÜÇÜ DE ZORUNLUDUR: `status = 'scheduled'`
   * (zaten kilitlenmiş/iptal edilmiş bir yarışı yeniden kilitlemek anlamsız
   * olurdu), `start_time <= now` (henüz açık bir lobi kilitlenemez) ve EN AZ
   * BİR gerçek katılımcı (`player_id IS NOT NULL AND status IS DISTINCT FROM
   * 'cancelled'`). Üçüncüsü olmadan, kimsenin katılmadığı yarışlar
   * `locking`te birikir ve `listLobbyRaces` yalnızca `scheduled` listelediği
   * için lobiden de kaybolurlardı.
   *
   * **SALT OKUMADIR, KİLİT ALMAZ** — ve bu güvenlidir: dönen liste yalnızca
   * bir ADAY listesidir. Asıl karar `lockLobbyRace` içinde, `races` satırı
   * `FOR UPDATE` ile kilitliyken verilir. İki zamanlayıcı örneği (ya da iki
   * süreç) aynı kimliği okursa ikincisi kilit altında `NOT_SCHEDULED` görür
   * ve hiçbir şey yapmaz — yani bu okumanın "yanlış" olması mümkün değildir.
   *
   * `ORDER BY start_time ASC`: en eski (en çok bekleyen) yarış önce
   * kilitlenir — `listLobbyRaces`'in sıralamasıyla AYNI gerekçe. `limit`
   * çağırandan gelir (`RaceLobbyConfig.lockScheduler.batchSize`).
   */
  findRacesDueForLock(input: { now: Date; limit: number }): Promise<string[]>;

  /**
   * Kesinleşmeyi bekleyen (`locking`) yarışların kimlikleri, en eski
   * başlangıç önce (30.09.2026 — otomatik kesinleşme). `locking` = snapshot
   * donmuş, ödül dağıtılmamış; bu durumda kalan her yarışın giriş ücretleri
   * havuzda BEKLER. Zamanlayıcı bu listeyi `SettleRaceUseCase` ile kapatır.
   * Kilit ALMAZ: seçim yalnızca bir ön listedir, asıl karar
   * `settleLobbyRace`in kilit altındaki durum kontrolüdür (ikinci işçi 409
   * `RACE_NOT_SETTLEABLE` alır ve atlar).
   */
  findRacesDueForSettle(input: { limit: number }): Promise<string[]>;

  /**
   * Yarışı `scheduled`dan `locking`e geçirir ve O AN'ı DONDURUR (brief §42
   * PHASE 1, migration 0042).
   *
   * **TEK ATOMİK TRANSACTION — ve atomiklik burada ZORUNLUDUR.** Aynı
   * transaction içinde: (1) `races` satırı `FOR UPDATE` ile kilitlenir,
   * (2) `checkRaceLockable` ile durum yeniden denetlenir, (3) kadro
   * tripwire'ı koşar (aşağıda), (4) `status = 'locking'` + `simulation_seed`
   * + dört sürüm sütunu yazılır, (5) her gerçek katılımcının
   * `race_entries.horse_snapshot`'ı YAZILIR, (6) `race_starting`
   * bildirimleri yazılır. Altısından biri düşerse HİÇBİRİ kalıcı olmaz —
   * yani "kilitlendi ama snapshot yok" diye bir ara durum DB'ye HİÇ
   * yazılmaz.
   *
   * **`false` DÖNER — HATA FIRLATMAZ — "kilitlenemez" durumunda.** Sebep
   * ayrımı YOKTUR ve bilinçlidir: çağıran (zamanlayıcı) her durumda aynı
   * şeyi yapar, yani hiçbir şey. Ayırt etmek yalnızca gürültülü bir günlük
   * üretirdi. `false` dönen hâller: yarış yok, `scheduled` değil (başka bir
   * örnek önce kilitlemiş, iptal edilmiş ya da koşmuş), `startTime`
   * gelmemiş, gerçek katılımcı yok. **BU, "İKİ İŞÇİ AYNI YARIŞI KOŞTURUR MU"
   * SORUSUNUN CEVABIDIR: hayır — ikinci işçi burada `false` alır.**
   *
   * **BAĞLAM DÖNMEZ — bilinçli.** Çağıran onu zaten snapshot'ları kurmak
   * için okumuştu; ikinci bir kopya döndürmek, iki kopyanın ayrışmasına
   * açık bir kapı olurdu (`settleLobbyRace`in `expectedPrizePool` tripwire'ı
   * TAM OLARAK o kapıyı kapatmak için vardır).
   *
   * **KADRO TRIPWIRE'I:** use-case snapshot'ları kilitsiz bir okumadan
   * kurar; burada kilit altında okunan kadro ile KARŞILAŞTIRILIR ve
   * farklıysa düz bir `Error` fırlatılır (500). Fark, `startTime`dan sonra
   * katılım/ayrılmanın KAPALI olması sayesinde oluşmamalıdır; oluşursa
   * dondurulan snapshot yanlış kadroya ait olurdu — sessizce devam etmek
   * yanlış bir yarış kaydı üretirdi.
   */
  lockLobbyRace(input: LockLobbyRaceInput): Promise<boolean>;

  /**
   * Lobi yarışını KOŞAR ve ödülleri dağıtır (§42 PHASE 13.14) — projenin
   * EN KRİTİK PARA YOLU.
   *
   * **TEK ATOMİK TRANSACTION — ve burada atomiklik "iyi olur" değil,
   * ZORUNLUDUR.** Aynı transaction içinde: (1) `races` satırı `FOR UPDATE`
   * ile kilitlenir ve durum yeniden denetlenir, (2) kazananların `players`
   * satırları kilitlenip ödüller `credit` edilir, (3) HER ödeme için
   * `economy_transactions` defter satırı yazılır, (4) `race_entries`
   * sonuçları güncellenir/eklenir, (5) `races.status = 'finished'` olur,
   * (6) `race_finished`/`prize_won` bildirimleri yazılır. Altısından biri
   * düşerse HİÇBİRİ kalıcı olmaz. Özellikle (6): bir bildirim, ödemenin
   * GÖRÜNÜR yüzüdür — ayrı yazılsaydı "ödül kazandınız" deyip ödemeyen
   * (ya da tersi) bir satır kalabilirdi ve hiçbir yerde hata çıkmazdı
   * (`gift_received`'ın doc yorumundaki AYNI gerekçe, §13.13.1).
   *
   * **İDEMPOTENCY `Idempotency-Key` İLE DEĞİL, DURUM GEÇİŞİYLE SAĞLANIR.**
   * Kilit altındaki ilk iş `checkRaceSettleable`'dır; ilk çağrı
   * `status`'u `finished` yapar, ikinci çağrı `NOT_SCHEDULED` alır. Yani
   * çift ödeme YAPISAL OLARAK imkânsızdır ve ayrı bir anahtar altyapısı
   * gerekmez.
   *
   * **`expectedPrizePool` BİR TRIPWIRE'DIR, iş kuralı değil.**
   * Ödül tutarları use-case'te, kilitsiz okunan havuzdan hesaplanır;
   * burada kilit altında okunan `races.prize_pool` ile KARŞILAŞTIRILIR ve
   * farklıysa düz bir `Error` fırlatılır (500). Fark oluşması bir hata
   * değil bir MUHASEBE BOZULMASI olurdu — `prize_pool >= 0` CHECK'inin
   * `leaveLobbyRace`'de oynadığı rolün AYNISI.
   *
   * **KİLİT SIRASI: `races` → `players` (SÖZLÜKSEL id sırası).**
   * `races` her zaman ilktir (join/ready/leave ile AYNI), dolayısıyla
   * çapraz kilitlenme oluşamaz. `players` kilidi TEK bir oyuncu değil N
   * oyuncu olduğundan, iki eşzamanlı kesinleşmenin (farklı yarışlar)
   * birbirini kilitlememesi için sıra `ORDER BY id` ile SABİTLENİR
   * (`updateTwoWithLock`'un aynı deseni).
   *
   * Hata FIRLATIR: `RaceNotFoundError` (404), `RaceNotSettleableError`
   * (409), `PlayerNotFoundError` (404) — `joinLobbyRace` ile AYNI desen.
   */
  settleLobbyRace(input: SettleLobbyRaceInput): Promise<RaceSettlementResult>;
}

/**
 * `RaceRepository.leaveLobbyRace` (brief §20, §42 PHASE 4c) girdi şekli.
 *
 * `playerId` **`CurrentPlayer()`'dan gelir, gövdeden ASLA** (CLAUDE.md
 * kural 1): aksi hâlde bir oyuncu başkasını yarıştan atıp parasını iade
 * ettirebilirdi (IDOR). Gövde alanı YOKTUR — ayrılma isteğinin tek
 * parametresi yoldan gelen `raceId`'dir.
 */
export interface LeaveLobbyRaceInput {
  raceId: string;
  /** Ayrılan oyuncu — `CurrentPlayer()`. */
  playerId: string;
  /** Şu an — `checkRaceLeavable`'a geçirilir; test edilebilirlik için parametredir. */
  now: Date;
  /** Başlıktan geçer ve İADE defter satırına yazılır — `joinLobbyRace` ile AYNI gerekçe. */
  idempotencyKey: string | null;
}

/**
 * `RaceRepository.listLobbyRaces` (brief §5, §42 PHASE 3) girdi şekli.
 *
 * `limit` buraya NORMALİZE EDİLMİŞ gelir (`normalizeLobbyListLimit`) —
 * ham sorgu parametresi asla repository'ye inmez; sınır bilgisi
 * `config/race-lobby.config.json`'dadır (CLAUDE.md "SİHİRLİ SAYI YOK").
 */
export interface ListLobbyRacesInput {
  /** Hangi durumdaki yarışlar — lobi için pratikte her zaman `scheduled`. */
  status: RaceStatus;
  /** Azami kayıt sayısı — çağıran tarafından config'e göre kırpılmıştır. */
  limit: number;
  /** Çağıran oyuncu — yalnızca KENDİ katılımı (`myEntry`) için okunur. */
  viewerId: string;
}

/**
 * `RaceRepository.setEntryReady` (brief §6, §42 PHASE 3) girdi şekli.
 *
 * `playerId` **`CurrentPlayer()`'dan gelir, gövdeden ASLA** (CLAUDE.md
 * kural 1). `status` daraltılmıştır (`READY_SETTABLE_STATUSES`) — ham
 * gövde asla buraya ulaşmaz.
 */
export interface SetEntryReadyInput {
  raceId: string;
  /** Katılımı değiştirilecek oyuncu — `CurrentPlayer()`. */
  playerId: string;
  status: RaceEntryStatus;
  /** Şu an — `checkEntryReadyable`'a geçirilir; test edilebilirlik için parametredir. */
  now: Date;
}

/**
 * `RaceRepository.joinLobbyRace` (brief §2/§3/§6, §42 PHASE 1b) girdi şekli.
 *
 * `playerId` **`CurrentPlayer()`'dan gelir, gövdeden ASLA** (CLAUDE.md kural
 * 1). `idempotencyKey` başlıktan geçirilir ve defter satırına yazılır:
 * aynı anahtarla tekrarlanan istek yeni bir düşüm yaratmaz (interceptor
 * yanıtı önbellekten döner, ama defter satırındaki anahtar denetim
 * izini kalıcı kılar).
 */
export interface JoinLobbyRaceInput {
  raceId: string;
  /** Katılan oyuncu — `CurrentPlayer()`. */
  playerId: string;
  /** Katılınacak at; oyuncunun KENDİ atı olmalı (`HorseNotOwnedError`). */
  horseId: string;
  /** `race_entries.id` — çağıran üretir (`createLobbyRace`'deki `id` deseniyle AYNI). */
  entryId: string;
  tacticalStyle: RacingStyle;
  riskLevel: RiskLevel;
  /** Şu an — `checkRaceJoinable`'a geçirilir; test edilebilirlik için parametredir. */
  now: Date;
  idempotencyKey: string | null;
}

/**
 * `RaceRepository.createLobbyRace` (brief §1-§7, §42 PHASE 1) girdi şekli.
 *
 * **`id` ÇAĞIRAN TARAFINDAN ÜRETİLİR** — `run-practice-race` use-case'inin
 * `randomUUID()` ile `raceId` üretmesiyle AYNI desen (bkz. o dosya).
 * Repository'nin kendisi kimlik üretmez: id tek bir yerde doğar.
 *
 * **`simulationSeed` İSE BURADA `null`'dır** — bu, pratik yarıştan
 * BİLİNÇLİ bir sapmadır; gerekçesi `CreateLobbyRaceInput.simulationSeed`
 * üstündeki doc yorumunda tam olarak açıklanmıştır (özet: erken üretilen
 * bir seed'i yarışı açan kişi okuyup sonucu önceden hesaplayabilir, bu da
 * ücretli bir yarışta doğrudan para kazanma yoludur).
 *
 * `engineVersion`/`rulesetVersion`/`configVersion`/`weatherConfigVersion`
 * BURADA ZORUNLUDUR çünkü `races`'in bu dört sütunu `NOT NULL`dır ve
 * migration 0021/0024 bilerek `DEFAULT`'u KALDIRMIŞTIR ("yeni satırlar HER
 * ZAMAN uygulama kodundan gelen GERÇEK bir değerle yazılsın"). Henüz
 * KOŞMAMIŞ bir yarış için bunlar "bu yarışın koşacağı BEKLENEN sürüm"dür;
 * yarış gerçekten simüle edildiğinde (PHASE 3) kullanılan GERÇEK
 * sürümlerle ÜZERİNE YAZILIR — bu yüzden arada bir engine sürümü artışı
 * olsa bile replay/audit kaydı sonunda doğru kalır.
 */
export interface CreateLobbyRaceInput {
  id: string;
  /** Yarışı açan oyuncu — `CurrentPlayer()`'dan gelir, gövdeden ASLA (CLAUDE.md "SUNUCU OTORİTESİ"). */
  createdBy: string;
  name: string;
  /** brief §1/§7 "at sayısı" → `races.participant_limit`. */
  fieldSize: number;
  /** brief §1/§6 "maksimum oyuncu" → `races.max_players`. */
  maxPlayers: number;
  entryFee: number;
  raceType: 'free' | 'paid';
  startTime: Date;
  surface: string;
  weather: string;
  distanceMeters: number;
  tribuneFee: number;
  spectatorCapacity: number;
  /** brief §3 — yarış açıldığı anda 0'dır; katılımcılarla BÜYÜR (PHASE 1b). */
  prizePool: number;
  /**
   * **BİLİNÇLİ OLARAK `null`'dır — lobi yarışı seed'siz doğar.**
   *
   * Pratik yarışta (`run-practice-race`) seed, yarışla AYNI anda
   * üretilir çünkü yarış oracıkta koşar. Lobi yarışında ise arada
   * SAATLER, hatta günler vardır ve seed'in ERKEN üretilmesi gerçek bir
   * adalet sorunu doğurur:
   *
   *  1. Seed, `GET /races/:id/timeline` yanıtında istemciye GİDER (bkz.
   *     `get-race-timeline.use-case.ts` → `simulationSeed`). Yarış
   *     açıldığı anda seed sabitlenseydi, yarışı açan kişi kendi
   *     yarışının seed'ini okuyabilir, snapshot'ı yerel olarak kurup
   *     sonucu ÖNCEDEN hesaplayabilir ve "kazanacağımı biliyorum" diye
   *     katılırdı. Ücretli bir yarışta bu, doğrudan para kazanma yoludur.
   *  2. Daha sinsi olanı: seed erken sabitlenirse, katılımcı listesi
   *     seed'e GİRMEZ — yani bir oyuncu "hangi atlar katılırsa kazanırım"
   *     sorusunu deneyerek lobiyi yönlendirebilir.
   *
   * Seed'i YARIŞ KOŞARKEN üretmek iki sorunu birden kapatır: o anda
   * katılımcı listesi ZATEN kilitlidir (kayıt kapanmıştır) ve seed
   * kimseye — yarışı açana bile — önceden görünmez. Bu yüzden
   * `races.simulation_seed` sütunu `NULL` kabul eder (migration 0006,
   * `DEFAULT` yok) ve bu alan `null` geçilir.
   */
  simulationSeed: string | null;
  engineVersion: string;
  rulesetVersion: string;
  configVersion: string;
  weatherConfigVersion: string;
  /**
   * `RaceLobbyConfig.maxOpenRacesPerPlayer` — bu değer PORT'tan geçer
   * çünkü kontrolün `INSERT` ile AYNI transaction'da yapılması gerekir
   * (aşağıdaki `CreateLobbyRaceResult`'ın doc yorumu).
   */
  maxOpenRaces: number;
  /** 01.10.2026 — oyuncu kontrollü canlı yarış (migration 0054). */
  playerControl: boolean;
}

/**
 * `RaceRepository.createLobbyRace` sonucu.
 *
 * **NEDEN `null`/istisna DEĞİL, AYRIK BİR SONUÇ:** "tavan aşıldı" bir
 * HATA değil bir DURUMDUR ve `races` satırı YAZILMAMIŞTIR — bunu bir
 * istisnayla ifade etmek, repository'yi (Infrastructure katmanını) domain
 * hatası (`RaceLimitReachedError`) bilmeye zorlardı; oysa bu port
 * (docs/ARCHITECTURE.md §4) HTTP/domain hatası BİLMEZ, yalnızca olguları
 * döner. Hatayı fırlatmak `CreateRaceUseCase`'in işidir.
 *
 * **NEDEN SAYIM REPOSITORY'NİN İÇİNDE:** tavan kontrolü ile `INSERT`
 * ARASINDA bir boşluk olursa, aynı oyuncunun eşzamanlı iki isteği
 * ikisi de "2 açık yarışım var" görüp ikisi de yazabilir (tavan 3 iken 4
 * açık yarış). Bu yüzden sayım, `players` satırı `FOR UPDATE` ile
 * KİLİTLENEREK aynı transaction içinde yapılır — aynı oyuncunun eşzamanlı
 * oluşturma istekleri bu noktada SIRAYA girer.
 */
export type CreateLobbyRaceResult =
  | { ok: true; race: RaceLobbyView }
  | { ok: false; reason: 'RACE_LIMIT_REACHED'; openRaces: number };

/** `RaceRepository.savePracticeRaceWithStakes` (AUDIT_REPORT.md E1) girdi şekli. */
export interface SavePracticeRaceWithStakesInput {
  race: Race;
  /**
   * AUDIT_REPORT.md Bulgu R2 (bu oturum) — bkz. `savePracticeRaceWithStakes`
   * doc yorumundaki tam gerekçe. İLK eleman oyuncunun kendi girişidir.
   */
  entries: RaceEntry[];
  /** TÜM `entries`'in BİRLEŞTİRİLMİŞ segmentleri — her segment kendi `raceEntryId`'sine göre ilgili girişle eşleştirilir. */
  segments: RaceSegmentSnapshot[];
  /** Kilitlenecek/güncellenecek `players` satırı — `horse.ownerId` (bkz. `RunPracticeRaceUseCase`). */
  playerId: string;
  /** Seçilen kademenin `entryFee`'si (`config/economy.config.json` → `raceTiers[]`) — 0 ise düşüm/ledger girişi hiç yazılmaz. */
  entryFee: number;
  /** `getRacePrize`'dan — 0 ise ekleme/ledger girişi hiç yazılmaz. */
  prizeWon: number;
}

/** `RaceRepository.savePracticeRaceWithStakes` sonucu — `WalletBalance` ile AYNI şekil (`domain/economy/wallet.ts`). */
export interface SavePracticeRaceWithStakesResult {
  money: number;
  gems: number;
}

/**
 * `RaceRepository.savePvpMatchWithRatings` (AUDIT_REPORT.md E1'in PvP
 * analogu) girdi şekli. "A"/"B" adlandırması `PlayerRepository.
 * updateTwoWithLock`'un `buyer`/`seller` adlandırmasıyla AYNI ruhta —
 * parasal/hiyerarşik bir anlamları YOK, yalnızca `match.playerIds`
 * dizisindeki sıraya karşılık gelirler (`match.playerIds[0]` = A,
 * `match.playerIds[1]` = B). `JoinMatchmakingQueueUseCase` bu diziyi
 * HER ZAMAN `[çağıranın playerId'si, rakibin playerId'si]` sırasıyla
 * doldurur (bkz. o use-case'teki `match` nesnesi).
 */
export interface SavePvpMatchWithRatingsInput {
  race: Race;
  /** Sıra ÖNEMLİ DEĞİL burada (ikisi de gerçek at/oyuncu) — `insertEntryWithSegments` her ikisi için de aynı şekilde çağrılır. */
  entries: [RaceEntry, RaceEntry];
  /** İki katılımcının BİRLEŞTİRİLMİŞ segmentleri — her segment kendi `raceEntryId`'sine göre ilgili girişle eşleştirilir. */
  segments: RaceSegmentSnapshot[];
  match: PvpMatch;
  /** `match.playerIds[0]` (A) için gerçek maç skoru — 1 = A kazandı, 0 = A kaybetti, 0.5 = berabere. `applyEloUpdate`'e AYNEN geçirilir. */
  scoreA: 0 | 0.5 | 1;
  /** `AppConfigService.online` — `applyEloUpdate`'in k-faktörü/taban reyting parametreleri için. */
  onlineConfig: OnlineConfig;
}

/** `RaceRepository.savePvpMatchWithRatings` sonucu — "A"/"B" `SavePvpMatchWithRatingsInput` doc yorumundaki AYNI anlam. */
export interface SavePvpMatchWithRatingsResult {
  ratingABefore: number;
  ratingAAfter: number;
  ratingBBefore: number;
  ratingBAfter: number;
}

/**
 * Kesinleşecek yarışın GERÇEK katılımcılarından biri (§42 PHASE 13.14).
 *
 * **`horseSnapshot` BURAYA PHASE 1'DE EKLENDİ (migration 0042).** Eskiden
 * bu alan bilinçli olarak yoktu: snapshot yarış KOŞARKEN alınırdı ve bu
 * arayüz yalnızca snapshot'ın KURULMASI için gereken ham girdileri
 * (hangi at, hangi taktik, hangi kulvar) taşırdı. **O TASARIMIN AÇIK
 * PENCERESİ VARDI:** kesinleşme `startTime`dan çok sonra çağrılabildiği
 * için, oyuncu `startTime` ile kesinleşme arasında atını çalıştırıp
 * sonucu etkileyebilirdi. Artık snapshot `startTime` ANINDA (`scheduled →
 * locking`) dondurulur ve burada TAŞINIR.
 *
 * **`null` HÂLÂ MÜMKÜNDÜR ve bir HATA DEĞİLDİR:** zamanlayıcı hiç
 * çalışmamış (ör. `lockScheduler.enabled = false`, ya da yarış
 * `startTime`dan önce elle kesinleştirilmiş) olabilir. O durumda
 * kesinleşme snapshot'ı kendisi kurar — yani davranış ESKİSİYLE AYNIdır,
 * yalnızca artık "her zaman" değil "zamanlayıcı çalışmadıysa" geçerlidir.
 */
export interface TournamentInfo {
  tier: 'bronze' | 'silver' | 'gold';
  minPlayerLevel: number;
}

export interface CreateTournamentRaceInput {
  raceId: string;
  tier: 'bronze' | 'silver' | 'gold';
  name: string;
  startTime: Date;
  entryFee: number;
  maxParticipants: number;
  minPlayerLevel: number;
  distanceMeters: number;
  surface: string;
  weather: string;
  tribuneFee: number;
  spectatorCapacity: number;
  engineVersion: string;
  rulesetVersion: string;
  configVersion: string;
  weatherConfigVersion: string;
  /** 01.10.2026 — oyuncu kontrollü canlı yarış (migration 0054). */
  playerControl: boolean;
}

/** 01.10.2026 — oyuncu kontrollü pratik yarış oturumu (migration 0053). */
export interface InteractiveRaceRecord {
  id: string;
  playerId: string;
  horseId: string;
  tierId: string;
  /** GİZLİ — istemciye gönderilmez. */
  simulationSeed: string;
  tactic: RaceTacticInput;
  /** [oyuncu atı, ...botlar] — başlangıçta donmuş. */
  entrants: RaceEntrantSnapshot[];
  jockeyId: string | null;
  entryFee: number;
  distanceMeters: number;
  surface: string;
  weather: string;
  commands: PlayerCommandLog;
  startsAt: Date;
  status: 'running' | 'finished';
  finishedAt: Date | null;
  result: PracticeRaceResult | null;
}

export type StartInteractiveRaceInput = Omit<
  InteractiveRaceRecord,
  'commands' | 'status' | 'finishedAt' | 'result'
>;

/** 01.10.2026 — takvim yarışı girdisi: doğrulanmış yarış tanımı + yuva. */
export interface CreateCalendarRaceInput {
  raceId: string;
  programId: string;
  name: string;
  startTime: Date;
  fieldSize: number;
  maxPlayers: number;
  entryFee: number;
  raceType: 'free' | 'paid';
  distanceMeters: number;
  surface: string;
  weather: string;
  tribuneFee: number;
  spectatorCapacity: number;
  engineVersion: string;
  rulesetVersion: string;
  configVersion: string;
  weatherConfigVersion: string;
  /** 01.10.2026 — oyuncu kontrollü canlı yarış (migration 0054). */
  playerControl: boolean;
}

/** `dropUnreadyLobbyEntries` sonucu. */
export interface DropUnreadyLobbyEntriesResult {
  /** Katılımı iptal edilip ücreti iade edilen oyuncular. */
  droppedPlayerIds: string[];
  /** Hiç hazır oyuncu kalmadığı için yarışın kendisi `cancelled` oldu mu. */
  raceCancelled: boolean;
}

export interface LobbySettlementEntrant {
  entryId: string;
  playerId: string;
  horseId: string;
  /** `race_entries.tactical_style` — `RaceTacticInput.racingStyle`. */
  tacticalStyle: RacingStyle;
  /** `race_entries.risk_level` — `RaceTacticInput.riskLevel`. */
  riskLevel: RiskLevel;
  /**
   * Katılım anında çekilen kulvar (`joinLobbyRace` → `nextGatePosition`).
   * `null` olabilir: `race_entries.gate_position` NULLABLE'dır ve bu satır
   * bu sütun eklenmeden önce yazılmış olabilir. `null` ise kesinleşme
   * anında yeniden çekilir (bkz. `settleLobbyRace`).
   */
  gatePosition: number | null;
  /**
   * `startTime` anında DONDURULMUŞ hâl (`race_entries.horse_snapshot`).
   * Doluysa kesinleşme ONU kullanır ve atın o andan sonraki gelişimi
   * sonucu DEĞİŞTİREMEZ. `null` ise kesinleşme anında yeniden kurulur.
   */
  horseSnapshot: RaceEntrantSnapshot | null;
  /**
   * `race_entries.jockey_id` (PHASE 6.2). Kilit çalıştıysa orada yazılıdır;
   * çalışmadıysa `null`dur ve kesinleşme jokeyi KENDİSİ çözer (bkz.
   * `EntrantSnapshotBuilder.build` — aynı okuma `snapshot`ı da üretir).
   *
   * **BU ALAN `horseSnapshot` İLE TUTARLI OKUNMAK ZORUNDADIR:** snapshot
   * dondurulmuşsa (`horseSnapshot !== null`) jokey de dondurulmuştur ve
   * canlı `jockeys` tablosundan YENİDEN çözülemez — oyuncu kilit ile
   * kesinleşme arasında jokey değiştirebilir ve sonuç ekranı koşmayan bir
   * jokeyi gösterirdi.
   */
  jockeyId: string | null;
  /** 01.10.2026 — oyuncunun segment komutları (kontrollü yarış; diğerlerinde boş). */
  playerCommands: PlayerCommandLog;
  /** `horses.name` — canlı görünümde (oyuncu + tribün) at adı (01.10.2026). */
  horseName: string;
}

/**
 * `RaceRepository.findLobbySettlementContext` sonucu (§42 PHASE 13.14).
 *
 * **`entrants` YALNIZCA GERÇEK OYUNCULARDIR** (`player_id` dolu ve
 * `status <> 'cancelled'`). Botlar burada YOKTUR çünkü henüz
 * ÜRETİLMEMİŞLERDİR: kaç bot gerektiği `fieldSize - entrants.length` ile
 * kesinleşme anında hesaplanır. Ayrılan oyuncuların satırları
 * (`status = 'cancelled'`) da dışarıda kalır — koltukları boşalmıştır ve
 * `leaveLobbyRace` ücretlerini zaten iade etmiştir; onları koşturmak hem
 * iade edilmiş hem de ödül alabilecek bir "hayalet katılımcı" yaratırdı.
 */
export interface LobbySettlementContext {
  raceId: string;
  raceName: string;
  /** `races.status` — HAM değer; yorumu `checkRaceSettleable` yapar. */
  status: string;
  startTime: Date;
  /** Doluluk — `checkRaceSettleable`'a geçirilir (`entrants.length` ile AYNI olmalıdır). */
  joinedPlayers: number;
  entryFee: number;
  /** brief §3 ödül havuzu — kesinleşme anında dağıtılacak GERÇEK tutar. */
  prizePool: number;
  /** brief §1/§7 at sayısı — bot sayısı bundan türetilir. */
  fieldSize: number;
  maxPlayers: number;
  surface: string;
  weather: string;
  distanceMeters: number;
  temperatureC: number | null;
  windKmh: number | null;
  humidityPct: number | null;
  createdBy: string | null;
  createdAt: Date;
  entrants: LobbySettlementEntrant[];
  /**
   * `races.simulation_seed` — kilitlenme anında dondurulan seed (§42
   * PHASE 1, migration 0042).
   *
   * **`null` İSE SEED HENÜZ ÜRETİLMEMİŞTİR** ve kesinleşme kendi seed'ini
   * üretir (eski davranış). Doluysa kesinleşme AYNEN onu kullanır:
   * seed'i kesinleşme anında yeniden üretmek, dondurulmuş snapshot ile
   * eşleşmeyen bir koşu üretme riski taşır ve iki farklı "aynı yarış"
   * doğururdu.
   */
  simulationSeed: string | null;
  /** 01.10.2026 (migration 0054). */
  playerControl: boolean;
  /** Kontrollü yarışta kapıların açıldığı an (kilitte yazılır); diğerlerinde `null`. */
  liveStartsAt: Date | null;
}

/**
 * `RaceRepository.lockLobbyRace` girdi şekli (§42 PHASE 1, migration 0042).
 *
 * Use-case snapshot'ları kilitten ÖNCE, kilitsiz bir okumadan kurar; bu
 * girdi onları repository'ye taşır ki durum geçişi, seed ve snapshot'lar
 * TEK transaction'da yazılabilsin. Bu güvenlidir: `startTime` geçtikten
 * sonra katılma (`checkRaceJoinable`) ve ayrılma (`checkRaceLeavable`) da
 * kapalıdır, yani kadro bu okuma ile kilit arasında DEĞİŞEMEZ. Değişirse
 * repository tripwire'ı düz `Error` fırlatır.
 */
export interface LockLobbyRaceInput {
  raceId: string;
  /** Zamanlayıcının "şimdi"si — `checkRaceLockable`'a geçirilir. */
  now: Date;
  /**
   * `races.simulation_seed`'e yazılacak seed. Üretimi ÇAĞIRANIN işidir:
   * domain katmanı `randomUUID` gibi bir yan etki taşımaz ve seed'in
   * kaynağı (rastgele mi, türetilmiş mi) bir politika kararıdır.
   */
  simulationSeed: string;
  engineVersion: string;
  rulesetVersion: string;
  configVersion: string;
  weatherConfigVersion: string;
  /**
   * Her GERÇEK katılımcı için dondurulacak snapshot. `entryId` kümesi,
   * kilit altında okunan kadroyla BİREBİR olmalıdır (tripwire).
   *
   * **`jockeyId` PHASE 6.2'DE EKLENDİ ve `snapshot` ile AYNI
   * transaction'da yazılır.** Ayrı yazılsaydı (ör. kesinleşme anında)
   * donmuş `jockeySkillComposite` ile `race_entries.jockey_id` SESSİZCE
   * ayrışabilirdi: oyuncu kilit ile kesinleşme arasında jokeyini
   * değiştirse, sonuç ekranı "jokeyin X" derken koşuyu Y jokeyiyle
   * koşmuş olurdu. `null` = oyuncunun kiralı jokeyi yok.
   */
  entrantSnapshots: { entryId: string; snapshot: RaceEntrantSnapshot; jockeyId: string | null }[];
  /** 01.10.2026 — kontrollü yarışta kilit ile kapıların açılması arasındaki geri sayım (sn). */
  liveCountdownSeconds: number;
}

/**
 * Kesinleşme anında GERÇEK bir katılım satırına yazılacak sonuç
 * (§42 PHASE 13.14). `entryId` ile eşleşen `race_entries` satırı UPDATE
 * edilir — botlarınki gibi YENİ satır eklenmez, çünkü satır katılım
 * anında zaten doğmuştur.
 */
export interface SettleLobbyRealEntryResult {
  entryId: string;
  /** Sonuç listesinde (`RaceSettlementPlace.horseId`) gösterilecek at. */
  horseId: string;
  /** Koştuğu andaki hâli — `buildHorseEntrantSnapshot` çıktısı. */
  horseSnapshot: RaceEntrantSnapshot;
  finalTimeMs: number;
  finishPosition: number;
  performanceScore: number;
  /**
   * Kulvar. Katılım anında çekilmişse AYNEN geçirilir; `null` ise
   * kesinleşme anında çekilmiş YENİ değer geçirilir (bkz.
   * `LobbySettlementEntrant.gatePosition` doc yorumu). `race_entries.
   * gate_position` NULLABLE olduğundan bu alan `null` kalabilir.
   */
  gatePosition: number | null;
  /**
   * Koşan jokey (PHASE 6.2) — `race_entries.jockey_id`'ye yazılır ve sonuç
   * yanıtının (`RaceSettlementPlace.jockeyId`) kaynağıdır. `null` = jokeyi
   * yoktu (nötr 50 ile koştu).
   *
   * Kilit çalıştıysa değer `LobbySettlementEntrant.jockeyId`den AYNEN
   * geçirilir; çalışmadıysa `EntrantSnapshotBuilder.build` sonucundan
   * gelir. İki yol da snapshot'ın üretildiği ANDAKİ jokeydir.
   */
  jockeyId: string | null;
}

/** `RaceRepository.settleLobbyRace` girdi şekli (§42 PHASE 13.14). */
export interface SettleLobbyRaceInput {
  raceId: string;
  /**
   * Use-case'in, kilitsiz okuduğu havuzdan hesapladığı tutar. Kilit
   * altında okunan `races.prize_pool` ile BİREBİR aynı olmalıdır —
   * farklıysa `Error` fırlatılır (bkz. `settleLobbyRace` doc yorumu).
   */
  expectedPrizePool: number;
  /** Yarış KOŞARKEN üretilen seed — `races.simulation_seed`'e yazılır. */
  simulationSeed: string;
  engineVersion: string;
  rulesetVersion: string;
  configVersion: string;
  weatherConfigVersion: string;
  /** Bildirim metinleri için — `races.name`. */
  raceName: string;
  /** Gerçek katılımcıların sonuçları (satırlar UPDATE edilir). */
  realEntries: SettleLobbyRealEntryResult[];
  /** Bot koltukları (satırlar INSERT edilir) — `botLabel` dolu olmalıdır. */
  botEntries: RaceEntry[];
  /** TÜM katılımcıların BİRLEŞTİRİLMİŞ segmentleri (`raceEntryId` ile eşleşir). */
  segments: RaceSegmentSnapshot[];
  /**
   * Sıra → Çip. Dizinin `i` elemanı `i + 1`. sıranın ödülüdür; dizinin
   * dışında kalan sıralar 0 alır. **TUTARLAR BURADA HESAPLANMAZ** —
   * `domain/race/prize-distribution.ts` → `computePrizePayouts` çıktısı
   * AYNEN geçirilir, böylece havuz aritmetiği tek bir yerde kalır.
   */
  payouts: number[];
  /** Şu an — kilit altındaki durum denetimine ve tüm yazımlara geçirilir. */
  now: Date;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const RACE_REPOSITORY = Symbol('RACE_REPOSITORY');
