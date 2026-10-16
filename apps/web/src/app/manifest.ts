import type { MetadataRoute } from 'next';
import { buildManifest } from '../features/pwa/pwa';

/** `/manifest.webmanifest` — Next `<head>`e kendiliğinden bağlar. */
export default function manifest(): MetadataRoute.Manifest {
  return buildManifest();
}
