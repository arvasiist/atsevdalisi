/**
 * Master Development Brief §7/§51 "Asset Interface + Manifest" (bu turda
 * EKLENDİ) — Grup 2'nin (gerçek 3D/ses varlıkları, kullanıcının "şimdilik
 * erteleyelim" kararıyla ERTELENDİ, bkz. `docs/IMPLEMENTATION_PLAN_MASTER_
 * BRIEF.md`) BEKLEDİĞİ her dosyayı TEK bir yerde, makine-okunabilir ve
 * insan-okunabilir şekilde tanımlayan SAF (framework'ten bağımsız) veri
 * modülü. Brief'in kendi kuralı ("sahte GLB dosyaları UYDURMA, lisanssız
 * varlık KULLANMA") burada İKİ katmanda uygulanır:
 *
 * 1. Bu dosya HİÇBİR asset dosyası YARATMAZ/BEKLEMEZ — sadece "şu an EKSİK"
 *    diye İŞARETLENMİŞ bir liste tutar (`status: 'missing'`, TÜMÜ).
 * 2. `GltfAssetLoader.tsx` (bu turda EKLENDİ, aynı klasör), gerçek bir GLB
 *    dosyası `public/` altına KONULMADIĞI sürece placeholder'a düşer —
 *    yani "asset eksik" durumu ÇÖKMEZ, sadece görsel olarak ilkel kalır
 *    (mevcut `HorseMarker` kapsül+küre şekli gibi).
 *
 * `ASSET_GUIDE.md` (repo kökü `docs/`) bu manifest'in İNSAN-OKUNABİLİR
 * karşılığıdır — brief §7'nin örnek formatını (`HORSE_MODEL_REQUIRED —
 * Realistic Thoroughbred horse GLB, Gallop animation, Compatible skeleton`)
 * TAKİP EDER. İkisi ELLE senkron tutulur (bu dosyadaki `id` alanları
 * `ASSET_GUIDE.md`'deki başlıklarla BİREBİR eşleşir) — otomatik bir
 * kod-üretici YOK, çünkü liste küçük ve nadiren değişir.
 */

export type AssetKind =
  | 'model_3d'
  | 'texture'
  | 'audio_sfx'
  | 'audio_music'
  | 'audio_voice';

export type AssetFormat = 'glb' | 'gltf' | 'ktx2' | 'png' | 'mp3' | 'ogg';

/**
 * `status` bu dosyada ASLA elle `'present'` yapılmaz — bir asset
 * gerçekten `public/` altına konulup `GltfAssetLoader`/ses çalarlar
 * tarafından BAŞARIYLA yüklendiğinde bunu YANSITACAK tek yer ÇALIŞMA
 * ZAMANI (runtime) katmanıdır (bkz. `GltfAssetLoader.tsx`'in `onError`
 * fallback'i), bu SAF manifest DOSYASI değil — bu yüzden burada sabit
 * `'missing'` bir alan yerine DOĞRUDAN olgu olarak tutulur (bkz. altındaki
 * `ASSET_MANIFEST` sabitinin her girişindeki yorum).
 */
export interface AssetRequirement {
  /** `ASSET_GUIDE.md`'deki başlıkla BİREBİR eşleşir (ör. `HORSE_MODEL_REQUIRED`). */
  id: string;
  kind: AssetKind;
  format: AssetFormat;
  /** `public/` köküne göre BEKLENEN göreli yol — dosya henüz YOK, bu sadece SÖZLEŞMEdir. */
  expectedPath: string;
  /** Brief §7 formatı: kısa, tek satırlık gereksinim özeti (Türkçe). */
  description: string;
  /** Dosya yoksa/yüklenemezse hangi mevcut ilkel görsel/davranışa DÜŞÜLDÜĞÜ (uydurma değil, ZATEN VAR OLAN kod). */
  fallbackBehavior: string;
}

/**
 * Brief §7 (Horse/Jockey), §9 (Hipodrom çevresi), §15 (Start Gate), §31
 * (Audio) taleplerinin BİRE BİR karşılığı — HERHANGİ bir yeni özellik
 * İCAT EDİLMEDİ, sadece brief'in KENDİ maddeleri buraya taşındı. Sıra
 * ÖNEMLİ değildir (görüntüleme sırası `ASSET_GUIDE.md`'de ayrıca belirlenir).
 */
