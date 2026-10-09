import type { CanonicalPath } from '@shared';
import { describe, expect, it, vi } from 'vitest';
import { buildAiRequest, parseAiResponse, resolveWithAi } from './ai-fallback';
import type { FormField } from './analyzer';
import { Mapping } from './mapping';

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

const ALLOWED: CanonicalPath[] = ['client.phone', 'client.email', 'client.lastName', 'vehicle.brand', 'vehicle.usage'];
const answer = (...mappings: object[]) => JSON.stringify({ mappings });

describe('buildAiRequest', () => {
  it('décrit la structure du formulaire et la liste fermée, sans aucune valeur du dossier', () => {
    const request = buildAiRequest(
      [field('a', { label: 'Votre numéro direct', inputType: 'tel', section: 'Contact' }), field('b', { kind: 'select', inputType: 'select', label: 'Usage', options: [{ value: '1', label: 'Privé' }] })],
      ALLOWED,
    );
    const payload = JSON.parse(request.messages[0].content);

    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe('user');
    expect(payload.allowedPaths.map((p: { path: string }) => p.path)).toEqual(ALLOWED);
    expect(payload.fields[0]).toMatchObject({ key: 'a', label: 'Votre numéro direct', type: 'tel', section: 'Contact' });
    expect(payload.fields[1]).toMatchObject({ key: 'b', type: 'select (choix)', options: ['Privé'] });
    expect(request.system).toContain('LISTE FERMÉE');
    expect(request.maxTokens).toBeLessThanOrEqual(2000);
  });

  it('borne le nombre de champs et d’options envoyés', () => {
    const many = Array.from({ length: 60 }, (_, i) => field(`f${i}`, { options: Array.from({ length: 50 }, (_, j) => ({ value: String(j), label: `o${j}` })) }));
    const payload = JSON.parse(buildAiRequest(many, ALLOWED).messages[0].content);

    expect(payload.fields).toHaveLength(40);
    expect(payload.fields[0].options).toHaveLength(20);
  });
});

describe('parseAiResponse : la réponse de l’IA est validée, jamais crue sur parole', () => {
  const fields = [field('a', { inputType: 'tel' }), field('b'), field('c', { kind: 'select', inputType: 'select' })];
  const parse = (text: string, used = new Set<CanonicalPath>()) => parseAiResponse(text, fields, ALLOWED, used);

  it('accepte une réponse correcte', () => {
    expect(parse(answer({ key: 'a', canonicalPath: 'client.phone', confidence: 0.8 }))).toEqual([
      { fieldKey: 'a', canonicalPath: 'client.phone', confidence: 0.8 },
    ]);
  });

  it('lit le JSON même entouré de texte ou de ```json', () => {
    const text = 'Voici :\n```json\n' + answer({ key: 'b', canonicalPath: 'client.lastName', confidence: 0.7 }) + '\n```';
    expect(parse(text)).toHaveLength(1);
  });

  it('écarte un chemin hors de la liste fermée, ou hors des chemins du dossier', () => {
    expect(parse(answer({ key: 'b', canonicalPath: 'client.shoeSize', confidence: 0.9 }))).toEqual([]);
    expect(parse(answer({ key: 'b', canonicalPath: 'driver.licenseDate', confidence: 0.9 }))).toEqual([]); // canonique, mais pas dans le dossier
    expect(parse(answer({ key: 'b', canonicalPath: '__proto__', confidence: 0.9 }))).toEqual([]);
  });

  it('écarte un champ qui n’a pas été demandé', () => {
    expect(parse(answer({ key: 'zzz', canonicalPath: 'client.lastName', confidence: 0.9 }))).toEqual([]);
  });

  it('écarte un chemin incompatible avec le type du champ', () => {
    expect(parse(answer({ key: 'a', canonicalPath: 'client.lastName', confidence: 0.9 }))).toEqual([]); // champ téléphone ≠ nom
    expect(parse(answer({ key: 'c', canonicalPath: 'client.phone', confidence: 0.9 }))).toEqual([]); // select ≠ téléphone texte
  });

  it('écarte une confiance insuffisante ou invalide, et plafonne les autres', () => {
    expect(parse(answer({ key: 'b', canonicalPath: 'client.lastName', confidence: 0.3 }))).toEqual([]);
    expect(parse(answer({ key: 'b', canonicalPath: 'client.lastName', confidence: '0.9' }))).toEqual([]);
    expect(parse(answer({ key: 'b', canonicalPath: 'client.lastName' }))).toEqual([]);
    expect(parse(answer({ key: 'b', canonicalPath: 'client.lastName', confidence: 1 }))[0].confidence).toBe(0.85);
  });

  it('écarte null (« aucun chemin ne convient »)', () => {
    expect(parse(answer({ key: 'b', canonicalPath: null, confidence: 0.9 }))).toEqual([]);
  });

  it('un chemin déjà pris par un autre champ n’est pas attribué une seconde fois', () => {
    expect(parse(answer({ key: 'b', canonicalPath: 'client.lastName', confidence: 0.9 }), new Set<CanonicalPath>(['client.lastName']))).toEqual([]);
  });

  it('un seul chemin par champ, et un seul champ par chemin (le plus sûr)', () => {
    const result = parse(
      answer(
        { key: 'b', canonicalPath: 'client.lastName', confidence: 0.7 },
        { key: 'b', canonicalPath: 'client.email', confidence: 0.9 },
        { key: 'a', canonicalPath: 'client.phone', confidence: 0.6 },
      ),
    );
    expect(result.map(m => [m.fieldKey, m.canonicalPath])).toEqual([
      ['b', 'client.lastName'],
      ['a', 'client.phone'],
    ]);
  });

  it.each(['', 'pas du json', '{ cassé', '[]', '{"mappings": "x"}', '{"autre": []}', 'null'])('une réponse inutilisable (%j) ne donne rien', text => {
    expect(parse(text)).toEqual([]);
  });
});

