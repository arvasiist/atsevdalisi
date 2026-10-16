import { ImageResponse } from 'next/og';
import { PwaIconImage } from '../features/pwa/PwaIconImage';

/** iOS ana ekran ikonu (iOS manifest ikonlarını kullanmaz). */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon(): ImageResponse {
  return new ImageResponse(<PwaIconImage size={180} />, size);
}
