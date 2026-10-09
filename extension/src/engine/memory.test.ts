import { webcrypto } from 'node:crypto';
import type { CanonicalPath, FormMemoryField } from '@shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormField } from './analyzer';
import { Mapping } from './mapping';
import { applyMemory, memoryKeyFor, safeLabel, toMemoryFields } from './memory';

const field = (key: string, overrides: Partial<FormField> = {}): FormField => ({
  key,
  kind: 'text',
  inputType: 'text',
  label: key,
  placeholder: null,
  name: null,
  id: null,
  autocomplete: null,
  required: false,
  section: null,
  order: 0,
  options: [],
  pattern: null,
  maxLength: null,
  ...overrides,
});

const mapping = (fieldKey: string, status: Mapping['status'], canonicalPath: CanonicalPath | null = null, confidence = 0.9): Mapping => ({
  fieldKey,
  canonicalPath,
  confidence,
  status,
  source: 'heuristic',
  candidates: [],
});

const entry = (fieldKey: string, canonicalPath: CanonicalPath | null, confidence = 0.9, type: FormMemoryField['type'] = 'text'): FormMemoryField => ({
  fieldKey,
  label: fieldKey,
  type,
  order: 0,
  canonicalPath,
  confidence,
});

const ALLOWED: CanonicalPath[] = ['client.phone', 'client.lastName', 'client.firstName', 'vehicle.usage'];

describe('memoryKeyFor', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
  });

  it('calcule la même clé que le serveur (vecteur de référence commun)', async () => {
    expect(await memoryKeyFor('https://extranet.assureur-a.fr', 'v1:0123456789abcd')).toBe('2fe4dee1e2591c20e03a9bc47a9abe63');
  });

  it('dépend de l’origine et de l’empreinte', async () => {
    const a = await memoryKeyFor('https://a.fr', 'v1:0123456789abcd');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(await memoryKeyFor('https://b.fr', 'v1:0123456789abcd'));
    expect(a).not.toBe(await memoryKeyFor('https://a.fr', 'v1:0123456789abce'));
  });
});

describe('applyMemory', () => {
  const fields = [field('tel', { inputType: 'tel' }), field('nom'), field('civ', { kind: 'radio', inputType: 'radio' })];

  it('donne le chemin appris aux champs que les synonymes n’ont pas tranchés, sans passer par l’IA', () => {
    const { mappings, fromMemory } = applyMemory(fields, [mapping('tel', 'unmapped'), mapping('nom', 'uncertain'), mapping('civ', 'unmapped')], [entry('tel', 'client.phone'), entry('nom', 'client.lastName', 0.8)], ALLOWED);

    expect(mappings[0]).toMatchObject({ canonicalPath: 'client.phone', status: 'mapped', source: 'memory' });
    expect(mappings[1]).toMatchObject({ canonicalPath: 'client.lastName', status: 'mapped', source: 'memory', confidence: 0.8 });
    expect(mappings[2]).toMatchObject({ canonicalPath: null, status: 'unmapped', source: 'heuristic' });
    expect([...fromMemory]).toEqual(['tel', 'nom']);
  });

  it('apprend aussi « aucun équivalent » : ces champs ne repartent pas vers l’IA', () => {
    const { mappings, fromMemory } = applyMemory(fields, [mapping('civ', 'unmapped')], [entry('civ', null, 0, 'radio')], ALLOWED);

    expect(mappings[0]).toMatchObject({ canonicalPath: null, status: 'unmapped', source: 'memory' });
    expect(fromMemory.has('civ')).toBe(true);
  });

  it('un mapping SÛR des synonymes l’emporte sur la mémoire (mémoire partagée, jamais crue sur parole)', () => {
    const { mappings, fromMemory, rejected } = applyMemory(fields, [mapping('nom', 'mapped', 'client.lastName')], [entry('nom', 'client.firstName')], ALLOWED);

    expect(mappings[0]).toMatchObject({ canonicalPath: 'client.lastName', source: 'heuristic' });
    expect(fromMemory.size).toBe(0);
    expect(rejected).toEqual(['nom']);
  });

  it('écarte un chemin hors du modèle canonique, absent du dossier ou incompatible avec le champ', () => {
    const { mappings, rejected, fromMemory } = applyMemory(
      fields,
      [mapping('tel', 'unmapped'), mapping('nom', 'unmapped'), mapping('civ', 'unmapped')],
      [entry('tel', 'client.lastName'), entry('nom', 'driver.licenseDate'), entry('civ', 'client.shoeSize' as CanonicalPath)],
      ALLOWED,
    );

    expect(mappings.map(m => m.canonicalPath)).toEqual([null, null, null]);
    expect(rejected).toEqual(['tel', 'nom', 'civ']); // champ tél ≠ nom ; hors dossier ; hors liste
    expect(fromMemory.size).toBe(0);
  });

  it('ignore une entrée de la mémoire pour un champ qui n’est plus dans la page', () => {
    const { mappings } = applyMemory([field('nom')], [mapping('nom', 'unmapped')], [entry('disparu', 'client.lastName')], ALLOWED);
    expect(mappings[0].canonicalPath).toBeNull();
  });

  it('borne la confiance : jamais en dessous du seuil de mapping, jamais au niveau d’un libellé exact', () => {
    const { mappings } = applyMemory([field('a'), field('b')], [mapping('a', 'unmapped'), mapping('b', 'unmapped')], [entry('a', 'client.firstName', 0.1), entry('b', 'client.lastName', 1)], ALLOWED);
    expect(mappings.map(m => m.confidence)).toEqual([0.75, 0.95]);
  });
});

