'use client';

/**
 * Yönetim paneli — brief §34 "ADMIN PANEL", §42 PHASE 15-B (28.09.2026).
 *
 * **BU EKRAN BİR YETKİ KAPISI DEĞİLDİR.** Sunucudaki yedi uç noktanın
 * hepsi `players.is_admin`i HER İSTEKTE veritabanından okur ve yönetici
 * olmayan çağırana 403 `ADMIN_REQUIRED` döner (§13.17). Burada 403'ü
 * yakalayıp bir "yetkiniz yok" mesajı göstermek, oyuncuya nazik bir kapı
 * kapatma jestidir — güvenlik değildir. Üst bardaki bağlantının
 * gizlenmesi de öyle. İkisini de "yetki kontrolü" sanmak, sunucudaki
 * gerçek kapıyı gereksiz sanmaya götürür.
 *
 * **EKRAN HİÇBİR KURAL HESAPLAMAZ.** Hangi şikâyet geçişinin yasal olduğu
 * (`allowedTransitions`) ve hangi yarışın iptal edilebileceği
 * (`cancelRefusal`) SUNUCUDAN gelir. Bu ikisini burada yeniden türetmek,
 * iki kaynağın çeliştiği bir an üretirdi — ve o an, sunucunun reddedeceği
 * bir **para işlemini** ("İptal Et") geçerli göstermek olurdu. Ekranın işi
 * göstermek ve sunucunun cevabını aktarmaktır.
 *
 * **`limit` GÖNDERİLMEZ.** Liste boyutları `config/admin.config.json`dan
 * gelir; istemcinin boyut seçmesi, sunucunun kabul etmeyeceği bir
 * parametre uydurmak olurdu.
 *
 * **NEDEN `nav-links.ts`'TE DEĞİL:** o liste HER oyuncuya çizilir. `/admin`
 * oraya girseydi yönetici olmayan herkes 403 alan bir bağlantı görürdü —
 * üstelik `top-bar-nav.spec.ts` "şeritteki her bağlantının sayfası vardır"
 * kilitini de anlamsızca geçerdi (sayfa VAR, yetki YOK). Bağlantı bu
 * yüzden üst barda koşullu çizilir.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  AdminAuditLogView,
  AdminPlayerAccountView,
  AdminRaceView,
  AdminReportView,
  AdminTransactionView,
  RaceCancelRefusal,
  RaceStatus,
  ReportCategory,
  ReportStatus,
} from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ApiError, apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';
import { LiveEventsAdmin } from '../../features/admin/LiveEventsAdmin';
import { AnomaliesAdmin } from '../../features/admin/AnomaliesAdmin';
import { AnnouncementsAdmin } from '../../features/admin/AnnouncementsAdmin';
import { PlayerModerationPanel } from '../../features/admin/PlayerModerationPanel';
import { ROLE_LABELS, SANCTION_LABELS, canSeeTab, roleOf } from '../../features/admin/moderation-labels';
import { formatCurrency } from '../../lib/currency';

/** Sekmeler — her biri kendi ucunu KENDİ açılışında çeker (tek istek yeter). */
const TABS = [
  ['reports', 'Şikâyetler'],
  ['players', 'Oyuncular'],
  ['races', 'Yarışlar'],
  ['transactions', 'İşlemler'],
  ['audit', 'Denetim Günlüğü'],
  // 02.10.2026 — Faz 11-A.
  ['announcements', 'Duyurular'],
  // 02.10.2026 — Faz 11-B.
  ['events', 'Etkinlikler'],
  // 02.10.2026 — Faz 7 (moderatör de görür).
  ['anomalies', 'Şüpheli'],
] as const;

type TabId = (typeof TABS)[number][0];

/**
 * `Record<...>` bilinçlidir: sunucudaki kapalı kümeye yeni bir değer
 * eklenirse burası DERLEME HATASI verir (bkz. `CURRENCY_LABELS` deseni).
 * Etiketler TÜRKÇEDİR çünkü kullanıcıya görünürler; değerler sunucunun
 * sözlüğüdür ve çevrilmez.
 */
