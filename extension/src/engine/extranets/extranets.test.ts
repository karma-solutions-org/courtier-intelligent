import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterFor, EXTRANETS, genericAdapter } from './index';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('adapterFor', () => {
  it.each([
    [{ insurerId: 'zephir' }, 'zephir'],
    [{ insurerId: 'zephir', origin: 'https://autre.fr' }, 'zephir'],
    [{ origin: 'https://zeole.zephir.fr' }, 'zephir'],
    [{ origin: 'https://zephir.fr' }, 'zephir'],
    [{ insurerId: 'oyat', origin: 'https://connexion.oyat-assurances.fr' }, 'generic'],
    [{ origin: 'https://notzephir.fr.evil.com' }, 'generic'],
    [{ origin: 'https://evilzephir.fr' }, 'generic'],
    [{ origin: 'pas une url' }, 'generic'],
    [{}, 'generic'],
  ])('%o → %s', (job, id) => {
    expect(adapterFor(job).id).toBe(id);
  });
});

/**
 * Chaque extranet enregistré a son dossier complet : adaptateur, simulateur de ses pages réelles et test de parcours
 * jusqu'au tarif. Un extranet configuré sans test de parcours ne doit pas pouvoir passer inaperçu.
 */
describe('registre des extranets', () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it.each(EXTRANETS.map(extranet => [extranet.insurerId]))('%s : adaptateur, fixture et test de parcours', insurerId => {
    for (const file of ['adapter.ts', 'fixture.ts', 'journey.test.ts']) {
      expect(existsSync(join(root, insurerId, file)), `${insurerId}/${file} manquant`).toBe(true);
    }
  });

  it('un assureur n’est enregistré qu’une fois, avec au moins un domaine', () => {
    const ids = EXTRANETS.map(extranet => extranet.insurerId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const extranet of EXTRANETS) expect(extranet.hosts.length).toBeGreaterThan(0);
  });
});

describe('findAddRowButton : générique', () => {
  it('texte simple suivi d’une icône ⊕ : clique l’icône', () => {
    document.body.innerHTML = `<div><span>Ajouter un sinistre</span><fa-icon><svg></svg></fa-icon></div><button>Suivant</button>`;
    expect(genericAdapter.findAddRowButton(document, 'claims')?.tagName.toLowerCase()).toBe('fa-icon');
  });

  it('préfère un vrai bouton', () => {
    document.body.innerHTML = '<button><span>+ Ajouter un sinistre</span></button>';
    expect(genericAdapter.findAddRowButton(document, 'claims')?.tagName).toBe('BUTTON');
  });

  it('rien sans bouton d’ajout', () => {
    document.body.innerHTML = '<button>Suivant</button><p>1 sinistre(s) corporel responsable(s)</p>';
    expect(genericAdapter.findAddRowButton(document, 'claims')).toBeNull();
  });
});

