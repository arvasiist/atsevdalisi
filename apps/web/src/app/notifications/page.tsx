'use client';

/**
 * `/notifications` — BİLDİRİMLER + YARIŞ DAVETLERİ (brief §28 SOCIAL
 * NOTIFICATIONS, §16 RACE INVITE, §35 `/notifications`, 28.09.2026).
 *
 * Bu, brief §42 PHASE 11'in backend'ini (beş uç nokta + üç WebSocket olayı,
 * `PROJE_DURUMU.md` §13.11) tüketen İLK istemcidir. O güne kadar bu yüzeyin
 * hiçbir istemci tüketicisi yoktu.
 *
 * **SUNUCU OTORİTESİ (CLAUDE.md kural 1):** bu ekran HİÇBİR iş kuralı
 * UYGULAMAZ. "Bu bildirim okunmuş mu", "bu davet hâlâ geçerli mi", "kaç
 * okunmamış var" — hepsi sunucudan gelir. İstemci yalnızca sunucunun
 * döndürdüğü duruma göre düğme gösterir/gizler; `unreadCount` listeden
 * SAYILMAZ (liste `limit` ile kırpılmıştır, bkz. `NotificationListResult`
 * doc yorumu) — ayrı bir alan olarak okunur.
 *
 * **CANLI GÜNCELLEME — soket olayı bir "TAZELE" SİNYALİDİR, veri kaynağı
 * DEĞİL.** `notification.created` olayı zaten veritabanına yazılmış satırı
 * taşır ve teorik olarak doğrudan listeye eklenebilirdi; bu BİLİNÇLİ olarak
 * yapılmadı:
 *
 *  1. **Sıra/kırpma kayması:** sunucu listeyi `limit` ile kırpar. Olayı
 *     doğrudan eklemek, istemcideki listeyi sunucudakinin BİR FAZLA
 *     elemanlı hâline getirirdi — yani ekranda görünen liste, bir sonraki
 *     tam yüklemede KENDİLİĞİNDEN değişirdi.
 *  2. **İki olay, tek satır:** `sendRaceInvite` HEM `notification.created`
 *     HEM `race.invite` yayınlar (bkz. `race.gateway.ts` `notifyNotification`
 *     doc yorumu — biri rozet listesi, diğeri iki düğmeli kart için). İkisini
 *     de listeye eklemek AYNI daveti İKİ KEZ gösterirdi; hangi olayın hangi
 *     satıra karşılık geldiğini istemcide eşlemek, sunucuda ZATEN var olan
 *     bilgiyi istemcide TAKLİT etmek olurdu.
 *  3. **`race.invite.responded`:** bu olay DAVET EDENE gider ve onun
 *     bildirim listesinde KARŞILIĞI YOKTUR — listeye eklenecek bir satır
 *     değil, "bekleyen davetim yanıtlandı" bilgisidir.
 *
 * Bu yüzden üç olay da aynı şeyi yapar: listeyi sunucudan YENİDEN ister.
 * Bedeli, olay başına bir istektir — kazanç, ekranda görünenin HER ZAMAN
 * sunucudaki gerçek satır olmasıdır.
 *
 * **SOKET BEST-EFFORT'TUR:** bağlanamazsa sayfa ÇALIŞMAYA DEVAM EDER,
 * yalnızca canlı güncellenmez (`onConnectError` bir uyarı satırı yazar).
 * Yeniden bağlanma/kuyruk mantığı YAZILMADI — `socket.io-client`'ın kendi
 * otomatik yeniden bağlanması yeterlidir ve o da olmasa ekran YANLIŞ bir
 * şey göstermez, sadece eskir (bkz. `notification-socket.ts` doc yorumu).
 *
 * **DAVET KARTINDAKİ `[Kabul Et]` YARIŞA KATILMAK DEĞİLDİR** — bu, sunucu
 * sözleşmesidir (`RespondRaceInviteResult` doc yorumu): katılım bir ATA ve
 * bir giriş ücretine bağlıdır ve tek yoldan (`POST /races/:id/join`) geçer.
 * Kabulden sonra kullanıcı yarış ekranına yönlendirilir. Ücretli lobi
 * yarışının KENDİ katılım ekranı (`/races/:id`) HENÜZ YOKTUR — bu bilinen
 * ve dürüstçe belirtilen bir boşluktur, sahte bir akış UYDURULMAMIŞTIR.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { NotificationListResult, NotificationView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { connectNotificationSocket } from '../../features/notifications/notification-socket';
import { API_BASE_URL, apiClient, getAuthToken } from '../../lib/api-client';
import { CURRENCY_LABELS, formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

export default function NotificationsPage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [data, setData] = useState<NotificationListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Soket kurulamadıysa gösterilen UYARI — sayfayı kilitlemez (bkz. dosya başı). */
  const [socketWarning, setSocketWarning] = useState<string | null>(null);
  /** Satır bazlı "işleniyor" durumu — bir isteği yanıtlarken TÜM liste kilitlenmez. */
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  /**
   * BU OTURUMDA yanıtlanmış davetler.
   *
   * **NEDEN GEREKLİ:** davet bildiriminin `payload`ı davetin DURUMUNU
   * taşımaz (yalnızca `inviteId`/`raceId`/`raceName`/davet eden) ve
   * `GET /race-invites/:id` diye bir uç nokta YOKTUR — yani istemci,
   * yanıtlanmış bir davetin düğmelerini gizlemek için sunucudan bilgi
   * ALAMAZ. Sunucudan gelmeyen bir durumu TAHMİN etmek (ör. "okunmadıysa
   * hâlâ bekliyordur") yanlış olurdu: `respond` bildirimi okundu
   * İŞARETLEMEZ (bkz. `RespondRaceInviteUseCase`), yani böyle bir tahmin
   * düğmeleri hiç gizlemezdi.
   *
   * Bu yüzden yalnızca KENDİ yaptığımız işlem hatırlanır — sunucu
   * durumunun taklidi DEĞİL, kendi eylemimizin kaydıdır. Sayfa yenilenince
   * küme boşalır ve düğmeler geri gelir; sunucu zaten 409 ile reddeder ve
   * gerekçeyi söyler (bu, bilinçli olarak kabul edilen sınırdır).
   */
  const [respondedInvites, setRespondedInvites] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async (playerId: string): Promise<NotificationListResult> => {
    return apiClient.getNotifications(playerId);
  }, []);

  /**
   * Oyuncu kimliği — soketin kapanışında (cleanup) gerekir. `useEffect`
   * bağımlılığına `player` nesnesini koymak her bakiye tazelemesinde
   * yeniden bağlanmaya yol açardı; kimlik ise sabittir.
   */
  const playerId = player?.id ?? null;
  const playerIdRef = useRef<string | null>(null);
  playerIdRef.current = playerId;

  useEffect(() => {
    if (!playerId) {
      return;
    }
    let cancelled = false;
    setData(null);
    setError(null);
    void load(playerId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Bildirimler yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, load]);

  /**
   * CANLI BAĞLANTI. Token `localStorage`'dan okunur (`online/page.tsx` ile
   * AYNI yol) — `player` nesnesi token TAŞIMAZ. Token yoksa soket HİÇ
   * kurulmaz ve uyarı da yazılmaz: oyuncu kimliği olmadan bu sayfa zaten
   * anlamsızdır ve `player` gelmeden bir "bağlantı hatası" göstermek
   * gürültü olurdu.
   */
  useEffect(() => {
    if (!playerId) {
      return;
    }
    const token = getAuthToken();
    if (!token) {
      return;
    }

    /** Olay geldiğinde listeyi sunucudan YENİDEN ister (bkz. dosya başı 1-2-3). */
    const refresh = (): void => {
      const currentId = playerIdRef.current;
      if (!currentId) return;
      void load(currentId)
        .then(setData)
        .catch((err: unknown) => {
          // Sessizce yutulmaz: kullanıcı canlı güncellemeyi bekliyordur.
          setSocketWarning(err instanceof Error ? err.message : 'Bildirimler tazelenemedi');
        });
    };

    const socket = connectNotificationSocket(API_BASE_URL, token, {
      onNotification: refresh,
      onRaceInvite: refresh,
      onRaceInviteResponded: refresh,
      onConnectError: (message) => setSocketWarning(`Canlı bildirim bağlantısı kurulamadı: ${message}`),
    });

    return () => {
      socket.disconnect();
    };
  }, [playerId, load]);

  /** Ortak hata yakalayıcı — her eylem aynı `error` satırını besler. */
  const runAction = useCallback(
    async (key: string, action: () => Promise<void>, fallbackMessage: string): Promise<void> => {
      setPendingKey(key);
      setError(null);
      try {
        await action();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : fallbackMessage);
      } finally {
        setPendingKey(null);
      }
    },
    [],
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!playerId) return;
    setData(await load(playerId));
  }, [playerId, load]);

  /** Tek bildirimi okundu işaretler (idempotent — bkz. `api-client`). */
  const markRead = (notification: NotificationView): Promise<void> =>
    runAction(
      notification.notificationId,
      async () => {
        await apiClient.markNotificationRead(playerId ?? '', notification.notificationId);
        await refresh();
      },
      'Bildirim okundu işaretlenemedi',
    );

  const markAllRead = (): Promise<void> =>
    runAction(
      'read-all',
      async () => {
        setIsMarkingAll(true);
        try {
          await apiClient.markAllNotificationsRead(playerId ?? '');
          await refresh();
        } finally {
          setIsMarkingAll(false);
        }
      },
      'Bildirimler okundu işaretlenemedi',
    );

  /**
   * Daveti yanıtlar. `[Kabul Et]` YARIŞA KATILMAK DEĞİLDİR (bkz. dosya
   * başı) — sunucu yalnızca davetin durumunu değiştirir; giriş ücreti
   * ikinci adımda, yarış ekranından ödenir.
   */
  const respondInvite = (inviteId: string, action: 'accept' | 'decline'): Promise<void> =>
    runAction(
      inviteId,
      async () => {
        await apiClient.respondRaceInvite(playerId ?? '', inviteId, action);
        // Yalnızca BAŞARILI yanıttan SONRA hatırlanır: sunucu reddettiyse
        // (ör. 409 — davet zaten yanıtlanmış) düğmeler GÖRÜNÜR kalmalıdır
        // ki kullanıcı nedenini okuyup yeniden deneyebilsin.
        setRespondedInvites((current) => new Set(current).add(inviteId));
        await refresh();
      },
      'Davet yanıtlanamadı',
    );

  const notifications = data?.notifications ?? null;
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <main className="page-container">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', margin: '0 0 4px 0' }}>
            Bildirimler{unreadCount > 0 ? ` (${unreadCount} okunmamış)` : ''}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '13px' }}>
            Arkadaşlık istekleri, yarış davetleri, hediyeler, mesajlar ve ödüller burada toplanır.
          </p>
        </div>
        {unreadCount > 0 ? (
          <button
            type="button"
            disabled={isMarkingAll}
            onClick={() => void markAllRead()}
            style={secondaryButtonStyle()}
          >
            {isMarkingAll ? 'İşaretleniyor…' : 'Tümünü okundu işaretle'}
          </button>
        ) : null}
      </div>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Bildirimlerini görebilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} style={primaryButtonStyle()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {socketWarning ? (
        <p style={{ color: 'var(--color-status-warning)', fontSize: '13px' }}>{socketWarning}</p>
      ) : null}
      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}

      {player && notifications === null && !error ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Yükleniyor…</p>
      ) : null}

      {player && notifications !== null && notifications.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Henüz bildirimin yok. Yeni arkadaş bulmak için{' '}
            <Link href="/leaderboard" style={{ color: 'var(--color-accent-gold)' }}>
              sıralama tablosuna
            </Link>{' '}
            göz at.
          </p>
        </GlassPanel>
      ) : null}

      {notifications !== null && notifications.length > 0 ? (
        <GlassPanel style={{ padding: 'var(--space-md)', display: 'grid', gap: 'var(--space-sm)' }}>
          {notifications.map((notification) => (
            <NotificationRow
              key={notification.notificationId}
              notification={notification}
              pending={pendingKey === notification.notificationId}
              responded={
                notification.type === 'race_invite' && respondedInvites.has(notification.payload.inviteId)
              }
              onMarkRead={() => void markRead(notification)}
              onRespond={(inviteId, action) => void respondInvite(inviteId, action)}
            />
          ))}
        </GlassPanel>
      ) : null}
    </main>
  );
}

