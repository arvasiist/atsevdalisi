import { ImageResponse } from 'next/og';
import { PwaIconImage } from '../../../features/pwa/PwaIconImage';
import { parsePwaIconSize } from '../../../features/pwa/pwa';

/** `/pwa-icon/192` ve `/pwa-icon/512` — başka ölçü 404. */
export function GET(_request: Request, { params }: { params: { size: string } }): Response {
  const size = parsePwaIconSize(params.size);
  if (size === null) {
    return new Response('Bulunamadı', { status: 404 });
  }
  return new ImageResponse(<PwaIconImage size={size} />, { width: size, height: size });
}
