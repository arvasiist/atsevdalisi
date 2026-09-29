'use client';

/**
 * `/friends` — ARKADAŞLIK + MESAJLAŞMA + HEDİYE (proje sahibinin açık talebi,
 * 27.09.2026: "arkadaşlık + mesajlaşma, hediye gönderimi").
 *
 * **Hediye AYRI BİR SAYFA DEĞİLDİR.** Hediyenin ön koşulu kabul edilmiş
 * arkadaşlıktır (sunucu: `GIFT_REQUIRES_FRIENDSHIP`), yani hediye
 * gönderilebilecek oyuncu kümesi bu sayfadaki arkadaş listesinin TA
 * KENDİSİDİR. Ayrı bir `/gifts` sayfası, aynı listeyi ikinci kez çizmek ve
 * "burada görebildiğim ama orada göremediğim" bir tutarsızlık riski
 * demekti. Geçmiş listesi de aynı çağrıda (`GET /players/:id/gifts`)
 * gelir.
 *
 * **Hediye bir PARA YOLUDUR** (`buyRaceTicket` ile aynı sınıf): istek
 * `Idempotency-Key` taşır ve tutar sunucuda `SELECT ... FOR UPDATE` ile
 * kilitlenip aynı transaction'da hem düşülür hem alıcıya eklenir — burada
 * hesaplanan hiçbir şey otorite DEĞİLDİR.
 *
 * **TEK "özet" İSTEĞİ:** ekran açıldığında `GET /players/:id/social`
 * çağrılır ve arkadaşlar + gelen/giden istekler + okunmamış sayısı AYNI
 * yanıtta gelir (bkz. `SocialOverviewView` doc yorumu). Üç ayrı uç nokta
 * üç ayrı yükleme durumu ve kısmi hata üretirdi.
 *
 * **Yazışma TEMBEL yüklenir:** bir arkadaşa tıklanana kadar
 * `GET /players/:id/messages/:otherPlayerId` ÇAĞRILMAZ. Bu, yalnızca
 * gereksiz isteği önlemek için değil — o uç noktanın **yan etkisi**
 * olduğu içindir: sunucu, gelen okunmamış mesajları OKUNDU işaretler
 * (bkz. `GetConversationUseCase`). Sayfa açılışında tüm arkadaşlar için
 * çağırmak, hiç bakılmayan yazışmaları "okunmuş" yapardı.
 *
 * **Yeni arkadaş nasıl eklenir:** bu sayfada "oyuncu ara" kutusu YOKTUR.
 * Keşif yolu `/leaderboard`'dur — sıralama tablosu başka oyuncuların
 * kimliğini gösteren TEK mevcut yüzeydir ve oradaki "Arkadaş Ekle"
 * düğmesi bu sayfaya istek düşürür. Ayrı bir arama uç noktası bilinçli
 * olarak İCAT EDİLMEDİ (görünen ad numaralandırmasına açık yeni bir yüzey
 * olurdu).
 *
 * Bu bileşen HİÇBİR iş kuralı UYGULAMAZ: "arkadaş mıyız", "kaç istek
 * bekliyor", "mesaj çok uzun mu" — hepsi sunucuda (CLAUDE.md "SUNUCU
 * OTORİTESİ"). İstemci yalnızca düğmeleri sunucunun döndürdüğü duruma
 * göre gösterir/gizler.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  BlockedPlayerView,
  Currency,
  DirectMessageView,
  FriendRequestView,
  FriendView,
  GiftView,
  SocialOverviewView,
} from '@at-sevdalisi/shared-types';
import { CURRENCIES } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { CURRENCY_LABELS, formatCurrency, hasEnoughFunds } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

/** Gelen kutusunda gösterilecek en fazla satır — sunucu zaten `inboxLimit` uygular. */
const INBOX_PREVIEW_LIMIT = 5;

/** Hediye geçmişinde gösterilecek en fazla satır — sunucu zaten `historyLimit` uygular. */
const GIFT_HISTORY_LIMIT = 10;

