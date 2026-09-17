'use client';

/**
 * Paylaşılan mockup'taki "Ahırım" ekranındaki yıldız derecelendirmesi.
 * Backend'de bir "yıldız" alanı YOKTUR — brief/GAME_DESIGN.md hiçbir yerde
 * ayrı bir star-rating alanı tanımlamaz, atlar 0-100 `quality` puanıyla
 * ölçülür (`packages/shared-types/src/horse.ts`). Bu bileşen o GERÇEK
 * 0-100 puanı 0-N yıldıza (0.5 hassasiyetle) DÖNÜŞTÜRÜR — yeni bir backend
 * alanı icat etmez, sadece istemci tarafında bir sunum dönüşümüdür.
 */
export interface StarRatingProps {
  score: number;
  maxStars?: number;
}

const DEFAULT_MAX_STARS = 5;
const SCORE_MAX = 100;
const HALF_STAR_STEP = 2;

export function scoreToStars(score: number, maxStars: number = DEFAULT_MAX_STARS): number {
  const clamped = Math.max(0, Math.min(SCORE_MAX, score));
  return Math.round(((clamped / SCORE_MAX) * maxStars) * HALF_STAR_STEP) / HALF_STAR_STEP;
}

export function StarRating({ score, maxStars = DEFAULT_MAX_STARS }: StarRatingProps): React.ReactElement {
  const stars = scoreToStars(score, maxStars);

  return (
    <div style={{ display: 'inline-flex', gap: '2px' }} aria-label={`${stars} / ${maxStars} yıldız`} role="img">
      {Array.from({ length: maxStars }, (_, index) => {
        const fillFraction = Math.max(0, Math.min(1, stars - index));
        return (
          <span
            key={index}
            style={{
              position: 'relative',
              display: 'inline-block',
              width: '16px',
              height: '16px',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            <span style={{ position: 'absolute', inset: 0, color: 'rgba(255, 255, 255, 0.16)' }}>★</span>
            <span
              style={{
                position: 'absolute',
                inset: 0,
                color: 'var(--color-accent-gold)',
                width: `${fillFraction * 100}%`,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              ★
            </span>
          </span>
        );
      })}
    </div>
  );
}
