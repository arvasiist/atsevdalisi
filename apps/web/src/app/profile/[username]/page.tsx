'use client';

/**
 * `/profile/:username` — SOSYAL PROFİL (brief §24, §42 PHASE 14).
 *
 * **BU EKRANIN BACKEND'İ ZATEN VARDI** (`GET /players/profile/:username`,
 * `PROJE_DURUMU.md` §13.15). Eksik olan yalnızca istemciydi; bu dosya o
 * boşluğu kapatır.
 *
 * **⚠️ BU UÇ NOKTA `@Public()`'TİR — YANITINA GİREN HER ALAN HERKESE
 * AÇIKTIR.** `PlayerProfileView` bu yüzden `PlayerSummary`'den
 * `Pick`/`Omit` ile TÜRETİLMEZ, alanları açıkça yazar ve içinde
 * `money`/`gems` YOKTUR (AUDIT Bulgu S4). Bu ekran da o sözleşmenin
 * dışına ÇIKMAZ: bakiyeyi göstermek için ikinci bir istek ATILMAZ
 * (`getPlayer` çağrılmaz) — o uç nokta `assertSelf` ile korunur ve
 * başkasının bakiyesi zaten alınamaz; alınabilseydi burada gösterilmesi
 * bir sızıntı olurdu.
 *
 * **`isSelf` SUNUCUDAN GELMEZ, İSTEMCİDE TÜRETİLİR.** Uç nokta
 * `@Public()` olduğu için global `AuthGuard` token'ı HİÇ ayrıştırmaz, yani
 * sunucu "isteyen kim" bilgisine sahip değildir (`PlayerProfileView` doc
 * yorumu). İstemci kendi oyuncu id'sini `PlayerContext`'te zaten taşır;
 * `player?.id === profile.playerId` karşılaştırması tek satırdır ve yanlış
 * olma ihtimali yoktur. Guard'ı "herkese açık rotada da token'ı dene ama
 * hata fırlatma" davranışına çevirmek, kimlik doğrulamayla ilgili KÜRESEL
 * bir guard'ı tek bir görünüm alanı için gevşetmek olurdu.
 *
 * **KARİYER KADEMESİ BURADA HESAPLANMAZ, `level`'DEN TÜRETİLİR.** Kademe
 * sunucuda saklanan bir alan değildir; eşikler tek bir yerde
 * (`features/career/career-tier.ts`) yaşar ve bu ekran onu ÇAĞIRIR.
 * Eşikleri burada ikinci kez yazmak, iki kopyanın zamanla ayrışması
 * demekti.
 *
 * **BAŞARIMLAR (03.10.2026).** Yalnızca ödülü ALINMIŞ başarımlar gelir; ad
 * ölçüt + hedeften `achievementTitle` ile üretilir (görev ekranıyla AYNI
 * fonksiyon). Boş liste "henüz kazanılmış başarım yok" demektir.
 *
 * **BLOK / ŞİKÂYET (29.09.2026).** Dört uç nokta sunucuda hazırdı
 * (`PROJE_DURUMU.md` §13.16) ama hiçbir istemci tüketicisi yoktu; bu
 * ekran onların İLK yüzeyidir. Üç karar burada yazılıdır:
 *
 *   1. **PANEL YALNIZCA BAŞKA BİRİNİN PROFİLİNDE GÖRÜNÜR.** Kendi
 *      profilinde engelleme/şikâyet düğmesi göstermek, sunucunun
 *      `assertNotSelf` kapısıyla zaten reddedilecek bir isteği
 *      düğmeye bağlamak olurdu.
 *   2. **"ENGELLİ Mİ" BİLGİSİ KENDİ LİSTEMDEN OKUNUR, profilden DEĞİL.**
 *      Profil ucu `@Public()`'tir ve engel durumu ORADA YOKTUR — olsaydı
 *      "seni engelledi mi" sorusu herkese açık bir uçtan cevaplanırdı
 *      (brief §33: engelleme sessiz bir mesafedir). Tek meşru kaynak
 *      `GET /players/:id/blocks`tur ve o da yalnızca KENDİ listendir.
 *      Liste alınamazsa düğme "Engelle" olarak kalır — yanlış bir "engeli
 *      kaldır" göstermekten iyidir, çünkü engelleme İDEMPOTENTTİR
 *      (ikinci çağrı da 201 döner ve satır çoğalmaz).
 *   3. **ŞİKÂYET GEREKÇESİ İSTEĞE BAĞLIDIR.** Kategori ZORUNLUDUR
 *      (sunucu geçersiz/eksik kategoriyi 400 ile reddeder), serbest metin
 *      değildir. Boş bir metni "doldurulmuş" gibi göndermek, moderasyon
 *      kuyruğunda gerekçesi olan bir şikâyet izlenimi verirdi.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { PlayerProfileView, ReportCategory } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { getCareerProgress } from '../../../features/career/career-tier';
import { achievementTitle } from '../../../features/quests/achievement-labels';
import { apiClient } from '../../../lib/api-client';
import { usePlayer } from '../../../lib/player-context';

export default function PlayerProfilePage(): React.ReactElement {
  const params = useParams<{ username: string }>();
  const { player } = usePlayer();

  /**
   * Yol parametresi. Next.js dinamik segmenti ÇÖZÜLMÜŞ olarak verir
   * (`%C3%B6` → `ö`); `apiClient.getPlayerProfile` giderken yeniden
   * kodlar — yani kodlama/çözme TEK bir yerde (api-client) yapılır, burada
   * ikinci kez DEĞİL. Boş/eksik olma ihtimali yalnızca savunma amaçlı
   * kontrol edilir.
   */
  const username = typeof params?.username === 'string' ? params.username : '';

  const [profile, setProfile] = useState<PlayerProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Moderasyon durumu (bkz. dosya başı 2. madde). `viewerId` çağıranın
   * kendi kimliği, `moderationTargetId` ise "engellenebilir/şikâyet
   * edilebilir oyuncu"dur — kendi profilinde `null` olur ve panel çizilmez.
   */
  const viewerId = player?.id ?? null;
  const moderationTargetId =
    player !== null && profile !== null && player.id !== profile.playerId ? profile.playerId : null;

  const [isBlocked, setIsBlocked] = useState(false);
  const [isModerationBusy, setIsModerationBusy] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<ReportCategory>('spam');
  const [reportReason, setReportReason] = useState('');
  const [isReportSent, setIsReportSent] = useState(false);

  useEffect(() => {
    if (username.length === 0) {
      setIsLoading(false);
      setError('Profil adresi geçersiz.');
      return;
    }

    // Yarış koşulu: kullanıcı hızlıca başka bir profile geçerse eski
    // isteğin yanıtı YENİ ekrana yazılmamalıdır (klasik "geç yanıt"
    // hatası — `friends/page.tsx`'teki yazışma yüklemesiyle AYNI desen).
    let isActive = true;
    setIsLoading(true);
    setError(null);

    apiClient
      .getPlayerProfile(username)
      .then((data) => {
        if (!isActive) return;
        setProfile(data);
      })
      .catch((err: unknown) => {
        if (!isActive) return;
        // Sunucunun mesajı GÖSTERİLİR (ör. "oyuncu bulunamadı"): istemci
        // kendi "bulunamadı" metnini uydurursa, gerçek bir sunucu hatası da
        // aynı cümleyle görünür ve ikisi ayırt edilemez olurdu.
        setError(err instanceof Error ? err.message : 'Profil yüklenemedi.');
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [username]);

  /**
   * Engel durumu — TEK meşru kaynak kendi engel listemdir (dosya başı 2.
   * madde). Hata YUTULUR ve `false`a düşülür: liste alınamadı diye
   * profilin geri kalanını hata ekranına çevirmek orantısız olurdu, ve
   * `false` yanlış bir "engeli kaldır" göstermez (engelleme idempotenttir).
   */
  useEffect(() => {
    if (viewerId === null || moderationTargetId === null) {
      setIsBlocked(false);
      return;
    }
    let isActive = true;
    apiClient
      .listBlockedPlayers(viewerId)
      .then((rows) => {
        if (isActive) setIsBlocked(rows.some((row) => row.playerId === moderationTargetId));
      })
      .catch(() => {
        if (isActive) setIsBlocked(false);
      });
    return () => {
      isActive = false;
    };
  }, [viewerId, moderationTargetId]);

  async function toggleBlock(): Promise<void> {
    if (viewerId === null || moderationTargetId === null) return;
    setIsModerationBusy(true);
    setModerationError(null);
    try {
      if (isBlocked) {
        await apiClient.unblockPlayer(viewerId, moderationTargetId);
        setIsBlocked(false);
      } else {
        await apiClient.blockPlayer(viewerId, moderationTargetId);
        setIsBlocked(true);
      }
    } catch (err: unknown) {
      setModerationError(err instanceof Error ? err.message : 'İşlem tamamlanamadı.');
    } finally {
      setIsModerationBusy(false);
    }
  }

  async function submitReport(): Promise<void> {
    if (viewerId === null || moderationTargetId === null) return;
    setIsModerationBusy(true);
    setModerationError(null);
    try {
      await apiClient.reportPlayer(
        viewerId,
        moderationTargetId,
        reportCategory,
        reportReason.trim().length > 0 ? reportReason.trim() : undefined,
      );
      setIsReportSent(true);
      setIsReportOpen(false);
      setReportReason('');
    } catch (err: unknown) {
      setModerationError(err instanceof Error ? err.message : 'Şikâyet gönderilemedi.');
    } finally {
      setIsModerationBusy(false);
    }
  }

  if (isLoading) {
    return <CenteredMessage>Profil yükleniyor…</CenteredMessage>;
  }

  if (error !== null || profile === null) {
    return (
      <CenteredMessage>
        <span style={{ color: 'var(--color-danger, #f87171)' }}>{error ?? 'Profil bulunamadı.'}</span>
      </CenteredMessage>
    );
  }

  const career = getCareerProgress(profile.level);
  const isSelf = player !== null && player.id === profile.playerId;

  return (
    <main style={{ display: 'grid', gap: 'var(--space-md)', maxWidth: '880px', margin: '0 auto', padding: 'var(--space-md)' }}>
      <GlassPanel>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-md)' }}>
          <div style={avatarStyle} aria-hidden="true">
            {profile.displayName.slice(0, 1).toLocaleUpperCase('tr-TR')}
          </div>
          <div style={{ display: 'grid', gap: '4px', minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: '22px', color: 'var(--color-text-primary)' }}>{profile.displayName}</h1>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>@{profile.username}</span>
            <span style={{ fontSize: '13px', color: 'var(--color-accent-gold)' }}>
              {career.tier.label} · Seviye {profile.level}
            </span>
          </div>
          {isSelf ? (
            <span style={selfBadgeStyle}>Bu sensin</span>
          ) : null}
        </div>

        {/* Kademe çubuğu — `getCareerProgress` son kademede `1` döner
            ("daha fazla ilerleme yok"), bu yüzden dolu görünür; etiket
            bunu açıkça söyler. */}
        <div style={{ marginTop: 'var(--space-md)' }}>
          <div style={progressTrackStyle}>
            <div style={{ ...progressFillStyle, width: `${Math.round(career.progressToNextTier * 100)}%` }} />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {career.nextTier === null
              ? 'En üst kariyer kademesindesin.'
              : `Sonraki kademe: ${career.nextTier.label} (Seviye ${career.nextTier.minLevel})`}
          </span>
        </div>
      </GlassPanel>

      <GlassPanel>
        <h2 style={sectionTitleStyle}>Kariyer</h2>
        <div style={statGridStyle}>
          <Stat label="Yarış" value={profile.stats.raceCount} />
          <Stat label="Birincilik" value={profile.stats.winCount} />
          <Stat label="İlk üç" value={profile.stats.podiumCount} />
          <Stat label="Arkadaş" value={profile.friendCount} />
          <Stat label="Hediye" value={profile.giftCount} />
        </div>
        {/* Sunucu yalnızca KOŞULMUŞ (`finished`) yarışları sayar — devam
            eden bir yarışa katılım bu sayıya girmez. */}
        <p style={footnoteStyle}>
          Yalnızca tamamlanmış yarışlar sayılır; başlamış ama bitmemiş bir yarış bu sayılara girmez.
        </p>
      </GlassPanel>

      <GlassPanel>
        <h2 style={sectionTitleStyle}>Başarımlar</h2>
        {profile.achievements.length === 0 ? (
          <p style={footnoteStyle}>Henüz kazanılmış başarım yok.</p>
        ) : (
          <ul className="achievement-badges" data-testid="profile-achievements">
            {profile.achievements.map((achievement) => (
              <li key={achievement.key} className="market-badge" title={formatMemberSince(achievement.claimedAt)}>
                {achievementTitle(achievement.metric, achievement.target)}
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      <GlassPanel>
        <h2 style={sectionTitleStyle}>Üyelik</h2>
        <p style={{ ...footnoteStyle, margin: 0 }}>
          {formatMemberSince(profile.memberSince)} tarihinden beri At Sevdalısı&apos;nda.
        </p>
      </GlassPanel>

      {moderationTargetId !== null ? (
        <GlassPanel>
          <h2 style={sectionTitleStyle}>Güvenlik</h2>
          {/* Engelleme ve şikâyet AYRI şeylerdir ve sırası da önemlidir:
              engel, karşı tarafı sessizce uzaklaştırır; şikâyet moderasyon
              kuyruğuna düşer. Şikâyet engelden ETKİLENMEZ (doğru sıra
              "engelle, SONRA şikâyet et"tir — `moderation.ts` notu), bu
              yüzden ikisi aynı anda sunulur ve biri diğerini kilitlemez. */}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" disabled={isModerationBusy} onClick={() => void toggleBlock()} style={secondaryButtonStyle}>
              {isBlocked ? 'Engeli Kaldır' : 'Engelle'}
            </button>
            {!isReportSent ? (
              <button
                type="button"
                disabled={isModerationBusy}
                onClick={() => setIsReportOpen((open) => !open)}
                style={secondaryButtonStyle}
              >
                {isReportOpen ? 'Şikâyetten Vazgeç' : 'Şikâyet Et'}
              </button>
            ) : null}
            {isReportSent ? (
              <span style={{ fontSize: '13px', color: 'var(--color-accent-gold)' }}>
                Şikâyetin moderasyon kuyruğuna iletildi.
              </span>
            ) : null}
          </div>

          {isReportOpen && !isReportSent ? (
            <div style={{ display: 'grid', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
              <label style={fieldLabelStyle}>
                Kategori
                <select
                  value={reportCategory}
                  onChange={(event) => setReportCategory(event.target.value as ReportCategory)}
                  style={inputStyle}
                >
                  {REPORT_CATEGORY_ORDER.map((category) => (
                    <option key={category} value={category}>
                      {REPORT_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldLabelStyle}>
                Açıklama (isteğe bağlı)
                <textarea
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  rows={3}
                  placeholder="Neyin yanlış olduğunu kısaca anlat."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </label>
              <div>
                <button
                  type="button"
                  disabled={isModerationBusy}
                  onClick={() => void submitReport()}
                  style={secondaryButtonStyle}
                >
                  {isModerationBusy ? 'Gönderiliyor…' : 'Şikâyeti Gönder'}
                </button>
              </div>
            </div>
          ) : null}

          {isBlocked ? (
            <p style={footnoteStyle}>
              Bu oyuncu engelli. Engel; mesaj, hediye, yarış daveti ve arkadaşlık isteği yollarını iki yönde
              kapatır. Engelin fark edilmemesi bilinçlidir — karşı tarafa bildirilmez.
            </p>
          ) : null}

          {moderationError !== null ? (
            <p style={{ ...footnoteStyle, color: 'var(--color-danger, #f87171)' }}>{moderationError}</p>
          ) : null}
        </GlassPanel>
      ) : null}

      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
        <Link href="/friends" style={linkButtonStyle}>
          Arkadaşlar
        </Link>
        <Link href="/leaderboard" style={linkButtonStyle}>
          Sıralama
        </Link>
      </div>
    </main>
  );
}

/**
 * Üyelik tarihi. Geçersiz bir tarih gelirse (sözleşme ihlali) ham metin
 * gösterilir — "Invalid Date" yazmak yerine sunucunun gönderdiği değeri
 * görünür tutmak, hatayı gizlemek yerine fark edilir kılar.
 */
function formatMemberSince(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Stat({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div style={statBoxStyle}>
      <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
        {value.toLocaleString('tr-TR')}
      </span>
      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{label}</span>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <main style={{ display: 'grid', placeItems: 'center', padding: 'var(--space-xl, 48px) var(--space-md)' }}>
      <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>{children}</span>
    </main>
  );
}

const avatarStyle: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: '64px',
  height: '64px',
  borderRadius: '999px',
  background: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid var(--color-border)',
  fontSize: '26px',
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  flexShrink: 0,
};

const selfBadgeStyle: React.CSSProperties = {
  marginLeft: 'auto',
  padding: '4px 10px',
  borderRadius: '999px',
  border: '1px solid var(--color-border)',
  fontSize: '12px',
  color: 'var(--color-text-secondary)',
};

const progressTrackStyle: React.CSSProperties = {
  height: '6px',
  borderRadius: '999px',
  background: 'rgba(255, 255, 255, 0.08)',
  overflow: 'hidden',
  marginBottom: '6px',
};

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  background: 'var(--color-accent-gold)',
};

const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 var(--space-sm)',
  fontSize: '15px',
  color: 'var(--color-text-primary)',
};

const statGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
  gap: 'var(--space-sm)',
};

const statBoxStyle: React.CSSProperties = {
  display: 'grid',
  gap: '2px',
  justifyItems: 'center',
  padding: '10px 8px',
  borderRadius: 'var(--radius-md, 8px)',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid var(--color-border)',
};

const footnoteStyle: React.CSSProperties = {
  margin: 'var(--space-sm) 0 0',
  fontSize: '12px',
  color: 'var(--color-text-muted)',
  lineHeight: 1.5,
};

const linkButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '36px',
  padding: '6px 12px',
  borderRadius: '999px',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-secondary)',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
};

const secondaryButtonStyle: React.CSSProperties = {
  minHeight: '36px',
  padding: '6px 12px',
  borderRadius: '999px',
  border: '1px solid var(--color-border)',
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'grid',
  gap: '4px',
  fontSize: '12px',
  color: 'var(--color-text-muted)',
};

const inputStyle: React.CSSProperties = {
  minHeight: '36px',
  padding: '6px 10px',
  borderRadius: 'var(--radius-md, 8px)',
  border: '1px solid var(--color-border)',
  background: 'rgba(255, 255, 255, 0.04)',
  color: 'var(--color-text-primary)',
  fontSize: '13px',
  fontFamily: 'inherit',
};

/**
 * Şikâyet kategorilerinin TÜRKÇE etiketleri.
 *
 * **TİP TAM BİR `Record`TUR — EKSİK ANAHTAR DERLEME HATASI VERİR.**
 * `ReportCategory`ye yeni bir kategori eklendiğinde (`domain/social/
 * moderation.ts` → `REPORT_CATEGORIES` + `player_reports.category` CHECK'i)
 * buraya yazılmadan `tsc` geçmez. Bu bilinçlidir: kategori kümesinin TEK
 * kaynağı sunucudur ve istemci onu İKİNCİ kez listeleyemez — yalnızca
 * ETİKETLERİNİ tutar (bkz. `apiClient.reportPlayer` notu).
 */
const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  spam: 'Spam / reklam',
  harassment: 'Taciz veya hakaret',
  cheating: 'Hile / kural dışı davranış',
  offensive_name: 'Uygunsuz kullanıcı adı',
  other: 'Diğer',
};

/**
 * Açılır listedeki SIRA. `Object.keys` ile türetilir, elle yazılmaz —
 * ikinci bir liste, yeni kategori eklendiğinde ayrışırdı.
 */
const REPORT_CATEGORY_ORDER = Object.keys(REPORT_CATEGORY_LABELS) as ReportCategory[];