export default function FriendsPage(): React.ReactElement {
  const {
    player,
    isLoading: isPlayerLoading,
    error: playerError,
    createPlayer,
    // Hediye sonrası üst bardaki Çip/Elmas göstergesi tazelensin diye
    // YENİDEN ADLANDIRILDI: bu dosyanın kendi `refresh`'i (özet + yazışma)
    // ile çakışırdı.
    refresh: refreshPlayerBalance,
  } = usePlayer();
  const [overview, setOverview] = useState<SocialOverviewView | null>(null);
  const [inbox, setInbox] = useState<DirectMessageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Seçili arkadaş — yazışma panelini açar (bkz. dosya başı "tembel yükleme" notu). */
  const [activeFriend, setActiveFriend] = useState<FriendView | null>(null);
  const [messages, setMessages] = useState<DirectMessageView[] | null>(null);
  const [draft, setDraft] = useState('');
  /** Satır bazlı "işleniyor" durumu — bir isteği yanıtlarken TÜM liste kilitlenmez. */
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  /**
   * HEDİYE (proje sahibinin açık talebi, 27.09.2026 — üç parçanın ÜÇÜNCÜSÜ).
   * Hedef arkadaş, tutar ve birim; hepsi tek bir panelde toplanır. Panel
   * açıkken `activeFriend` (yazışma) KAPATILIR — ikisi aynı anda açık
   * olsaydı hangi arkadaşa ne gönderildiği karışırdı.
   */
  const [activeGiftFriend, setActiveGiftFriend] = useState<FriendView | null>(null);
  /** Ham metin: `input type="number"` bile boş bırakılabilir; ayrıştırma sunucudadır. */
  const [giftAmount, setGiftAmount] = useState('');
  const [giftCurrency, setGiftCurrency] = useState<Currency>('money');
  const [gifts, setGifts] = useState<GiftView[] | null>(null);
  const [isSendingGift, setIsSendingGift] = useState(false);

  /**
   * KENDİ engel listem (29.09.2026, brief §33). Sunucu YALNIZCA tek yön
   * döner — "beni engelleyenler" diye bir liste yoktur ve istenemez.
   */
  const [blocked, setBlocked] = useState<BlockedPlayerView[] | null>(null);

  const loadOverview = useCallback(async (playerId: string) => {
    const [social, myInbox, myGifts, myBlocked] = await Promise.all([
      apiClient.getSocialOverview(playerId),
      apiClient.getInbox(playerId),
      apiClient.getMyGifts(playerId),
      // BLOK / ŞİKÂYET (29.09.2026) — engel listesi BU ekranın bir
      // bölümüdür, ayrı bir sayfa DEĞİL: engellemenin tek anlamı sosyal
      // yüzeyleri kapatmaktır, yani listesi de o yüzeylerin yanında durur.
      // Ayrı bir `/settings/blocks` rotası, aynı veriyi ikinci bir yerde
      // göstermek ve gezinti şeridine yeni bir bağlantı eklemek olurdu.
      apiClient.listBlockedPlayers(playerId),
    ]);
    return { social, myInbox, myGifts, myBlocked };
  }, []);

  useEffect(() => {
    if (!player) {
      return;
    }
    let cancelled = false;
    setOverview(null);
    setInbox(null);
    setGifts(null);
    setBlocked(null);
    setError(null);
    void loadOverview(player.id)
      .then(({ social, myInbox, myGifts, myBlocked }) => {
        if (cancelled) return;
        setOverview(social);
        setInbox(myInbox);
        setGifts(myGifts);
        setBlocked(myBlocked);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Sosyal ekran yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [player, loadOverview]);

  /**
   * Özeti tazeler ve AÇIK yazışmayı da yeniler. Yazışma yenilenirken
   * okunmamış sayısının düşmesi beklenen davranıştır (sunucu okundu
   * işaretler — bkz. dosya başı notu).
   */
  const refresh = useCallback(
    async (options: { keepConversation?: boolean } = {}): Promise<void> => {
      if (!player) return;
      const { social, myInbox, myGifts, myBlocked } = await loadOverview(player.id);
      setOverview(social);
      setInbox(myInbox);
      setGifts(myGifts);
      setBlocked(myBlocked);
      if (options.keepConversation && activeFriend) {
        setMessages(await apiClient.getConversation(player.id, activeFriend.playerId));
      }
    },
    [player, loadOverview, activeFriend],
  );

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

  const respond = (request: FriendRequestView, action: 'accept' | 'reject'): Promise<void> =>
    runAction(
      request.requestId,
      async () => {
        await apiClient.respondFriendRequest(player?.id ?? '', request.requestId, action);
        await refresh();
      },
      'İstek yanıtlanamadı',
    );

  /**
   * Tek `removeFriend` çağrısı İKİ işi yapar (sunucudaki
   * `RemoveFriendUseCase` ile AYNI): kabul edilmiş arkadaşlığı siler VEYA
   * bekleyen isteği geri çeker. Bu yüzden hem "Çıkar" hem "İptal Et"
   * düğmesi buraya bağlanır.
   */
  const remove = (targetId: string, key: string, fallbackMessage: string): Promise<void> =>
    runAction(
      key,
      async () => {
        await apiClient.removeFriend(player?.id ?? '', targetId);
        if (activeFriend?.playerId === targetId) {
          setActiveFriend(null);
          setMessages(null);
        }
        // Hediye paneli de kapanır: arkadaşlık bittiği an sunucu
        // `GIFT_REQUIRES_FRIENDSHIP` döndürür, panel açık kalırsa kullanıcı
        // anlamsız bir form görürdü.
        if (activeGiftFriend?.playerId === targetId) {
          setActiveGiftFriend(null);
          setGiftAmount('');
        }
        await refresh();
      },
      fallbackMessage,
    );

  /**
   * Engeli kaldırır (29.09.2026). `remove` ile AYNI `runAction` deseni:
   * satır bazlı "işleniyor" durumu ve ortak hata satırı. Engel YOKSA
   * sunucu 404 döner ve mesajı görünür — sessiz başarı SAYILMAZ.
   */
  const unblock = (blockedId: string): Promise<void> =>
    runAction(
      `unblock-${blockedId}`,
      async () => {
        await apiClient.unblockPlayer(player?.id ?? '', blockedId);
        await refresh();
      },
      'Engel kaldırılamadı',
    );

  const openConversation = (friend: FriendView): Promise<void> =>
    runAction(
      `open-${friend.playerId}`,
      async () => {
        if (!player) return;
        setActiveFriend(friend);
        setActiveGiftFriend(null);
        setMessages(await apiClient.getConversation(player.id, friend.playerId));
        // Okundu işaretlemesi sunucuda oldu; özet tazelenir ki rozet düşsün.
        const social = await apiClient.getSocialOverview(player.id);
        setOverview(social);
      },
      'Yazışma açılamadı',
    );

  /**
   * Hediye panelini açar. Gerekli tek "iş kuralı" burada YOKTUR — tutar
   * sınırı, birim izni, arkadaşlık ve günlük tavan sunucudadır.
   */
  const openGiftPanel = (friend: FriendView): void => {
    setActiveGiftFriend(friend);
    setActiveFriend(null);
    setMessages(null);
    setGiftAmount('');
    setError(null);
  };

  /**
   * HEDİYE GÖNDERİMİ — PARA YOLU.
   *
   * `Idempotency-Key` İSTEK BAŞINA bir kez üretilir ve çağrı tamamlanana
   * kadar DEĞİŞMEZ: ağ hatası sonrası kullanıcı düğmeye tekrar basarsa yeni
   * bir anahtar üretilir, ama sunucu zaten yazdıysa ikinci istek AYNI
   * anahtarla değil — bu yüzden burada anahtar `runAction`'ın DIŞINDA,
   * eylemin başında üretilir ve yalnızca bu tek deneme için geçerlidir
   * (kullanıcı gerçekten yeni bir hediye göndermek istiyor olabilir).
   *
   * Gönderim sonrası bakiye `refresh()` ile tazelenir — üst bardaki Çip
   * göstergesi aksi halde eski değeri gösterirdi.
   */
  const sendGift = (): Promise<void> =>
    runAction(
      'gift-send',
      async () => {
        if (!player || !activeGiftFriend) return;
        const parsed = Number(giftAmount);
        if (giftAmount.trim().length === 0 || !Number.isFinite(parsed)) return;
        setIsSendingGift(true);
        try {
          await apiClient.sendGift(
            player.id,
            activeGiftFriend.playerId,
            parsed,
            giftCurrency,
            crypto.randomUUID(),
          );
          setGiftAmount('');
          await refresh();
          refreshPlayerBalance();
        } finally {
          setIsSendingGift(false);
        }
      },
      'Hediye gönderilemedi',
    );

  const send = (): Promise<void> =>
    runAction(
      'send',
      async () => {
        if (!player || !activeFriend) return;
        const body = draft.trim();
        if (body.length === 0) return;
        setIsSending(true);
        try {
          await apiClient.sendMessage(player.id, activeFriend.playerId, body);
          setDraft('');
          setMessages(await apiClient.getConversation(player.id, activeFriend.playerId));
        } finally {
          setIsSending(false);
        }
      },
      'Mesaj gönderilemedi',
    );

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Arkadaşlar</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Arkadaş ekle, istekleri yanıtla, arkadaşlarınla yazış ve Çip/Elmas hediye gönder. Yeni arkadaş bulmak için{' '}
        <a href="/leaderboard" style={{ color: 'var(--color-accent-gold)' }}>
          sıralama tablosuna
        </a>{' '}
        göz at.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Arkadaş ekleyebilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} style={primaryButtonStyle()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {error ? <p style={{ color: 'var(--color-status-critical)' }}>{error}</p> : null}

      {player && overview === null && !error ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Yükleniyor…</p>
      ) : null}

      {overview ? (
        <>
          {overview.incomingRequests.length > 0 ? (
            <Section title={`Gelen İstekler (${overview.incomingRequests.length})`}>
              {overview.incomingRequests.map((request) => (
                <Row key={request.requestId}>
                  <RowLabel
                    primary={request.displayName}
                    secondary={`Seviye ${request.level} · ${formatRelativeDate(request.createdAt)}`}
                    profileUsername={request.username}
                  />
                  <RowActions>
                    <button
                      type="button"
                      disabled={pendingKey === request.requestId}
                      onClick={() => void respond(request, 'accept')}
                      style={primaryButtonStyle()}
                    >
                      Kabul Et
                    </button>
                    <button
                      type="button"
                      disabled={pendingKey === request.requestId}
                      onClick={() => void respond(request, 'reject')}
                      style={secondaryButtonStyle()}
                    >
                      Reddet
                    </button>
                  </RowActions>
                </Row>
              ))}
            </Section>
          ) : null}

          {overview.outgoingRequests.length > 0 ? (
            <Section title={`Gönderdiğim İstekler (${overview.outgoingRequests.length})`}>
              {overview.outgoingRequests.map((request) => (
                <Row key={request.requestId}>
                  <RowLabel
                    primary={request.displayName}
                    secondary={`Yanıt bekleniyor · ${formatRelativeDate(request.createdAt)}`}
                    profileUsername={request.username}
                  />
                  <RowActions>
                    <button
                      type="button"
                      disabled={pendingKey === request.requestId}
                      onClick={() => void remove(request.playerId, request.requestId, 'İstek geri çekilemedi')}
                      style={secondaryButtonStyle()}
                    >
                      İptal Et
                    </button>
                  </RowActions>
                </Row>
              ))}
            </Section>
          ) : null}

          <Section title={`Arkadaşlar (${overview.friends.length})`}>
            {overview.friends.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '13px' }}>
                Henüz arkadaşın yok. Sıralama tablosundan bir sporcuya istek gönderebilirsin.
              </p>
            ) : (
              overview.friends.map((friend) => (
                <Row
                  key={friend.friendshipId}
                  highlight={
                    activeFriend?.playerId === friend.playerId || activeGiftFriend?.playerId === friend.playerId
                  }
                >
                  <RowLabel
                    primary={friend.displayName}
                    secondary={`Seviye ${friend.level} · ${formatRelativeDate(friend.friendsSince)} arkadaş`}
                    profileUsername={friend.username}
                  />
                  <RowActions>
                    <button
                      type="button"
                      disabled={pendingKey === `open-${friend.playerId}`}
                      onClick={() => void openConversation(friend)}
                      style={primaryButtonStyle()}
                    >
                      Yazış
                    </button>
                    <button
                      type="button"
                      onClick={() => openGiftPanel(friend)}
                      style={secondaryButtonStyle()}
                    >
                      Hediye
                    </button>
                    <button
                      type="button"
                      disabled={pendingKey === friend.friendshipId}
                      onClick={() => void remove(friend.playerId, friend.friendshipId, 'Arkadaşlıktan çıkarılamadı')}
                      style={secondaryButtonStyle()}
                    >
                      Çıkar
                    </button>
                  </RowActions>
                </Row>
              ))
            )}
          </Section>

          {/* Engellenenler — YALNIZCA liste boş DEĞİLSE çizilir. Boş bir
              "Engellenenler (0)" bölümü herkese görünen bir gürültüdür ve
              kullanıcıya "burada bir şey olmalı" hissi verir; oysa
              engellemek istisnai bir eylemdir. Liste alınamazsa
              (`blocked === null`) da çizilmez — hata zaten yukarıdaki
              `error` satırında görünür. */}
          {blocked !== null && blocked.length > 0 ? (
            <Section title={`Engellenenler (${blocked.length})`}>
              {blocked.map((entry) => (
                <Row key={entry.playerId}>
                  <RowLabel
                    primary={entry.displayName}
                    secondary={`Seviye ${entry.level} · ${formatRelativeDate(entry.blockedAt)} engellendi`}
                    profileUsername={entry.username}
                  />
                  <RowActions>
                    <button
                      type="button"
                      disabled={pendingKey === `unblock-${entry.playerId}`}
                      onClick={() => void unblock(entry.playerId)}
                      style={secondaryButtonStyle()}
                    >
                      Engeli Kaldır
                    </button>
                  </RowActions>
                </Row>
              ))}
              {/* Yön AÇIKÇA söylenir: bu liste "beni engelleyenler" DEĞİL.
                  Sunucu o listeyi hiç üretmez (brief §33 — engelleme sessiz
                  bir mesafedir), ama kullanıcının bunu ekrandan anlaması
                  gerekir; yoksa "burada görünmüyorsa beni engellememiş"
                  gibi yanlış bir çıkarım yapardı. */}
              <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '12px' }}>
                Bu liste yalnızca SENİN koyduğun engelleri gösterir. Seni engelleyenler burada görünmez ve
                görünmemesi bilinçlidir.
              </p>
            </Section>
          ) : null}

          {activeFriend ? (
            <Section title={`${activeFriend.displayName} ile yazışma`}>
              {messages === null ? (
                <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '13px' }}>Yazışma yükleniyor…</p>
              ) : messages.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '13px' }}>
                  Henüz mesaj yok. İlk mesajı sen yaz.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                  {/* Sunucu en yeniden eskiye döner; sohbet için ters çevrilir. */}
                  {[...messages].reverse().map((message) => (
                    <div
                      key={message.messageId}
                      style={{
                        alignSelf: message.senderId === player?.id ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        padding: 'var(--space-sm) var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        background:
                          message.senderId === player?.id ? 'var(--color-accent-gold)' : 'var(--color-bg-surface-elevated)',
                        color: message.senderId === player?.id ? '#1a1405' : 'var(--color-text-primary)',
                        fontSize: '14px',
                        wordBreak: 'break-word',
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
                      <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>
                        {formatRelativeDate(message.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !isSending) void send();
                  }}
                  placeholder="Mesaj yaz…"
                  maxLength={500}
                  style={inputStyle()}
                />
                <button
                  type="button"
                  disabled={isSending || draft.trim().length === 0}
                  onClick={() => void send()}
                  style={{ ...primaryButtonStyle(), opacity: isSending || draft.trim().length === 0 ? 0.55 : 1 }}
                >
                  {isSending ? 'Gönderiliyor…' : 'Gönder'}
                </button>
              </div>
            </Section>
          ) : null}

          {activeGiftFriend ? (
            <Section title={`${activeGiftFriend.displayName} kişisine hediye gönder`}>
              <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '13px' }}>
                Hediye bir <strong>transferdir</strong>: düşülen tutar arkadaşının bakiyesine eklenir. Tutar sınırları
                ve günlük gönderim tavanı sunucuda uygulanır.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                <select
                  value={giftCurrency}
                  onChange={(event) => setGiftCurrency(event.target.value as Currency)}
                  style={{ ...inputStyle(), flex: '0 0 140px' }}
                >
                  {/* Liste `CURRENCIES`'ten gelir — hediye BAŞINA izinli
                      birimler (`config/gift.config.json → allowedCurrencies`)
                      sunucudadır ve istemcide TAKLİT EDİLMEZ; izinli
                      olmayan bir birim seçilirse sunucu 400 döner. */}
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {CURRENCY_LABELS[currency]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={giftAmount}
                  onChange={(event) => setGiftAmount(event.target.value)}
                  placeholder="Tutar"
                  style={inputStyle()}
                />
                <button
                  type="button"
                  disabled={isSendingGift || giftAmount.trim().length === 0}
                  onClick={() => void sendGift()}
                  style={{
                    ...primaryButtonStyle(),
                    opacity: isSendingGift || giftAmount.trim().length === 0 ? 0.55 : 1,
                  }}
                >
                  {isSendingGift ? 'Gönderiliyor…' : 'Hediye Gönder'}
                </button>
              </div>
              {player && !canAffordGift(player, giftCurrency, giftAmount) ? (
                <p style={{ color: 'var(--color-status-critical)', margin: 0, fontSize: '13px' }}>
                  Bakiyen bu hediyeyi karşılamıyor. (Ön kontrol — asıl kontrol sunucudadır.)
                </p>
              ) : null}
            </Section>
          ) : null}

          <Section title={`Hediye Geçmişi${gifts && gifts.length > 0 ? ` (${gifts.length})` : ''}`}>
            {gifts === null || gifts.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '13px' }}>
                Henüz hediye gönderilmemiş veya alınmamış.
              </p>
            ) : (
              gifts.slice(0, GIFT_HISTORY_LIMIT).map((gift) => (
                <Row key={gift.giftId}>
                  <RowLabel
                    primary={`${gift.direction === 'outgoing' ? '→ ' : '← '}${gift.counterparty.displayName}`}
                    secondary={`${gift.direction === 'outgoing' ? 'Gönderildi' : 'Alındı'} · ${formatRelativeDate(
                      gift.createdAt,
                    )}`}
                  />
                  <RowActions>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: gift.direction === 'outgoing' ? 'var(--color-status-critical)' : 'var(--color-accent-gold)',
                      }}
                    >
                      {gift.direction === 'outgoing' ? '−' : '+'}
                      {formatCurrency(gift.currency, gift.amount)}
                    </span>
                  </RowActions>
                </Row>
              ))
            )}
          </Section>

          <Section title={`Gelen Kutusu${overview.unreadMessageCount > 0 ? ` (${overview.unreadMessageCount} okunmamış)` : ''}`}>
            {inbox === null || inbox.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '13px' }}>Gelen kutun boş.</p>
            ) : (
              inbox.slice(0, INBOX_PREVIEW_LIMIT).map((message) => (
                <Row key={message.messageId}>
                  <RowLabel
                    primary={message.senderDisplayName}
                    secondary={message.body}
                    unread={message.readAt === null}
                  />
                  <RowActions>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {formatRelativeDate(message.createdAt)}
                    </span>
                  </RowActions>
                </Row>
              ))
            )}
          </Section>
        </>
      ) : null}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section style={{ marginBottom: 'var(--space-xl)' }}>
      <h2
        style={{
          fontSize: '18px',
          color: 'var(--color-text-primary)',
          marginTop: 0,
          marginBottom: 'var(--space-sm)',
        }}
      >
        {title}
      </h2>
      <GlassPanel style={{ padding: 'var(--space-md)', display: 'grid', gap: 'var(--space-sm)' }}>{children}</GlassPanel>
    </section>
  );
}

