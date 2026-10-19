import type { CanonicalData } from '@shared';
import { describe, expect, it } from 'vitest';
import type { FormField } from './analyzer';
import type { Mapping } from './mapping';
import { planFill, questionTypeOf, valueOf } from './plan';

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
const mapped = (fieldKey: string, canonicalPath: Mapping['canonicalPath']): Mapping => ({
  fieldKey,
  canonicalPath,
  confidence: 0.9,
  status: canonicalPath ? 'mapped' : 'unmapped',
  source: 'heuristic',
  candidates: [],
});

describe('valueOf : aucune valeur inventée', () => {
  it('reprend les valeurs renseignées, y compris 0 et false', () => {
    expect(valueOf('Dupont')).toBe('Dupont');
    expect(valueOf(5)).toBe(5);
    expect(valueOf(0)).toBe(0);
    expect(valueOf(false)).toBe(false);
    expect(valueOf(true)).toBe(true);
  });

  it('null, absent et chaîne vide n’ont pas de valeur', () => {
    expect(valueOf(null)).toBeNull();
    expect(valueOf(undefined)).toBeNull();
    expect(valueOf('')).toBeNull();
    expect(valueOf('   ')).toBeNull();
  });

  it('un niveau de connaissance « connu » donne sa valeur (0 compris)', () => {
    expect(valueOf({ value: 2, knowledge: 'KNOWN' })).toBe(2);
    expect(valueOf({ value: 0, knowledge: 'KNOWN' })).toBe(0);
  });

  it('« inconnu » et « l’assuré ne sait pas » ne se remplissent pas à la place du courtier', () => {
    expect(valueOf({ value: null, knowledge: 'UNKNOWN' })).toBeNull();
    expect(valueOf({ value: null, knowledge: 'DECLARED_UNKNOWN' })).toBeNull();
    expect(valueOf({ value: 3, knowledge: 'UNKNOWN' })).toBeNull();
  });
});

describe('planFill', () => {
  const fields = [
    field('nom', { required: true, label: 'Nom' }),
    field('tel', { label: 'Téléphone' }),
    field('cp', { required: true, label: 'Code postal' }),
    field('civ', { kind: 'radio', inputType: 'radio', label: 'Civilité' }),
    field('sin', { kind: 'number', inputType: 'number', required: true, label: 'Sinistres' }),
  ];
  const mappings = [mapped('nom', 'client.lastName'), mapped('tel', 'client.phone'), mapped('cp', 'client.address.postalCode'), mapped('civ', null), mapped('sin', 'insuranceHistory.claimsCount')];

  it('remplit les champs reconnus dont le dossier a la valeur', () => {
    const data: CanonicalData = { 'client.lastName': 'Dupont', 'client.phone': '0612345678', 'client.address.postalCode': '75002', 'insuranceHistory.claimsCount': { value: 0, knowledge: 'KNOWN' } };
    const plan = planFill(fields, mappings, data);

    expect(plan.instructions.map(i => [i.field.key, i.path, i.value])).toEqual([
      ['nom', 'client.lastName', 'Dupont'],
      ['tel', 'client.phone', '0612345678'],
      ['cp', 'client.address.postalCode', '75002'],
      ['sin', 'insuranceHistory.claimsCount', 0],
    ]);
    expect(plan.missing).toEqual([]);
  });

  it('demande au courtier les champs OBLIGATOIRES que le dossier ne fournit pas', () => {
    const plan = planFill(fields, mappings, { 'client.lastName': 'Dupont', 'client.address.postalCode': null, 'insuranceHistory.claimsCount': { value: null, knowledge: 'DECLARED_UNKNOWN' } });

    expect(plan.missing).toEqual([
      { canonicalPath: 'client.address.postalCode', label: 'Code postal', type: 'text' },
      { canonicalPath: 'insuranceHistory.claimsCount', label: 'Sinistres', type: 'number' },
    ]);
  });

  it('laisse vide un champ facultatif sans donnée (rien n’est rempli par défaut)', () => {
    const plan = planFill(fields, mappings, { 'client.lastName': 'Dupont', 'client.address.postalCode': '75002', 'insuranceHistory.claimsCount': { value: 1, knowledge: 'KNOWN' }, 'client.phone': null });

    expect(plan.instructions.map(i => i.field.key)).not.toContain('tel');
    expect(plan.missing).toEqual([]);
  });

  it('un chemin absent du dossier compte comme non renseigné', () => {
    expect(planFill(fields, mappings, {}).missing.map(m => m.canonicalPath)).toEqual(['client.lastName', 'client.address.postalCode', 'insuranceHistory.claimsCount']);
  });

  it('liste les champs non reconnus, à traiter à la main', () => {
    expect(planFill(fields, mappings, {}).unmapped.map(f => f.key)).toEqual(['civ']);
  });

  it('ne signale qu’une fois un chemin visé par plusieurs champs (ex. confirmation de l’e-mail)', () => {
    const two = [field('e1', { required: true, label: 'E-mail' }), field('e2', { required: true, label: 'Confirmez' })];
    const plan = planFill(two, [mapped('e1', 'client.email'), mapped('e2', 'client.email')], {});

    expect(plan.missing).toHaveLength(1);
  });

  it('remplit les deux champs de confirmation avec la même valeur', () => {
    const two = [field('e1', { label: 'E-mail' }), field('e2', { label: 'Confirmez' })];
    const plan = planFill(two, [mapped('e1', 'client.email'), mapped('e2', 'client.email')], { 'client.email': 'jean@example.fr' });

    expect(plan.instructions.map(i => i.value)).toEqual(['jean@example.fr', 'jean@example.fr']);
  });
});

describe('questionTypeOf', () => {
  it('déduit le type de la question à poser du champ de l’extranet', () => {
    expect(questionTypeOf(field('a', { kind: 'date' }))).toBe('date');
    expect(questionTypeOf(field('a', { kind: 'number' }))).toBe('number');
    expect(questionTypeOf(field('a', { kind: 'checkbox' }))).toBe('boolean');
    expect(questionTypeOf(field('a', { kind: 'select', options: [{ value: 'a', label: 'Renault' }, { value: 'b', label: 'Peugeot' }] }))).toBe('choice');
    expect(questionTypeOf(field('a', { kind: 'radio', options: [{ value: '1', label: 'Oui' }, { value: '0', label: 'Non' }] }))).toBe('boolean');
    expect(questionTypeOf(field('a', { kind: 'autocomplete' }))).toBe('text');
    expect(questionTypeOf(field('a'))).toBe('text');
  });
});
