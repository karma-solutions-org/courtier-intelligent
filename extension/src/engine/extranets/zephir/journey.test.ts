import type { CanonicalData } from '@shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { JobContext } from '../../../shared/messages';
import { pressedAnswer, runJourney } from '../testing/journey';
import { DECLARATIONS, mountZephir, ZEPHIR_ORIGIN, ZEPHIR_PAGES } from './fixture';

/**
 * NON-RÉGRESSION ZEPHIR. Le parcours Zephir fonctionne de bout en bout (octobre 2026) : ce test le rejoue sur le HTML
 * réel de l'extranet. Une modification faite pour un autre extranet qui le casse doit être corrigée sans toucher à ce
 * test : le comportement propre à chaque extranet va dans engine/extranets/<insurerId>/.
 */
const QUOTE_DATA: CanonicalData = {
  'vehicle.firstRegistrationDate': '2012-11-13',
  'vehicle.parkingPostalCode': '13010',
  'vehicle.parkingCity': 'Marseille',
  'vehicle.parkingType': 'garage_prive',
  'insuranceHistory.claimsCount': { value: 1, knowledge: 'KNOWN' },
  'insuranceHistory.claims.1.type': 'corporel',
  'insuranceHistory.claims.1.responsibility': '100',
  'insuranceHistory.claims.1.date': '2025-10-28',
  'extra.conducteurs_permis_valide': true,
  'extra.situation_incompatible_permis': false,
  'extra.vehicule_transport_matieres_dangereuses': false,
};

const job: JobContext = {
  dossierId: 'dossier-zephir',
  insurerId: 'zephir',
  insurerName: 'Zephir',
  status: 'requested',
  quoteData: QUOTE_DATA,
  missingFields: [],
  productPaths: Object.keys(QUOTE_DATA),
  productQuestions: [
    { path: 'extra.conducteurs_permis_valide', label: DECLARATIONS.permis, type: 'boolean' },
    { path: 'extra.situation_incompatible_permis', label: DECLARATIONS.incompatible, type: 'boolean' },
    { path: 'extra.vehicule_transport_matieres_dangereuses', label: DECLARATIONS.transport, type: 'boolean' },
  ],
};

describe('NON-RÉGRESSION ZEPHIR : parcours Auto complet jusqu’aux tarifs', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('remplit chaque page, ajoute les sinistres, valide le résumé et les déclarations, puis lit le tarif', async () => {
    const zephir = mountZephir(document);
    zephir.onLeave((_page, form) => ({
      garage: pressedAnswer(form, 'GARAGE'),
      AUTO01: pressedAnswer(form, 'AUTO01'),
      AUTO02: pressedAnswer(form, 'AUTO02'),
      AUTO03: pressedAnswer(form, 'AUTO03'),
      rows: form.querySelectorAll('tbody tr').length,
      type: form.querySelector<HTMLSelectElement>('select[name="typeSinistre1"]')?.value ?? null,
    }));

    const { offer } = await runJourney(zephir, job, { origin: ZEPHIR_ORIGIN, finalPage: 'tarifs' });

    // Toutes les pages, dans l'ordre, sans refus de Zephir.
    expect(zephir.visited).toEqual(ZEPHIR_PAGES.map(page => page.name));
    expect(zephir.refused).toEqual([]);
    // Garage Oui (lieu de stationnement « garage privé »).
    expect(zephir.snapshots['vehicule:garage']).toBe('Oui');
    // Une ligne de sinistre ajoutée et remplie, sur chacune des deux pages d'antécédents identiques.
    expect(zephir.snapshots['antecedents-principal:rows']).toBe(1);
    expect(zephir.snapshots['antecedents-principal:type']).toBe('CORP');
    expect(zephir.snapshots['antecedents-secondaire:rows']).toBe(1);
    // Déclarations : réponses du dossier.
    expect(zephir.snapshots['declarations:AUTO01']).toBe('Oui');
    expect(zephir.snapshots['declarations:AUTO02']).toBe('Non');
    expect(zephir.snapshots['declarations:AUTO03']).toBe('Non');
    // Tarif lu.
    expect(offer?.premiumAnnual).toBe(642.3);
  }, 30_000);
});