const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Açık',
  reviewing: 'İncelemede',
  resolved: 'Çözüldü',
  dismissed: 'Reddedildi',
};

const RACE_STATUS_LABELS: Record<RaceStatus, string> = {
  scheduled: 'Planlandı',
  locking: 'Kilitleniyor',
  in_progress: 'Koşuyor',
  finished: 'Bitti',
  cancelled: 'İptal edildi',
};

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  spam: 'Spam',
  harassment: 'Taciz',
  cheating: 'Hile',
  offensive_name: 'Uygunsuz ad',
  other: 'Diğer',
};

/**
 * İptal reddinin gerekçesi. Kod tanınmazsa (sunucuya yeni bir neden
 * eklendiyse) kodun KENDİSİ gösterilir — uydurma bir Türkçe metin
 * üretmek, olmayan bir kuralı varmış gibi gösterirdi.
 */
const CANCEL_REFUSAL_LABELS: Record<RaceCancelRefusal, string> = {
  ALREADY_STARTED: 'Yarış koşuyor, iptal edilemez',
  ALREADY_FINISHED: 'Yarış koştu, ödüller dağıtıldı',
  ALREADY_CANCELLED: 'Zaten iptal edilmiş',
  UNKNOWN_STATUS: 'Durum tanınmıyor',
};

