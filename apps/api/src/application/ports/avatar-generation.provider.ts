/**
 * AI AVATAR SAĞLAYICI SOYUTLAMASI (07.10.2026, brief §40). Sağlayıcı yalnızca
 * BACKEND'de konuşulur; API anahtarı ortam değişkenindedir ve istemciye
 * asla gitmez. Sağlayıcı değişirse yalnızca bu arayüzün yeni bir uygulaması
 * yazılır. Yapılandırılmış sağlayıcı yoksa enjekte edilen değer `null`dır ve
 * hat "kullanılamıyor" der (sahte bir başarı üretilmez — brief §70).
 */
export const AVATAR_GENERATION_PROVIDER = Symbol('AVATAR_GENERATION_PROVIDER');

export type AvatarProviderState =
  | { state: 'analyzing' | 'generating' | 'ready' }
  | { state: 'failed'; reason: string };

export interface AvatarProviderResult {
  /** glTF 2.0 ikili (GLB). Sunucu doğrular; doğrulamayı geçmeyen model avatar YAPILMAZ. */
  model: Uint8Array;
  thumbnail: { bytes: Uint8Array; contentType: 'image/png' | 'image/jpeg' | 'image/webp' } | null;
}

export interface AvatarGenerationProvider {
  /** Depoda ve iş kaydında saklanan kısa ad (ör. "acme-3d"). */
  readonly name: string;
  generate(input: { image: Uint8Array; contentType: string }): Promise<{ providerJobId: string }>;
  getStatus(providerJobId: string): Promise<AvatarProviderState>;
  download(providerJobId: string): Promise<AvatarProviderResult>;
  /** En iyi çaba — sağlayıcı iptali desteklemiyorsa sessizce döner. */
  cancel(providerJobId: string): Promise<void>;
}
