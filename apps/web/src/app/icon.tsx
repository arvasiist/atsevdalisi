import { ImageResponse } from 'next/og';
import { PwaIconImage } from '../features/pwa/PwaIconImage';

/** Sekme simgesi (favicon) — PWA ikonuyla aynı çizim. */
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon(): ImageResponse {
  return new ImageResponse(<PwaIconImage size={64} />, size);
}