describe('resolveWithAi', () => {
  const mapping = (fieldKey: string, status: Mapping['status'], path: CanonicalPath | null = null): Mapping => ({
    fieldKey,
    canonicalPath: path,
    confidence: status === 'mapped' ? 0.9 : 0.5,
    status,
    source: 'heuristic',
    candidates: [],
  });

  it('ne demande à l’IA que les champs que les synonymes n’ont pas tranchés', async () => {
    const ask = vi.fn(async () => answer({ key: 'phone', canonicalPath: 'client.phone', confidence: 0.8 }));
    const fields = [field('name'), field('phone', { inputType: 'tel' })];

    const { mappings, used } = await resolveWithAi(fields, [mapping('name', 'mapped', 'client.lastName'), mapping('phone', 'unmapped')], ALLOWED, ask);

    expect(used).toBe(true);
    expect(JSON.parse((ask.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0].messages[0].content).fields.map((f: { key: string }) => f.key)).toEqual(['phone']);
    expect(mappings[1]).toMatchObject({ canonicalPath: 'client.phone', status: 'mapped', source: 'ai', confidence: 0.8 });
    expect(mappings[0]).toMatchObject({ source: 'heuristic' });
  });

  it('n’appelle pas l’IA quand tout est reconnu', async () => {
    const ask = vi.fn();
    const result = await resolveWithAi([field('a')], [mapping('a', 'mapped', 'client.lastName')], ALLOWED, ask);

    expect(ask).not.toHaveBeenCalled();
    expect(result.used).toBe(false);
  });

  it('n’appelle pas l’IA sans chemin du dossier, et respecte les corrections manuelles', async () => {
    const ask = vi.fn();
    await resolveWithAi([field('a')], [mapping('a', 'unmapped')], [], ask);
    await resolveWithAi([field('a')], [{ ...mapping('a', 'unmapped'), source: 'manual' }], ALLOWED, ask);

    expect(ask).not.toHaveBeenCalled();
  });

  it('si l’IA est en panne, les synonymes suffisent : le remplissage continue', async () => {
    const ask = vi.fn(async () => {
      throw new Error('quota dépassé');
    });
    const initial = [mapping('a', 'unmapped')];

    const result = await resolveWithAi([field('a')], initial, ALLOWED, ask);

    expect(result).toEqual({ mappings: initial, used: false });
  });

  it('une réponse sans mapping valide laisse les champs inchangés', async () => {
    const result = await resolveWithAi([field('a')], [mapping('a', 'uncertain')], ALLOWED, async () => answer({ key: 'a', canonicalPath: 'inventé', confidence: 1 }));

    expect(result.used).toBe(true);
    expect(result.mappings[0].canonicalPath).toBeNull();
  });
});
