'use client';

/**
 * Master Development Brief "Pedigree görselleştirme" (bu turda EKLENDİ) —
 * `pedigree-tree.ts`'in ürettiği `PedigreeTreeNode[]`'i (bkz. o dosyanın
 * dosya başı doc yorumu — şemanın KENDİ 2-nesil/asimetrik sınırı) bir
 * ağaç diyagramı olarak render eder.
 *
 * `RaceHud.tsx` ile AYNI kısıt: bu dosya `@types/react` bu sandbox'ta
 * kurulu OLMADIĞINDAN yerel `tsc` ile doğrulanamaz (bkz. o dosyanın doc
 * yorumu), yalnızca `ts.transpileModule` ile sözdizimi kontrolü yapılır
 * — ama three.js'e BAĞIMLI DEĞİLDİR (saf React + CSS), bu yüzden ileride
 * `@types/react` bu ortama eklenirse `RaceHud.tsx` ile AYNI şekilde
 * `@testing-library/react` ile GERÇEKTEN render edilip test edilebilir.
 *
 * Görsel yerleşim, `Pedigree` şemasının GERÇEK (simetrik OLMAYAN) şeklini
 * yansıtır: aygır (sire) dalının ALTINDA sadece baba hattı büyükbaba,
 * kısrak (dam) dalının ALTINDA sadece anne hattı büyükanne vardır — diğer
 * iki büyükebeveyn slotu şemada HİÇ YOK, bu yüzden burada da hiç
 * RENDER EDİLMEZ (bkz. `pedigree-tree.ts`'in doc yorumu).
 */

import type { Pedigree } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { buildPedigreeTree, getPedigreeCompleteness, type PedigreeTreeNode } from './pedigree-tree';

const ROLE_LABELS: Record<PedigreeTreeNode['role'], string> = {
  self: 'Bu At',
  sire: 'Baba (Aygır)',
  dam: 'Anne (Kısrak)',
  paternal_grand_sire: 'Baba Hattı Büyükbaba',
  maternal_grand_dam: 'Anne Hattı Büyükanne',
};

export interface PedigreeTreeProps {
  pedigree: Pedigree;
  horseNamesById: Record<string, string>;
}

function PedigreeNodeCard({ node }: { node: PedigreeTreeNode }): React.ReactElement {
  return (
    <GlassPanel
      style={{
        padding: 'var(--space-sm) var(--space-md)',
        textAlign: 'center',
        opacity: node.isKnown ? 1 : 0.55,
        minWidth: '140px',
      }}
    >
      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
        {ROLE_LABELS[node.role]}
      </div>
      <div
        style={{
          marginTop: '4px',
          fontSize: node.role === 'self' ? '16px' : '14px',
          fontWeight: node.role === 'self' ? 700 : 500,
          color: node.isKnown ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        }}
      >
        {node.displayName}
      </div>
    </GlassPanel>
  );
}

export function PedigreeTree({ pedigree, horseNamesById }: PedigreeTreeProps): React.ReactElement {
  const tree = buildPedigreeTree(pedigree, horseNamesById);
  const selfNode = tree.find((node) => node.role === 'self');
  const sireNode = tree.find((node) => node.role === 'sire');
  const damNode = tree.find((node) => node.role === 'dam');
  const paternalGrandSireNode = tree.find((node) => node.role === 'paternal_grand_sire');
  const maternalGrandDamNode = tree.find((node) => node.role === 'maternal_grand_dam');
  const completenessPercent = Math.round(getPedigreeCompleteness(tree) * 100);

  if (!selfNode || !sireNode || !damNode || !paternalGrandSireNode || !maternalGrandDamNode) {
    // `buildPedigreeTree` her zaman tam olarak 5 düğüm döner (bkz. o
    // fonksiyonun doc yorumu) — bu dal PRATİKTE hiç ÇALIŞMAZ, ama
    // `noUncheckedIndexedAccess`/`Array.prototype.find`'ın dönüş tipi
    // (`T | undefined`) nedeniyle TypeScript bunu KANITLAYAMAZ. Sessizce
    // `!`la geçmek YERİNE gerçek bir çalışma zamanı guard'ı (brief'in
    // "çok gerçekçi yaz" ilkesi).
    throw new Error('PedigreeTree: beklenmeyen soy ağacı şekli (5 düğüm bekleniyordu).');
  }

  return (
    <GlassPanel>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 'var(--space-md)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--color-text-primary)' }}>Soy Ağacı</h3>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          Kayıt tamlığı: %{completenessPercent}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-md)' }}>
        <PedigreeNodeCard node={selfNode} />

        <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <PedigreeNodeCard node={sireNode} />
            <PedigreeNodeCard node={paternalGrandSireNode} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <PedigreeNodeCard node={damNode} />
            <PedigreeNodeCard node={maternalGrandDamNode} />
          </div>
        </div>
      </div>

      {pedigree.bloodline ? (
        <div style={{ marginTop: 'var(--space-md)', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          Kan hattı: <strong style={{ color: 'var(--color-accent-gold)' }}>{pedigree.bloodline}</strong>
        </div>
      ) : null}
    </GlassPanel>
  );
}
