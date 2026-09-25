import { describe, expect, it } from 'vitest';
import type { Pedigree } from '@at-sevdalisi/shared-types';
import {
  buildPedigreeTree,
  getPedigreeCompleteness,
  hasAnyKnownAncestor,
} from '../../../src/features/pedigree/pedigree-tree';

function makePedigree(overrides: Partial<Pedigree> = {}): Pedigree {
  return {
    horseId: 'foal-1',
    sireId: 'sire-1',
    damId: 'dam-1',
    grandSireId: 'grandsire-1',
    grandDamId: 'granddam-1',
    bloodline: 'Akhal-Teke',
    ...overrides,
  };
}

describe('buildPedigreeTree', () => {
  it('her zaman tam olarak 5 düğüm döner (self + sire + dam + 2 büyükebeveyn)', () => {
    const tree = buildPedigreeTree(makePedigree(), {});
    expect(tree).toHaveLength(5);
    expect(tree.map((node) => node.role)).toEqual(['self', 'sire', 'dam', 'paternal_grand_sire', 'maternal_grand_dam']);
  });

  it('isim haritasında eşleşme varsa gerçek ismi kullanır', () => {
    const tree = buildPedigreeTree(makePedigree(), { 'sire-1': 'Yıldırım', 'dam-1': 'Rüzgar' });
    const sireNode = tree.find((node) => node.role === 'sire')!;
    const damNode = tree.find((node) => node.role === 'dam')!;
    expect(sireNode.displayName).toBe('Yıldırım');
    expect(damNode.displayName).toBe('Rüzgar');
  });

  it('isim haritasında eşleşme yoksa (ama horseId doluysa) horseId\'nin kendisini gösterir, UYDURMAZ', () => {
    const tree = buildPedigreeTree(makePedigree(), {});
    const sireNode = tree.find((node) => node.role === 'sire')!;
    expect(sireNode.displayName).toBe('sire-1');
    expect(sireNode.isKnown).toBe(true);
  });

  it('horseId null olan bir ata için "Bilinmiyor" gösterir ve isKnown false olur', () => {
    const tree = buildPedigreeTree(makePedigree({ sireId: null }), {});
    const sireNode = tree.find((node) => node.role === 'sire')!;
    expect(sireNode.displayName).toBe('Bilinmiyor');
    expect(sireNode.isKnown).toBe(false);
    expect(sireNode.horseId).toBeNull();
  });

  it('self düğümü her zaman pedigree.horseId\'yi taşır', () => {
    const tree = buildPedigreeTree(makePedigree(), { 'foal-1': 'Şimşek' });
    const selfNode = tree.find((node) => node.role === 'self')!;
    expect(selfNode.horseId).toBe('foal-1');
    expect(selfNode.displayName).toBe('Şimşek');
  });
});

describe('hasAnyKnownAncestor', () => {
  it('tüm atalar biliniyorsa true döner', () => {
    const tree = buildPedigreeTree(makePedigree(), {});
    expect(hasAnyKnownAncestor(tree)).toBe(true);
  });

  it('hiçbir ata bilinmiyorsa false döner', () => {
    const tree = buildPedigreeTree(
      makePedigree({ sireId: null, damId: null, grandSireId: null, grandDamId: null }),
      {},
    );
    expect(hasAnyKnownAncestor(tree)).toBe(false);
  });

  it('sadece bir ata biliniyorsa bile true döner', () => {
    const tree = buildPedigreeTree(
      makePedigree({ damId: null, grandSireId: null, grandDamId: null }),
      {},
    );
    expect(hasAnyKnownAncestor(tree)).toBe(true);
  });
});

describe('getPedigreeCompleteness', () => {
  it('4 atanın tamamı biliniyorsa 1 döner', () => {
    const tree = buildPedigreeTree(makePedigree(), {});
    expect(getPedigreeCompleteness(tree)).toBe(1);
  });

  it('hiçbir ata bilinmiyorsa 0 döner', () => {
    const tree = buildPedigreeTree(
      makePedigree({ sireId: null, damId: null, grandSireId: null, grandDamId: null }),
      {},
    );
    expect(getPedigreeCompleteness(tree)).toBe(0);
  });

  it('2/4 ata biliniyorsa 0.5 döner', () => {
    const tree = buildPedigreeTree(makePedigree({ grandSireId: null, grandDamId: null }), {});
    expect(getPedigreeCompleteness(tree)).toBe(0.5);
  });
});