/**
 * Tek bildirim satırı. `NotificationView` AYRIKLAŞTIRILMIŞ (discriminated)
 * bir birliktir: `notification.type` kontrolünden sonra `payload` tip
 * güvenli biçimde daralır (bkz. `NotificationPayloadByType` doc yorumu).
 *
 * **TÜR BAŞINA METİN BURADA KURULUR, SUNUCUDA DEĞİL** — bilinçli: sunucu
 * yapısal `payload` gönderir, cümle kurmak sunumdur. Bir tür için sunucuya
 * Türkçe cümle yazdırmak, aynı cümleyi WebSocket yayınına ve HTTP yanıtına
 * ayrı ayrı gömmek olurdu.
 */
function NotificationRow({
  notification,
  pending,
  responded,
  onMarkRead,
  onRespond,
}: {
  notification: NotificationView;
  pending: boolean;
  /** BU OTURUMDA yanıtlandı mı — sunucudan gelmez, bkz. `respondedInvites`. */
  responded: boolean;
  onMarkRead: () => void;
  onRespond: (inviteId: string, action: 'accept' | 'decline') => void;
}): React.ReactElement {
  const unread = notification.readAt === null;
  const { title, detail, href } = describe(notification);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        paddingBottom: 'var(--space-sm)',
        borderBottom: '1px solid var(--color-border)',
        ...(unread ? { borderLeft: '2px solid var(--color-accent-gold)', paddingLeft: 'var(--space-sm)' } : {}),
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: unread ? 700 : 600 }}>
          {title}
          {unread ? <span style={{ color: 'var(--color-accent-gold)', fontSize: '12px' }}> · yeni</span> : null}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          {detail}
          {href ? (
            <>
              {' · '}
              <Link href={href} style={{ color: 'var(--color-accent-focus)' }}>
                {hrefLabel(notification)}
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexShrink: 0 }}>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          {formatRelativeDate(notification.createdAt)}
        </span>
        {/* Ayrım DOĞRUDAN `notification.type` üzerinden yapılır: `canRespond`
            gibi bir takma ad üzerinden daraltma, TypeScript'in ayrık birlik
            (discriminated union) çıkarımına güvenmek olurdu; doğrudan
            kontrol her sürümde kesin çalışır ve `payload`ı daraltır. */}
        {notification.type === 'race_invite' && !responded ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => onRespond(notification.payload.inviteId, 'accept')}
              style={primaryButtonStyle()}
            >
              Kabul Et
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onRespond(notification.payload.inviteId, 'decline')}
              style={secondaryButtonStyle()}
            >
              Reddet
            </button>
          </>
        ) : unread ? (
          <button type="button" disabled={pending} onClick={onMarkRead} style={secondaryButtonStyle()}>
            Okundu
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Tür başına başlık/ayrıntı/link. Sekiz türün TAMAMI ele alınır —
 * `NOTIFICATION_TYPES` sabitine yeni bir tür eklenirse `switch` TÜM
 * durumları kapsamadığı için `tsc` HATA VERİR (bu, sessizce "boş satır"
 * gösteren bir eksikliği derleme zamanına taşır).
 */
function describe(notification: NotificationView): { title: string; detail: string; href: string | null } {
  // ⚠️ `const { payload } = notification;` YAZILMAZ. Ayrık birlikte
  // (discriminated union) daraltma `notification` ÜZERİNDE yapılır; payload
  // switch'ten ÖNCE ayrı bir değişkene çıkarılırsa TypeScript bağlantıyı
  // kaybeder ve `payload` SEKİZ şeklin BİRLEŞİMİ olarak kalır — `case
  // 'race_invite'` içinde bile `payload.inviteId` hata verir (yaşandı,
  // 28.09.2026: `tsc -p apps/web` 17 hata). Erişim her durumun İÇİNDE,
  // doğrudan `notification.payload` üzerinden yapılır.
  switch (notification.type) {
    case 'friend_request':
      return {
        title: `${notification.payload.displayName} sana arkadaşlık isteği gönderdi`,
        detail: 'İsteği yanıtlamak için arkadaşlar ekranına git.',
        href: '/friends',
      };
    case 'friend_accepted':
      return {
        title: `${notification.payload.displayName} arkadaşlık isteğini kabul etti`,
        detail: 'Artık yazışabilir ve hediye gönderebilirsin.',
        href: '/friends',
      };
    case 'race_invite':
      return {
        title: `${notification.payload.inviterDisplayName} seni bir yarışa davet etti`,
        detail: `${notification.payload.raceName} — kabul etmek yarışa katılmak değildir; katılımı yarış ekranından tamamlarsın.`,
        href: '/races',
      };
    case 'gift_received':
      return {
        title: `${notification.payload.displayName} sana hediye gönderdi`,
        detail: `${CURRENCY_LABELS[notification.payload.currency]} ${formatCurrency(
          notification.payload.currency,
          notification.payload.amount,
        )}`,
        href: '/friends',
      };
    case 'message_received':
      return {
        title: `${notification.payload.displayName} sana mesaj gönderdi`,
        detail: notification.payload.preview,
        href: '/friends',
      };
    case 'race_starting':
      return {
        title: `${notification.payload.raceName} birazdan başlıyor`,
        detail: 'Yarış ekranından katılabilirsin.',
        href: '/races',
      };
    case 'race_finished':
      return {
        title: `${notification.payload.raceName} tamamlandı`,
        detail: `${notification.payload.finishPosition}. sırada bitirdin.`,
        href: '/replays',
      };
    case 'prize_won':
      return {
        title: `${notification.payload.raceName} — ödül kazandın`,
        detail: `Kazanılan ödül: ${formatCurrency('money', notification.payload.amount)}`,
        href: '/replays',
      };
    // 02.10.2026 — müzayede. Yön metne değil türe bağlı; tutar hep pozitif.
    case 'auction_outbid':
      return {
        title: `${notification.payload.horseName} müzayedesinde teklifin geçildi`,
        detail: `${formatCurrency('money', notification.payload.amount)} hesabına iade edildi. Yeniden teklif için en az ${formatCurrency('money', notification.payload.minimumNextBid)}.`,
        href: '/market',
      };
    case 'auction_won':
      return {
        title: `${notification.payload.horseName} müzayedesini kazandın`,
        detail: `${formatCurrency('money', notification.payload.amount)} karşılığında at ahırında.`,
        href: '/stable',
      };
    case 'auction_sold':
      return {
        title: `${notification.payload.horseName} müzayedede satıldı`,
        detail: `${formatCurrency('money', notification.payload.amount)} hesabına geçti.`,
        href: '/wallet',
      };
    case 'auction_unsold':
      return {
        title: `${notification.payload.horseName} müzayedesi satışsız bitti`,
        detail: 'At sende kaldı; yeniden satışa çıkarabilirsin.',
        href: '/market',
      };
    case 'auction_refunded':
      return {
        title: `${notification.payload.horseName} satışı gerçekleşemedi`,
        detail: `Teklifin (${formatCurrency('money', notification.payload.amount)}) hesabına iade edildi.`,
        href: '/wallet',
      };
  }
}

/** Link etiketi — `describe` ile AYNI `switch` yerine tür bazlı tek satırlık eşleme. */
function hrefLabel(notification: NotificationView): string {
  switch (notification.type) {
    case 'friend_request':
    case 'friend_accepted':
    case 'gift_received':
    case 'message_received':
      return 'arkadaşlar ekranı →';
    case 'race_invite':
    case 'race_starting':
      return 'yarışlar ekranı →';
    case 'race_finished':
    case 'prize_won':
      return 'yarış geçmişi →';
    case 'auction_outbid':
    case 'auction_unsold':
      return 'pazar →';
    case 'auction_won':
      return 'ahır →';
    case 'auction_sold':
    case 'auction_refunded':
      return 'cüzdan →';
  }
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** `friends/page.tsx` ile AYNI yardımcı — ortak bir modüle taşınmadı (iki kullanım). */
function formatRelativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < MS_PER_MINUTE) return 'az önce';
  if (diffMs < MS_PER_HOUR) return `${Math.floor(diffMs / MS_PER_MINUTE)} dk önce`;
  if (diffMs < MS_PER_DAY) return `${Math.floor(diffMs / MS_PER_HOUR)} sa önce`;
  return `${Math.floor(diffMs / MS_PER_DAY)} gün önce`;
}

function primaryButtonStyle(): React.CSSProperties {
  return {
    minHeight: '36px',
    padding: '8px 16px',
    background: 'var(--color-accent-gold)',
    color: '#1a1405',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    minHeight: '36px',
    padding: '8px 16px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
