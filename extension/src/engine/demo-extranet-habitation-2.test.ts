import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeForm } from './analyzer';
import { detectResultPage, extractFromDom } from './capture';
import { mapFields } from './mapping';
import { detectStepHint, isFinalStep } from './steps';

/**
 * Second extranet de démonstration Habitation (`demo-extranet-habitation-2/`, servi sur http://localhost:8092) :
 * mêmes questions qu'Assureur Habitat, autre tarif et autres garanties, pour alimenter le comparatif.
 */

const load = (page: string) => {
  const html = readFileSync(resolve(__dirname, '../../demo-extranet-habitation-2', page), 'utf8');
  document.open();
  document.write(html);
  document.close();
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Extranet de démonstration Habitation n° 2 (Maison Sûre)', () => {
  it('étape 1 : reconnaît le souscripteur', () => {
    load('devis-etape1.html');
    const paths = mapFields(analyzeForm(document).fields).filter(m => m.status === 'mapped').map(m => m.canonicalPath);
    expect(paths).toEqual(expect.arrayContaining(['client.lastName', 'client.firstName', 'client.email']));
    expect(detectStepHint(document)).toMatchObject({ current: 1, total: 3 });
  });

  it('étape 3 : reconnue comme dernière étape', () => {
    load('devis-etape3.html');
    expect(isFinalStep(document, detectStepHint(document))).toBe(true);
  });

  it('page de résultat : tarif capturé, différent de celui d’Assureur Habitat', () => {
    load('resultat.html');
    const fillable = mapFields(analyzeForm(document).fields).filter(m => m.status === 'mapped').length;
    const extraction = extractFromDom(document);
    expect(detectResultPage(extraction, fillable)).toBe('found');
    expect(extraction.offer.quoteNumber).toBe('MSH-DEMO-2026-0019');
    expect(extraction.offer.premiumAnnual).toBe(312);
    expect(extraction.offer.guarantees.find(g => g.label === 'Bris de glace')?.included).toBe(false);
    expect(extraction.offer.guarantees.find(g => g.label === 'Objets de valeur')?.included).toBe(true);
  });
});
