/**
 * Gezinti simge eşlemesi (01.10.2026). `nav-links.ts` saf veri kalsın diye
 * (DOM'suz test) simge BİLEŞENLERİ burada eşlenir. Simgeler `lucide-react`
 * (ISC lisanslı, kodla gelen SVG); at simgesi kütüphanede olmadığı için
 * projeye özgü `HorseHeadIcon` kullanılır.
 */

import {
  Bell,
  ChartColumn,
  Clapperboard,
  Dumbbell,
  Globe,
  HeartPulse,
  House,
  Shield,
  ShoppingCart,
  Ticket,
  Trophy,
  User,
  Users,
  Wallet,
  Wheat,
  Wrench,
} from 'lucide-react';
import { HorseHeadIcon } from '../ui/HorseHeadIcon';
import type { NavIconName } from './nav-links';

const LUCIDE_ICONS: Record<Exclude<NavIconName, 'horse'>, typeof House> = {
  home: House,
  training: Dumbbell,
  care: HeartPulse,
  races: Trophy,
  grandstand: Ticket,
  market: ShoppingCart,
  leaderboard: ChartColumn,
  friends: Users,
  club: Shield,
  replays: Clapperboard,
  equipment: Wrench,
  farm: Wheat,
  online: Globe,
  wallet: Wallet,
  notifications: Bell,
  account: User,
};

export function NavIcon({ name, size = 18 }: { name: NavIconName; size?: number }): React.ReactElement {
  if (name === 'horse') {
    return <HorseHeadIcon size={size + 2} />;
  }
  const Icon = LUCIDE_ICONS[name];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