export default function AdminPage(): React.ReactElement {
  const [tab, setTab] = useState<TabId>('reports');
  // 02.10.2026 (Faz 10) — sekmeler role göre süzülür: moderatör yalnızca
  // şikâyetleri ve oyuncuları görür. Kapı SUNUCUDADIR; bu süzme yalnızca
  // moderatörün yöneticiye özel bir sekmede 403 alıp paneli kilitlemesini önler.
  const { player: me } = usePlayer();
  const actorRole = roleOf(me);
  const visibleTabs = TABS.filter(([id]) => canSeeTab(actorRole, id));
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  /** 403 `ADMIN_REQUIRED` görüldü mü — görülünce diğer sekmeler de denenmez. */
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [reports, setReports] = useState<AdminReportView[] | null>(null);
  const [players, setPlayers] = useState<AdminPlayerAccountView[] | null>(null);
  const [races, setRaces] = useState<AdminRaceView[] | null>(null);
  const [transactions, setTransactions] = useState<AdminTransactionView[] | null>(null);
  const [auditLog, setAuditLog] = useState<AdminAuditLogView[] | null>(null);

  /**
   * 403'ü AYIRT EDEN tek yer. `ApiError.code` olmadan bu ayrım
   * yapılamazdı: sunucu 403'ü "yetki yok" için de, "engellendin" için de
   * kullanır (`PLAYER_BLOCKED`). Metin eşleştirmek (`message.includes`)
   * sunucudaki bir yazım düzeltmesiyle sessizce bozulurdu.
   */
  const handleError = useCallback((err: unknown, fallback: string): void => {
    if (err instanceof ApiError && (err.code === 'ADMIN_REQUIRED' || err.status === 403)) {
      setDenied(true);
      return;
    }
    setError(err instanceof Error ? err.message : fallback);
  }, []);

  const load = useCallback(
    async (which: TabId): Promise<void> => {
      setError(null);
      try {
        if (which === 'reports') setReports((await apiClient.listAdminReports()).reports);
        else if (which === 'players') setPlayers((await apiClient.listAdminPlayers()).players);
        else if (which === 'races') setRaces((await apiClient.listAdminRaces()).races);
        else if (which === 'transactions')
          setTransactions((await apiClient.listAdminTransactions()).transactions);
        else if (which === 'audit') setAuditLog((await apiClient.listAdminAuditLog()).entries);
        // 'announcements' sekmesi kendi listesini kendisi çeker.
      } catch (err: unknown) {
        handleError(err, 'Liste yüklenemedi');
      }
    },
    [handleError],
  );

  useEffect(() => {
    if (denied) return;
    void load(tab);
  }, [tab, denied, load]);

  /**
   * Şikâyet durumunu ilerletir. Geçiş kuralı SUNUCUDA; burada yalnızca
   * sunucunun `allowedTransitions` ile açtığı düğmeler çizilir.
   */
  const changeReportStatus = useCallback(
    async (reportId: string, status: ReportStatus): Promise<void> => {
      setPending(true);
      setError(null);
      setNotice(null);
      try {
        await apiClient.updateReportStatus(reportId, status);
        setNotice(`Şikâyet güncellendi: ${REPORT_STATUS_LABELS[status]}`);
        await load('reports');
      } catch (err: unknown) {
        handleError(err, 'Şikâyet güncellenemedi');
      } finally {
        setPending(false);
      }
    },
    [handleError, load],
  );

  /**
   * Yarış iptali — **BİR PARA YOLUDUR.** Yanıt "iptal edildi" demekle
   * kalmaz, kaç oyuncuya ne kadar iade edildiğini söyler; ekran onu
   * gösterir, çünkü "iptal ettim" tek başına iadenin yapıldığını
   * kanıtlamaz.
   */
  const cancelRace = useCallback(
    async (race: AdminRaceView): Promise<void> => {
      setPending(true);
      setError(null);
      setNotice(null);
      try {
        const result = await apiClient.cancelAdminRace(race.raceId);
        setNotice(
          result.refundedPlayers === 0
            ? `“${result.name}” iptal edildi. İade edilecek ödeme yoktu.`
            : `“${result.name}” iptal edildi. ${result.refundedPlayers} oyuncuya ` +
                `${formatCurrency('money', result.refundedTotal)} iade edildi.`,
        );
        await load('races');
      } catch (err: unknown) {
        handleError(err, 'Yarış iptal edilemedi');
      } finally {
        setPending(false);
      }
    },
    [handleError, load],
  );

  if (denied) {
    return (
      <main className="page-container">
        <h1 style={titleStyle}>Yönetim</h1>
        <GlassPanel>
          <p style={{ color: 'var(--color-status-warning)', marginTop: 0, marginBottom: 'var(--space-sm)' }}>
            Bu ekran yalnızca yöneticilere ve moderatörlere açıktır.
          </p>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 0, fontSize: '13px' }}>
            Hesabına yönetim rolü tanımlı değil. Rolü yalnızca bir yönetici verir ve bu işlem
            denetim günlüğüne yazılır; oyun içinden kendiliğinden alınabilecek bir şey değildir.
          </p>
        </GlassPanel>
      </main>
    );
  }

  return (
    <main className="page-container">
      <h1 style={titleStyle}>Yönetim</h1>
      <p style={subtitleStyle}>
        Moderasyon kuyruğu, hesaplar, yarışlar, para hareketleri ve denetim günlüğü.
      </p>

      <nav aria-label="Yönetim sekmeleri" style={tabBarStyle}>
        {visibleTabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setNotice(null);
              setTab(id);
            }}
            aria-current={tab === id}
            style={tabButtonStyle(tab === id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}
      {notice ? <p style={{ color: 'var(--color-status-positive)' }}>{notice}</p> : null}

      {tab === 'reports' ? (
        <ReportsTab rows={reports} pending={pending} onChange={changeReportStatus} />
      ) : null}
      {tab === 'players' ? (
        <>
          <PlayersTab rows={players} selectedId={selectedPlayerId} onSelect={setSelectedPlayerId} />
          {selectedPlayerId !== null && players?.some((row) => row.playerId === selectedPlayerId) ? (
            <PlayerModerationPanel
              key={selectedPlayerId}
              player={players.find((row) => row.playerId === selectedPlayerId)!}
              actorRole={actorRole}
              onChanged={(message) => {
                setNotice(message);
                void load('players');
              }}
            />
          ) : null}
        </>
      ) : null}
      {tab === 'announcements' ? <AnnouncementsAdmin onChanged={setNotice} /> : null}
      {tab === 'events' ? <LiveEventsAdmin onChanged={setNotice} /> : null}
      {tab === 'anomalies' ? <AnomaliesAdmin /> : null}
      {tab === 'races' ? <RacesTab rows={races} pending={pending} onCancel={cancelRace} /> : null}
      {tab === 'transactions' ? <TransactionsTab rows={transactions} /> : null}
      {tab === 'audit' ? <AuditTab rows={auditLog} /> : null}
    </main>
  );
}

