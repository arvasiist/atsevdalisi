'use client';

/**
 * 15.10.2026 — S6 (`docs/OYUN_DONGUSU_DENETIMI.md` B9): "SIRADAKİ ADIM".
 * Yeni oyuncuya ne yapacağını söyleyen ilk oturum yolu. Adımlar ve hangisinin
 * yapıldığı SUNUCUDAN gelir (`GET /onboarding`, mevcut tablolardan türetilir);
 * bu bileşen yalnızca gösterir. Bütün adımlar bitince kendini gizler. Ödül
 * yoktur — panel yalnızca yol gösterir.
 *
 * Ahır sahnesi ekranı kapladığı için kart sahnenin ÜSTÜNDE durur
 * (`.onboarding-overlay`, sol üst — PLACEHOLDER rozetinin altı); sahnenin
 * altına koymak yeni oyuncunun onu hiç görmemesi demekti.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Compass } from 'lucide-react';
import type { OnboardingView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { nextOnboardingStep, onboardingProgressLabel } from './onboarding-logic';

export function OnboardingPanel() {
  const [view, setView] = useState<OnboardingView | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .getOnboarding()
      .then((data) => {
        if (active) setView(data);
      })
      // Panel yardımcıdır: okunamazsa ahırı bozmadan gizlenir.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const next = view === null ? null : nextOnboardingStep(view);
  if (view === null || next === null) return null;

  return (
    <aside className="onboarding-overlay" data-testid="onboarding-panel" aria-label="Sıradaki adım">
      <div className="onboarding-overlay-head">
        <strong>
          <Compass size={16} /> Sıradaki adım
        </strong>
        <span data-testid="onboarding-progress">{onboardingProgressLabel(view)}</span>
      </div>
      <div data-testid="onboarding-next-title" className="onboarding-overlay-title">
        {next.title}
      </div>
      <p className="onboarding-overlay-hint">{next.hint}</p>
      <div className="onboarding-overlay-actions">
        <Link href={next.href} className="btn-gold" data-testid="onboarding-go">
          Hadi yapalım →
        </Link>
        <button type="button" className="btn-outline" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Gizle' : 'Tüm adımlar'}
        </button>
      </div>
      {expanded ? (
        <ol className="onboarding-overlay-list">
          {view.steps.map((step) => (
            <li key={step.key} data-testid={`onboarding-step-${step.key}`} data-done={step.done}>
              {step.done ? <CheckCircle2 size={14} aria-label="tamamlandı" /> : <Circle size={14} aria-label="yapılmadı" />}
              {step.done ? <span>{step.title}</span> : <Link href={step.href}>{step.title}</Link>}
            </li>
          ))}
        </ol>
      ) : null}
    </aside>
  );
}
