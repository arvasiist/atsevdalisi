import { ImageResponse } from 'next/og';
import { PwaIconImage } from '../../../features/pwa/PwaIconImage';
import { parsePwaIconSize } from '../../../features/pwa/pwa';

/** `/pwa-icon/192` ve `/pwa-icon/512` — başka ölçü 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }): Promise<Response> {
  // Next 15+: rota parametreleri Promise'tir.
  const size = parsePwaIconSize((await params).size);
  if (size === null) {
    return new Response('Bulunamadı', { status: 404 });
  }
  return new ImageResponse(<PwaIconImage size={size} />, { width: size, height: size });
}