describe('toMemoryFields : structure seulement', () => {
  const fields = [
    field('text:nom', { label: 'Nom', order: 0 }),
    field('radio:civilite', { kind: 'radio', label: 'Civilité', order: 1 }),
    field('text:inconnu', { label: 'Champ douteux', order: 2 }),
  ];
  const mappings = [mapping('text:nom', 'mapped', 'client.lastName', 0.876), mapping('radio:civilite', 'unmapped'), mapping('text:inconnu', 'uncertain', null, 0.5)];

  it('garde le chemin des champs reconnus, et null (confiance 0) pour les autres', () => {
    expect(toMemoryFields(fields, mappings)).toEqual([
      { fieldKey: 'text:nom', label: 'Nom', type: 'text', order: 0, canonicalPath: 'client.lastName', confidence: 0.88 },
      { fieldKey: 'radio:civilite', label: 'Civilité', type: 'radio', order: 1, canonicalPath: null, confidence: 0 },
      { fieldKey: 'text:inconnu', label: 'Champ douteux', type: 'text', order: 2, canonicalPath: null, confidence: 0 },
    ]);
  });

  it('n’emporte que les six propriétés de la structure', () => {
    for (const memoryField of toMemoryFields(fields, mappings)) {
      expect(Object.keys(memoryField).sort()).toEqual(['canonicalPath', 'confidence', 'fieldKey', 'label', 'order', 'type']);
    }
  });

  it('un libellé qui ressemble à une donnée saisie n’est pas conservé', () => {
    expect(toMemoryFields([field('text:x', { label: 'jean.dupont@example.fr' })], [mapping('text:x', 'unmapped')])[0].label).toBeNull();
  });
});

describe('safeLabel', () => {
  it('garde un libellé de formulaire, écarte e-mails, numéros et textes trop longs', () => {
    expect(safeLabel('  Date de naissance ')).toBe('Date de naissance');
    expect(safeLabel('Puissance fiscale (CV)')).toBe('Puissance fiscale (CV)');
    expect(safeLabel('a@b.fr')).toBeNull();
    expect(safeLabel('06 12 34 56 78')).toBeNull();
    expect(safeLabel('12/03/1985 75002')).toBeNull();
    expect(safeLabel('')).toBeNull();
    expect(safeLabel('x'.repeat(121))).toBeNull();
  });
});