export const ASSET_MANIFEST: AssetRequirement[] = [
  {
    id: 'HORSE_MODEL_REQUIRED',
    kind: 'model_3d',
    format: 'glb',
    expectedPath: 'models/horse.glb',
    description: 'Gerçekçi safkan at modeli, Gallop/Trot/Idle animasyon klipleri, tutarlı iskelet (skeleton).',
    fallbackBehavior: "RaceScene3D.tsx'teki mevcut kapsül+küre HorseMarker ilkel şekli.",
  },
  {
    id: 'JOCKEY_MODEL_REQUIRED',
    kind: 'model_3d',
    format: 'glb',
    expectedPath: 'models/jockey.glb',
    description: "At modeliyle UYUMLU iskelete sahip jokey modeli, oturma/kamçı animasyon klipleri.",
    fallbackBehavior: 'Şu an ayrı bir jokey görseli YOK — at markörüyle birlikte render edilmez (Grup 2 kapsamı).',
  },
  {
    id: 'HIPPODROME_ENVIRONMENT_REQUIRED',
    kind: 'model_3d',
    format: 'glb',
    expectedPath: 'models/hippodrome-environment.glb',
    description: 'Tribün, pist çevresi, paddock alanı içeren hipodrom sahne modeli.',
    fallbackBehavior: "RaceScene3D.tsx'teki mevcut instanced pist zemini + Environment preset (gün batımı) arka planı.",
  },
  {
    id: 'START_GATE_MODEL_REQUIRED',
    kind: 'model_3d',
    format: 'glb',
    expectedPath: 'models/start-gate.glb',
    description: 'Yarış başlangıç kapıları (starting gate) modeli, açılma animasyonu.',
    fallbackBehavior: 'Şu an başlangıç çizgisinde görsel bir kapı YOK (Grup 2 kapsamı).',
  },
  {
    id: 'CROWD_BILLBOARD_TEXTURE_REQUIRED',
    kind: 'texture',
    format: 'ktx2',
    expectedPath: 'textures/crowd-billboard.ktx2',
    description: 'Tribün kalabalığı için instanced billboard dokusu (brief §46 mobil kademe uyumlu, sıkıştırılmış KTX2).',
    fallbackBehavior: 'Şu an tribünde görsel bir kalabalık YOK (Grup 2 kapsamı).',
  },
  {
    id: 'HOOFBEAT_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/hoofbeat-loop.mp3',
    description: 'Nal sesi döngüsü (loop), hıza göre pitch/hacim ayarlanabilir.',
    fallbackBehavior: "AudioManager'ın (bkz. `audio-manager.ts`) sessiz no-op modu — ses YOK ama hata da YOK.",
  },
  {
    id: 'CROWD_AMBIENCE_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/crowd-ambience-loop.mp3',
    description: 'Sürekli tribün kalabalığı arka plan sesi (loop).',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'RACE_FINISH_FANFARE_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/finish-fanfare.mp3',
    description: 'Yarış bitişinde çalınacak kısa fanfar/kazanma sesi.',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'RACE_BACKGROUND_MUSIC_REQUIRED',
    kind: 'audio_music',
    format: 'mp3',
    expectedPath: 'audio/race-theme.mp3',
    description: 'Yarış öncesi/sırası çalınacak enstrümantal tema müziği.',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'COMMENTARY_VOICE_REQUIRED',
    kind: 'audio_voice',
    format: 'mp3',
    expectedPath: 'audio/commentary/',
    description:
      'Brief §31 "Commentary" soyutlaması için önceden kaydedilmiş/TTS anlatım klipleri (ör. "ve start veriliyor", "kafa kafaya bir bitiş!") — klasör, tekil dosya DEĞİL (birden çok klip beklenir).',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu — anlatım YOK, HUD metinsel açıklamalarla (`RaceExplanation`) yetinir.",
  },
  // Faz 2/4 hata düzeltmesi (bu turda EKLENDİ) — brief §31'in "Architecture"
  // listesindeki 11 ses kategorisinden `audio-manager.ts`'in daha önce
  // KARŞILIĞI OLMAYAN beşi (GateOpen/HorseBreathing/Wind/Overtake/Winner)
  // için asset gereksinimleri. HERHANGİ biri gerçek bir asset İCAT ETMEZ —
  // dosya başı doc yorumundaki AYNI kural (`status: 'missing'`, TÜMÜ).
  {
    id: 'GATE_OPEN_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/gate-open.mp3',
    description: 'Start kapılarının açılma anı sesi, bir seferlik (döngüsüz).',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'HORSE_BREATHING_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/horse-breathing-loop.mp3',
    description: 'At nefesi döngüsü (loop), yorgunluğa (fatigue) göre hacim ayarlanabilir.',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'WIND_AMBIENCE_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/wind-ambience-loop.mp3',
    description: 'Sürekli rüzgar arka plan sesi (loop).',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'OVERTAKE_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/overtake.mp3',
    description: 'Bir atın diğerini geçtiği anda çalınacak kısa SFX, bir seferlik (döngüsüz).',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'WINNER_CELEBRATION_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/winner-celebration.mp3',
    description:
      'Kazanan kesinleştiğinde çalınacak kutlama sesi — `RACE_FINISH_FANFARE_REQUIRED`den KASITLI OLARAK AYRI (bkz. `AudioConfig.winnerCelebrationVolume` doc yorumu, "finish" yarış çizgisini geçme anı, "winner" kazananın kesinleşme anıdır).',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  // "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §17-20 (bu turda EKLENDİ) —
  // brief'in istediği DAHA GRANÜLER ses kategorileri: yüzeye göre nal sesi
  // (§18), ayrı at vokalizasyonları (§17), ayrık start sinyali + kademeli
  // kalabalık durumları (§19/§20). `RaceSurface` (`@at-sevdalisi/shared-types`)
  // ZATEN VAR OLAN, gerçek bir domain tipi (races.surface — grass/dirt/
  // synthetic, bkz. `horse-surface-stats.repository.ts`/`track-fit.ts`) —
  // bu yüzden yüzeye göre nal sesi SPEKÜLATİF bir kavram DEĞİL, mevcut bir
  // veri alanının doğal ses karşılığıdır.
  {
    id: 'START_SIGNAL_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/start-signal.mp3',
    description:
      'Brief §11 akışındaki "START SIGNAL" — kapılar açılmadan HEMEN ÖNCE çalınan hazır-ol düdüğü/sinyali, `GATE_OPEN_SFX_REQUIRED`den (kapı mekanizması sesi) KASITLI OLARAK AYRI, bir seferlik (döngüsüz).',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'STADIUM_AMBIENT_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/stadium-ambient-loop.mp3',
    description:
      'Genel stadyum atmosferi (loop) — `CROWD_AMBIENCE_SFX_REQUIRED`den (kalabalık SESİ) KASITLI OLARAK AYRI: hoparlör hışırtısı/uzak mekanik gürültü gibi kalabalıktan BAĞIMSIZ yapısal ortam sesi.',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'CROWD_CHEERING_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/crowd-cheering.mp3',
    description: 'Kazanan kesinleştiği andaki kalabalık tezahürat patlaması, bir seferlik (döngüsüz) — `WINNER_CELEBRATION_SFX_REQUIRED` ile BİRLİKTE çalar.',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'CROWD_EXCITED_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/crowd-excited-loop.mp3',
    description:
      'Final düzlükte `CROWD_AMBIENCE_SFX_REQUIRED`in YERİNİ alan, yükselmiş gerilim/heyecan seviyesindeki sürekli kalabalık sesi (loop) — brief §19 "yarışın durumuna göre ses yoğunluğu değişebilmeli".',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'HORSE_SNORT_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/horse-snort.mp3',
    description: 'At burun/horlama sesi, bir seferlik (döngüsüz) — çağıranın (ör. gelecekteki rastgele/anlatımsal tetikleyici) kararıyla çalınır.',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'HORSE_NEIGH_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/horse-neigh.mp3',
    description: 'At kişneme sesi, bir seferlik (döngüsüz) — çağıranın kararıyla çalınır.',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'HORSE_MOVEMENT_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/horse-movement.mp3',
    description: 'At vücudu/koşum takımı genel hareket sesi, bir seferlik (döngüsüz) — çağıranın kararıyla çalınır.',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'HOOF_GRASS_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/hoof-grass-loop.mp3',
    description: 'Çim (grass) pist yüzeyine özel nal sesi döngüsü — `RaceSurface` `"grass"` iken `HOOFBEAT_SFX_REQUIRED` YERİNE kullanılır (bkz. `startHoofbeats(surface)`).',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu; asset yoksa jenerik HOOFBEAT_SFX_REQUIRED'a DÜŞÜLMEZ (o da eksik) — sessiz kalır.",
  },
  {
    id: 'HOOF_DIRT_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/hoof-dirt-loop.mp3',
    description: 'Toprak (dirt) pist yüzeyine özel nal sesi döngüsü — `RaceSurface` `"dirt"` iken kullanılır.',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
  {
    id: 'HOOF_SYNTHETIC_SFX_REQUIRED',
    kind: 'audio_sfx',
    format: 'mp3',
    expectedPath: 'audio/hoof-synthetic-loop.mp3',
    description: 'Sentetik pist yüzeyine özel nal sesi döngüsü — `RaceSurface` `"synthetic"` iken kullanılır.',
    fallbackBehavior: "AudioManager'ın sessiz no-op modu.",
  },
];

export function getAssetById(id: string): AssetRequirement | undefined {
  return ASSET_MANIFEST.find((asset) => asset.id === id);
}

export function getAssetsByKind(kind: AssetKind): AssetRequirement[] {
  return ASSET_MANIFEST.filter((asset) => asset.kind === kind);
}

/**
 * Brief §52'nin istediği "önce AUDIT" disiplinine uygun küçük bir
 * yardımcı — bir sonraki oturumda/CI'da `public/` klasörünün GERÇEK
 * içeriğiyle (dosya sistemi okuması AYRI bir katmanın işi, bu SAF
 * fonksiyon sadece KARŞILAŞTIRMA mantığını taşır) karşılaştırıldığında
 * hangi asset'lerin HÂLÂ eksik olduğunu bulmak için kullanılabilir.
 * `presentPaths`, `public/`'e göre göreli, halihazırda VAR OLAN dosya
 * yollarının bir listesidir (çağıran taraf bunu doldurur — bu dosya
 * dosya sistemine ASLA DOKUNMAZ).
 */
export function getMissingAssets(presentPaths: string[]): AssetRequirement[] {
  const presentSet = new Set(presentPaths);
  return ASSET_MANIFEST.filter((asset) => !presentSet.has(asset.expectedPath));
}