function Row({ children, highlight }: { children: React.ReactNode; highlight?: boolean }): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        paddingBottom: 'var(--space-sm)',
        borderBottom: '1px solid var(--color-border)',
        ...(highlight ? { borderLeft: '2px solid var(--color-accent-gold)', paddingLeft: 'var(--space-sm)' } : {}),
      }}
    >
      {children}
    </div>
  );
}

/** Profil bağlantısının stili — alt çizgi YOK (satır listesi okunaklı kalsın). */
const rowLabelLinkStyle: React.CSSProperties = {
  color: 'inherit',
  textDecoration: 'none',
};

/**
 * Satır etiketi. `profileUsername` VERİLİRSE `primary` bir profil
 * bağlantısına dönüşür (29.09.2026).
 *
 * **NEDEN `href` DEĞİL `username`:** rota `/profile/:username`dir ve
 * çağıranın yolu elle kurması (`/profile/${x}`) dört ayrı yerde
 * tekrarlanan bir dize şablonu demekti — biri yanlış yazılırsa o satır
 * sessizce 404'e giderdi. Adresin TEK kurucusu buradadır.
 *
 * **NEDEN ZORUNLU DEĞİL:** iki meşru sebep var. (1) Hediye geçmişi
 * satırının `primary`si bir AD değil YÖNLÜ bir metindir (`→ Ayşe`) ve o
 * satırın karşı tarafı zaten bir ARKADAŞTIR (hediye arkadaşlık şartına
 * bağlıdır) — yani aynı ekranda yukarıdaki arkadaş satırında zaten bir
 * profil bağlantısı vardır; ikincisi aynı yere giden bir kopya olurdu.
 * (2) `username` sunucudan gelmediği sürece bağlantı ÜRETİLMEZ —
 * uydurulmuş bir slug, profil ucunda 404 olurdu.
 */
