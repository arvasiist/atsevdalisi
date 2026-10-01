'use client';

/**
 * ÜST BAR + GEZİNTİ (01.10.2026 tasarım yenilemesi).
 *
 * Önceki sürüm 11 bağlantıyı ikinci bir satırda hap düğmeler olarak
 * diziyordu; telefonda bu şerit 3 satır tutuyor ve içerik ekranın ortasından
 * başlıyordu. Şimdi:
 *  - **Masaüstü (≥1280px):** tek satır — logo · simgeli ana bağlantılar ·
 *    "Daha fazla" · bildirim zili · bakiye · profil.
 *  - **Telefon/tablet:** üstte ince şerit (logo · bakiye · profil), altta
 *    sabit sekme çubuğu (4 sekme + "Menü"; menü HER bağlantıyı açar).
 *
 * Kurallar (değişmedi):
 *  - Yalnızca gerçek veri gösterilir (oyuncu adı/seviyesi/bakiyesi —
 *    `PlayerContext`). Sahte hava durumu/saat EKLENMEZ.
 *  - Bağlantı listesi `nav-links.ts`'tedir; kırık bağlantı kilidi
 *    `test/components/top-bar-nav.spec.ts`.
 *  - Avatar + ad oyuncunun KENDİ profiline gider (`/profile/:username`
 *    dinamik rotadır, statik listeye giremez — tek keşif yolu budur).
 *  - Yönetim bağlantısı `player.isAdmin` ile KOŞULLUDUR ve `NAV_LINKS`te
 *    DEĞİLDİR. Bu bir yetki kontrolü DEĞİLDİR: karar sunucuda, her istekte
 *    verilir (§13.17).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Coins, Gem, Menu, ShieldCheck, X } from 'lucide-react';
import { CURRENCY_LABELS } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';
import { HorseAvatar } from '../ui/HorseAvatar';
import { HorseHeadIcon } from '../ui/HorseHeadIcon';
import { NavIcon } from './nav-icons';
import { MAX_MOBILE_TABS, NAV_LINKS, type NavLink } from './nav-links';

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function TopBar(): React.ReactElement {
  const { player } = usePlayer();
  const pathname = usePathname() ?? '/';
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // Sayfa değişince açık menüler kapanır.
  useEffect(() => {
    setIsMoreOpen(false);
    setIsSheetOpen(false);
  }, [pathname]);

  // "Daha fazla" dışına tıklayınca kapanır.
  useEffect(() => {
    if (!isMoreOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isMoreOpen]);

  const primary = NAV_LINKS.filter((link) => link.placement === 'primary');
  const more = NAV_LINKS.filter((link) => link.placement === 'more');
  const notifications = NAV_LINKS.find((link) => link.placement === 'utility');
  const mobileTabs = NAV_LINKS.filter((link) => link.mobileTab === true).slice(0, MAX_MOBILE_TABS);
  const isMoreActive = more.some((link) => isActive(pathname, link.href));

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="At Sevdalısı ana sayfa">
            <HorseHeadIcon size={34} gradient withMane />
            <span className="brand-text">
              <span className="brand-title">AT SEVDALISI</span>
              <span className="brand-tagline hide-below-wide">Sadece bir oyun değil, bir tutku</span>
            </span>
          </Link>

          <nav aria-label="Ana gezinti" className="nav-desktop">
            {primary.map((link) => (
              <NavItem key={link.href} link={link} active={isActive(pathname, link.href)} />
            ))}
            <div className="nav-more" ref={moreRef}>
              <button
                type="button"
                className="nav-item"
                aria-expanded={isMoreOpen}
                aria-haspopup="menu"
                data-active={isMoreActive || undefined}
                onClick={() => setIsMoreOpen((open) => !open)}
              >
                Daha fazla
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {isMoreOpen ? (
                <div className="nav-more-menu" role="menu">
                  {more.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      role="menuitem"
                      className="nav-more-item"
                      aria-current={isActive(pathname, link.href) ? 'page' : undefined}
                    >
                      <NavIcon name={link.icon} />
                      {link.label}
                    </Link>
                  ))}
                  {player?.isAdmin ? <AdminLink /> : null}
                </div>
              ) : null}
            </div>
          </nav>

          <div className="topbar-right">
            {notifications ? (
              <Link
                href={notifications.href}
                className="icon-button hide-mobile"
                aria-label={notifications.label}
                title={notifications.label}
                aria-current={isActive(pathname, notifications.href) ? 'page' : undefined}
              >
                <NavIcon name={notifications.icon} />
              </Link>
            ) : null}
            {player ? (
              <>
                <CurrencyPill kind="money" label={CURRENCY_LABELS.money} value={player.money} />
                <CurrencyPill kind="gems" label={CURRENCY_LABELS.gems} value={player.gems} />
                <Link href={`/profile/${encodeURIComponent(player.username)}`} className="profile-chip">
                  <HorseAvatar horseId={player.id} size={34} />
                  <span className="profile-name hide-mobile hide-below-wide">{player.displayName}</span>
                  <span className="level-badge" title={`Seviye ${player.level}`}>
                    {player.level}
                  </span>
                </Link>
              </>
            ) : (
              <span className="guest-label">Misafir</span>
            )}
          </div>
        </div>
      </header>

      <nav aria-label="Alt gezinti" className="bottom-nav">
        {mobileTabs.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bottom-nav-item"
            aria-current={isActive(pathname, link.href) ? 'page' : undefined}
          >
            <NavIcon name={link.icon} size={22} />
            <span>{link.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className="bottom-nav-item"
          aria-expanded={isSheetOpen}
          onClick={() => setIsSheetOpen(true)}
        >
          <Menu size={22} aria-hidden="true" />
          <span>Menü</span>
        </button>
      </nav>

      {isSheetOpen ? (
        <div className="nav-sheet-backdrop" onClick={() => setIsSheetOpen(false)}>
          <div
            className="nav-sheet"
            role="dialog"
            aria-label="Tüm menü"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="nav-sheet-header">
              <span className="section-title">Menü</span>
              <button type="button" className="icon-button" aria-label="Kapat" onClick={() => setIsSheetOpen(false)}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="nav-sheet-grid">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="nav-sheet-item"
                  aria-current={isActive(pathname, link.href) ? 'page' : undefined}
                >
                  <NavIcon name={link.icon} size={24} />
                  <span>{link.label}</span>
                </Link>
              ))}
              {player?.isAdmin ? <AdminLink sheet /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function NavItem({ link, active }: { link: NavLink; active: boolean }): React.ReactElement {
  return (
    <Link href={link.href} className="nav-item" aria-current={active ? 'page' : undefined}>
      <NavIcon name={link.icon} />
      {link.label}
    </Link>
  );
}

/** Yönetim bağlantısı — oyunun parçası değil, moderasyon aracıdır; altın renkle ayrılır. */
function AdminLink({ sheet = false }: { sheet?: boolean }): React.ReactElement {
  return (
    <Link href="/admin" className={sheet ? 'nav-sheet-item admin-link' : 'nav-more-item admin-link'}>
      <ShieldCheck size={sheet ? 24 : 18} aria-hidden="true" />
      <span>Yönetim</span>
    </Link>
  );
}

/**
 * Bakiye rozeti. Birim adı görünmez metin olarak verilir (`aria-label` +
 * `title`); adlar `lib/currency.ts`'ten gelir (iki yerde tutulmaz).
 */
function CurrencyPill({
  kind,
  label,
  value,
}: {
  kind: 'money' | 'gems';
  label: string;
  value: number;
}): React.ReactElement {
  const Icon = kind === 'money' ? Coins : Gem;
  return (
    <div
      className={`currency-pill currency-${kind}`}
      title={`${label} bakiyesi`}
      aria-label={`${label} bakiyesi: ${value.toLocaleString('tr-TR')}`}
    >
      <Icon size={16} aria-hidden="true" />
      {value.toLocaleString('tr-TR')}
    </div>
  );
}