function Loading({ rows }: { rows: unknown[] | null }): React.ReactElement | null {
  if (rows !== null) return null;
  return <p style={{ color: 'var(--color-text-muted)' }}>Yükleniyor…</p>;
}

function Empty({ rows, text }: { rows: unknown[] | null; text: string }): React.ReactElement | null {
  if (rows === null || rows.length > 0) return null;
  return (
    <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
      <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{text}</p>
    </GlassPanel>
  );
}

/** `AdminPlayerRef`i "Ad" ya da "Ad (silinmiş hesap yok)" biçiminde gösterir. */
function playerRefText(ref: { displayName: string } | null): string {
  return ref === null ? '—' : ref.displayName;
}

function ReportsTab({
  rows,
  pending,
  onChange,
}: {
  rows: AdminReportView[] | null;
  pending: boolean;
  onChange: (reportId: string, status: ReportStatus) => void;
}): React.ReactElement {
  return (
    <>
      <Loading rows={rows} />
      <Empty rows={rows} text="Kuyrukta bekleyen şikâyet yok." />
      {rows && rows.length > 0 ? (
        <GlassPanel style={{ padding: 0, overflow: 'hidden' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerCellStyle(undefined, 'left')}>Şikâyet eden → edilen</th>
                <th style={headerCellStyle('128px', 'left')}>Kategori</th>
                <th style={headerCellStyle('112px', 'left')}>Durum</th>
                <th style={headerCellStyle('128px', 'left')}>Son işlem</th>
                <th style={headerCellStyle('280px', 'left')}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.reportId} style={rowStyle}>
                  <td style={bodyCellStyle(undefined, 'left')}>
                    <span style={{ color: 'var(--color-text-primary)' }}>
                      {playerRefText(row.reporter)}
                    </span>
                    <span style={{ color: 'var(--color-text-muted)' }}> → </span>
                    <span style={{ color: 'var(--color-text-primary)' }}>
                      {playerRefText(row.reported)}
                    </span>
                    {row.reason ? (
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                        “{row.reason}”
                      </div>
                    ) : null}
                  </td>
                  <td style={{ ...bodyCellStyle('128px', 'left'), color: 'var(--color-text-secondary)' }}>
                    {CATEGORY_LABELS[row.category]}
                  </td>
                  <td style={{ ...bodyCellStyle('112px', 'left'), color: 'var(--color-accent-gold)' }}>
                    {REPORT_STATUS_LABELS[row.status]}
                  </td>
                  <td style={{ ...bodyCellStyle('128px', 'left'), color: 'var(--color-text-muted)', fontSize: '12px' }}>
                    {row.reviewedBy ? playerRefText(row.reviewedBy) : '—'}
                  </td>
                  <td style={bodyCellStyle('280px', 'left')}>
                    {row.allowedTransitions.length === 0 ? (
                      // Terminal durum: sunucu HİÇBİR geçiş açmıyor. Bu bir
                      // eksiklik değil, kapalı çizgenin sonucudur — kapanmış
                      // bir şikâyet geri açılamaz (§13.17).
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                        Kapanmış kayıt — geçiş yok
                      </span>
                    ) : (
                      row.allowedTransitions.map((next) => (
                        <button
                          key={next}
                          type="button"
                          disabled={pending}
                          onClick={() => onChange(row.reportId, next)}
                          style={actionButtonStyle(pending)}
                        >
                          {REPORT_STATUS_LABELS[next]}
                        </button>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      ) : null}
      {rows && rows.length > 0 ? (
        <p style={footnoteStyle}>
          Düğmeler sunucunun açtığı geçişlerdir; geçersiz bir geçiş yine de denenirse sunucu
          reddeder ve gerekçesini yukarıda gösterir.
        </p>
      ) : null}
    </>
  );
}

function PlayersTab({
  rows,
  selectedId,
  onSelect,
}: {
  rows: AdminPlayerAccountView[] | null;
  selectedId: string | null;
  onSelect: (playerId: string | null) => void;
}): React.ReactElement {
  return (
    <>
      <Loading rows={rows} />
      <Empty rows={rows} text="Kayıtlı hesap yok." />
      {rows && rows.length > 0 ? (
        <GlassPanel style={{ padding: 0, overflow: 'hidden' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerCellStyle(undefined, 'left')}>Hesap</th>
                <th style={headerCellStyle('72px', 'right')}>Seviye</th>
                <th style={headerCellStyle('112px', 'right')}>Çip</th>
                <th style={headerCellStyle('112px', 'right')}>Elmas</th>
                <th style={headerCellStyle('96px', 'right')}>İtibar</th>
                <th style={headerCellStyle('96px', 'right')}>Rol</th>
                <th style={headerCellStyle('120px', 'right')}>Durum</th>
                <th style={headerCellStyle('88px', 'right')}> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.playerId} style={rowStyle}>
                  <td style={bodyCellStyle(undefined, 'left')}>
                    <span style={{ color: 'var(--color-text-primary)' }}>{row.displayName}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}> @{row.username}</span>
                  </td>
                  <td style={bodyCellStyle('72px')}>{row.level}</td>
                  <td style={bodyCellStyle('112px')}>{row.money.toLocaleString('tr-TR')}</td>
                  <td style={bodyCellStyle('112px')}>{row.gems.toLocaleString('tr-TR')}</td>
                  <td style={bodyCellStyle('96px')}>{row.reputation}</td>
                  <td style={bodyCellStyle('96px')}>
                    {row.isAdmin || row.isModerator ? (
                      <span style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>
                        {ROLE_LABELS[roleOf(row)]}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={bodyCellStyle('120px')}>
                    {row.activeSanction ? (
                      <span style={{ color: 'var(--color-status-critical)', fontWeight: 600 }}>
                        {SANCTION_LABELS[row.activeSanction.kind]}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>Aktif</span>
                    )}
                  </td>
                  <td style={bodyCellStyle('88px')}>
                    <button
                      type="button"
                      className="session-revoke"
                      aria-pressed={selectedId === row.playerId}
                      onClick={() => onSelect(selectedId === row.playerId ? null : row.playerId)}
                    >
                      {selectedId === row.playerId ? 'Kapat' : 'Yönet'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      ) : null}
      {rows && rows.length > 0 ? (
        <p style={footnoteStyle}>
          Bu liste bakiye taşır ve yalnızca yöneticiye açıktır — herkese açık profil ucu
          (`/profile/:username`) bakiyeyi bilinçli olarak göstermez. Yaptırım ve rol
          değişiklikleri denetim günlüğüne yazılır.
        </p>
      ) : null}
    </>
  );
}

function RacesTab({
  rows,
  pending,
  onCancel,
}: {
  rows: AdminRaceView[] | null;
  pending: boolean;
  onCancel: (race: AdminRaceView) => void;
}): React.ReactElement {
  return (
    <>
      <Loading rows={rows} />
      <Empty rows={rows} text="Görüntülenecek yarış yok." />
      {rows && rows.length > 0 ? (
        <GlassPanel style={{ padding: 0, overflow: 'hidden' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerCellStyle(undefined, 'left')}>Yarış</th>
                <th style={headerCellStyle('112px', 'left')}>Durum</th>
                <th style={headerCellStyle('96px', 'right')}>Oyuncu</th>
                <th style={headerCellStyle('112px', 'right')}>Giriş</th>
                <th style={headerCellStyle('112px', 'right')}>Havuz</th>
                <th style={headerCellStyle('200px', 'left')}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.raceId} style={rowStyle}>
                  <td style={bodyCellStyle(undefined, 'left')}>
                    <span style={{ color: 'var(--color-text-primary)' }}>{row.name}</span>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '2px' }}>
                      {row.raceType === 'paid' ? 'Ücretli' : 'Ücretsiz'} · {row.surface} ·{' '}
                      {row.distanceM} m · {new Date(row.startTime).toLocaleString('tr-TR')}
                    </div>
                  </td>
                  <td style={{ ...bodyCellStyle('112px', 'left'), color: 'var(--color-text-secondary)' }}>
                    {RACE_STATUS_LABELS[row.status]}
                  </td>
                  <td style={bodyCellStyle('96px')}>
                    {row.joinedPlayers} / {row.maxPlayers}
                  </td>
                  <td style={bodyCellStyle('112px')}>{row.entryFee.toLocaleString('tr-TR')}</td>
                  <td style={bodyCellStyle('112px')}>{row.prizePool.toLocaleString('tr-TR')}</td>
                  <td style={bodyCellStyle('200px', 'left')}>
                    {row.cancelRefusal === null ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onCancel(row)}
                        style={dangerButtonStyle(pending)}
                      >
                        İptal Et ve İade Et
                      </button>
                    ) : (
                      // Sunucu "iptal edilemez" diyor; NEDENİNİ söylüyoruz.
                      // Düğmeyi yine de çizmek, basıldığında her seferinde
                      // hata veren bir vaat olurdu.
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                        {CANCEL_REFUSAL_LABELS[row.cancelRefusal]}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      ) : null}
      {rows && rows.length > 0 ? (
        <p style={footnoteStyle}>
          İptal bir para yoludur: katılım ücreti ödemiş her oyuncuya defterden okunan tutar iade
          edilir, havuz sıfırlanır ve denetim günlüğüne kayıt düşer. Koşmuş bir yarış iptal
          edilemez — orada iade, kazanana ödenen ödül değil ödediği giriş ücreti olurdu.
        </p>
      ) : null}
    </>
  );
}

function TransactionsTab({ rows }: { rows: AdminTransactionView[] | null }): React.ReactElement {
  return (
    <>
      <Loading rows={rows} />
      <Empty rows={rows} text="Defterde hareket yok." />
      {rows && rows.length > 0 ? (
        <GlassPanel style={{ padding: 0, overflow: 'hidden' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerCellStyle('160px', 'left')}>Zaman</th>
                <th style={headerCellStyle(undefined, 'left')}>Hesap</th>
                <th style={headerCellStyle('160px', 'left')}>Tür</th>
                <th style={headerCellStyle('128px', 'right')}>Tutar</th>
                <th style={headerCellStyle('128px', 'right')}>Bakiye</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.transactionId} style={rowStyle}>
                  <td style={{ ...bodyCellStyle('160px', 'left'), color: 'var(--color-text-muted)', fontSize: '12px' }}>
                    {new Date(row.createdAt).toLocaleString('tr-TR')}
                  </td>
                  <td style={{ ...bodyCellStyle(undefined, 'left'), color: 'var(--color-text-primary)' }}>
                    {playerRefText(row.player)}
                  </td>
                  <td style={{ ...bodyCellStyle('160px', 'left'), color: 'var(--color-text-secondary)' }}>
                    {row.type}
                  </td>
                  <td
                    style={{
                      ...bodyCellStyle('128px'),
                      // YÖN SUNUCUNUN İŞARETLİ `amount`UDUR — burada
                      // yeniden türetilmez, yalnızca renklendirilir.
                      color: row.amount < 0 ? 'var(--color-status-critical)' : 'var(--color-status-positive)',
                      fontWeight: 600,
                    }}
                  >
                    {formatCurrency(row.currency, row.amount)}
                  </td>
                  <td style={{ ...bodyCellStyle('128px'), color: 'var(--color-text-muted)', fontSize: '12px' }}>
                    {row.balanceBefore.toLocaleString('tr-TR')} → {row.balanceAfter.toLocaleString('tr-TR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      ) : null}
      {rows && rows.length > 0 ? (
        <p style={footnoteStyle}>
          Defter satırları değiştirilemez (migration 0038). Hediyeler ayrı bir liste değildir —
          aynı defterin <code>gift_send</code> satırlarıdır.
        </p>
      ) : null}
    </>
  );
}

function AuditTab({ rows }: { rows: AdminAuditLogView[] | null }): React.ReactElement {
  return (
    <>
      <Loading rows={rows} />
      <Empty rows={rows} text="Denetim günlüğü boş." />
      {rows && rows.length > 0 ? (
        <GlassPanel style={{ padding: 0, overflow: 'hidden' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerCellStyle('160px', 'left')}>Zaman</th>
                <th style={headerCellStyle(undefined, 'left')}>Yönetici</th>
                <th style={headerCellStyle('200px', 'left')}>Eylem</th>
                <th style={headerCellStyle('200px', 'left')}>Ayrıntı</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={rowStyle}>
                  <td style={{ ...bodyCellStyle('160px', 'left'), color: 'var(--color-text-muted)', fontSize: '12px' }}>
                    {new Date(row.createdAt).toLocaleString('tr-TR')}
                  </td>
                  <td style={{ ...bodyCellStyle(undefined, 'left'), color: 'var(--color-text-primary)' }}>
                    {playerRefText(row.admin)}
                  </td>
                  <td style={{ ...bodyCellStyle('200px', 'left'), color: 'var(--color-text-secondary)' }}>
                    {row.action}
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>{row.targetType}</div>
                  </td>
                  <td style={{ ...bodyCellStyle('200px', 'left'), color: 'var(--color-text-muted)', fontSize: '12px' }}>
                    {JSON.stringify(row.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      ) : null}
      {rows && rows.length > 0 ? (
        <p style={footnoteStyle}>
          Bu günlük bir muhasebe defteri DEĞİLDİR: yetki kaydıdır ("kim hangi yönetim işlemini
          yaptı"). Para hareketleri İşlemler sekmesindedir.
        </p>
      ) : null}
    </>
  );
}

// --- Stiller ---------------------------------------------------------------
// Satır içi (inline) tutulur: projede ortak bir tablo/düğme bileşeni YOKTUR
// ve `leaderboard/page.tsx` aynı deseni kullanır. Yeni bir ortak bileşen
// çıkarmak bu dilimin işi değil — üçüncü bir tüketici doğduğunda yapılır.

const titleStyle: React.CSSProperties = {
  fontSize: '24px',
  color: 'var(--color-text-primary)',
  marginBottom: '4px',
};

const subtitleStyle: React.CSSProperties = {
  color: 'var(--color-text-secondary)',
  marginTop: 0,
  marginBottom: 'var(--space-md)',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-xs)',
  marginBottom: 'var(--space-lg)',
};

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };

const rowStyle: React.CSSProperties = { borderTop: '1px solid var(--color-border)' };

const footnoteStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: '13px',
  marginTop: 'var(--space-md)',
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    background: active ? 'var(--color-bg-surface-elevated)' : 'transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    border: `1px solid ${active ? 'var(--color-accent-gold)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
  };
}

function actionButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    marginRight: '4px',
    background: 'transparent',
    color: 'var(--color-accent-gold)',
    border: '1px solid var(--color-accent-gold)',
    borderRadius: 'var(--radius-md)',
    fontSize: '12px',
    fontWeight: 600,
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  };
}

function dangerButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    background: 'transparent',
    color: 'var(--color-status-critical)',
    border: '1px solid var(--color-status-critical)',
    borderRadius: 'var(--radius-md)',
    fontSize: '12px',
    fontWeight: 600,
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  };
}

function headerCellStyle(width: string | undefined, align: 'left' | 'right' = 'right'): React.CSSProperties {
  return {
    width,
    textAlign: align,
    padding: 'var(--space-md)',
    color: 'var(--color-text-muted)',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };
}

function bodyCellStyle(width: string | undefined, align: 'left' | 'right' = 'right'): React.CSSProperties {
  return { width, textAlign: align, padding: 'var(--space-md)', fontSize: '14px' };
}