function RowLabel({
  primary,
  secondary,
  unread,
  profileUsername,
}: {
  primary: string;
  secondary: string;
  unread?: boolean;
  profileUsername?: string;
}): React.ReactElement {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: unread ? 700 : 600 }}>
        {profileUsername === undefined ? (
          primary
        ) : (
          <Link href={`/profile/${profileUsername}`} style={rowLabelLinkStyle}>
            {primary}
          </Link>
        )}
        {unread ? <span style={{ color: 'var(--color-accent-gold)', fontSize: '12px' }}> · yeni</span> : null}
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--color-text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '46ch',
        }}
      >
        {secondary}
      </div>
    </div>
  );
}

function RowActions({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexShrink: 0 }}>{children}</div>;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** `grandstand/page.tsx` ile AYNI yardımcı — ortak bir modüle taşınmadı (iki kullanım). */
function formatRelativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < MS_PER_MINUTE) return 'az önce';
  if (diffMs < MS_PER_HOUR) return `${Math.floor(diffMs / MS_PER_MINUTE)} dk önce`;
  if (diffMs < MS_PER_DAY) return `${Math.floor(diffMs / MS_PER_HOUR)} sa önce`;
  return `${Math.floor(diffMs / MS_PER_DAY)} gün önce`;
}

/**
 * Hediye formundaki "bakiye yetmiyor" uyarısı — YALNIZCA bir kullanılabilirlik
 * ön kontrolüdür (`hasEnoughFunds`'un kendi doc yorumu). Tutar henüz geçerli
 * bir sayı değilse (boş/yarım yazılmış) UYARI GÖSTERİLMEZ: kullanıcı daha
 * yazarken kırmızı bir satır görmek, hatayı değil gürültüyü büyütürdü.
 */
function canAffordGift(player: { money: number; gems: number }, currency: Currency, rawAmount: string): boolean {
  if (rawAmount.trim().length === 0) return true;
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) return true;
  return hasEnoughFunds(player, { currency, amount });
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

function inputStyle(): React.CSSProperties {
  return {
    flex: 1,
    minHeight: '40px',
    padding: '8px 12px',
    background: 'var(--color-bg-surface-elevated)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
  };
}
