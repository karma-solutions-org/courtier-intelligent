import type { CanonicalData } from '@shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '../shared/messages';
import { AskAi } from './ai-fallback';
import { FormRunner } from './runner';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition: () => boolean, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('Délai dépassé : la condition ne s’est pas réalisée.');
    await pause(20);
  }
}

const MODELS = ['SCENIC IV', 'SPIDER', 'TALISMAN', 'TRAFIC', 'TRAFIC III', 'TWINGO'];
const ENERGIES = ['ESSENCE', 'GAZOLE', 'ELECTRIQUE'];

/**
 * Comme Zéphir : la liste Modèle se charge (requête) après le choix de la Marque, Énergie après celui du Modèle ;
 * tout changement de marque (même la même) vide le modèle, et chaque rechargement donne aux options de nouvelles
 * valeurs internes. `brandChanges` compte les changements de marque.
 */
function mountZephirLike(doc: Document, delayMs: number, preselectedBrand = false): { brandChanges: () => number } {
  let render = 0;
  let brandChanges = 0;
  doc.body.innerHTML = `
    <form>
      <label for="immat">Immatriculation</label><input id="immat" name="immat" type="text" />
      <label for="marque">Marque</label>
      <select id="marque" name="marque"><option value=""></option><option value="RENAULT">RENAULT</option><option value="PEUGEOT">PEUGEOT</option></select>
      <label for="modele">Modèle</label><select id="modele" name="modele"><option value=""></option></select>
      <label for="energie">Energie</label><select id="energie" name="energie"><option value=""></option></select>
    </form>`;
  const fillOptions = (select: HTMLSelectElement, labels: string[]) => {
    render += 1;
    select.innerHTML = '<option value=""></option>' + labels.map((label, i) => `<option value="${render}:${i}">${label}</option>`).join('');
  };
  const marque = doc.getElementById('marque') as HTMLSelectElement;
  const modele = doc.getElementById('modele') as HTMLSelectElement;
  const energie = doc.getElementById('energie') as HTMLSelectElement;
  marque.addEventListener('change', () => {
    brandChanges += 1;
    fillOptions(modele, []);
    fillOptions(energie, []);
    setTimeout(() => fillOptions(modele, marque.value === 'RENAULT' ? MODELS : []), delayMs);
  });
  modele.addEventListener('change', () => {
    fillOptions(energie, []);
    setTimeout(() => fillOptions(energie, modele.value ? ENERGIES : []), delayMs);
  });
  if (preselectedBrand) {
    // Marque déjà trouvée par l'extranet (recherche par immatriculation), modèles chargés.
    marque.value = 'RENAULT';
    fillOptions(modele, MODELS);
  }
  return { brandChanges: () => brandChanges };
}

const DATA: CanonicalData = {
  'vehicle.registration': 'CM-359-VC',
  'vehicle.brand': 'RENAULT',
  'vehicle.model': 'TRAFIC',
  'vehicle.energyType': 'diesel',
};

const job = (): JobContext => ({
  dossierId: 'd1',
  insurerId: 'zephir',
  insurerName: 'Zephir',
  status: 'requested',
  quoteData: DATA,
  missingFields: [],
});

describe('Listes dépendantes (Marque → Modèle → Énergie)', () => {
  let runner: FormRunner | undefined;
  afterEach(() => {
    runner?.stop();
    document.body.innerHTML = '';
  });

  const start = async () => {
    runner = new FormRunner(job(), {
      doc: document,
      report: async () => undefined,
      publish: () => undefined,
      askAi: vi.fn<AskAi>(async () => '{"mappings":[]}'),
      quietMs: 40,
      settleTimeoutMs: 1000,
    });
    await runner.start();
  };
  const label = (id: string) => {
    const select = document.getElementById(id) as HTMLSelectElement;
    return select.options[select.selectedIndex]?.textContent ?? '';
  };

  it.each([150, 700])('remplit modèle et énergie une fois leur liste chargée (chargement en %i ms)', async delayMs => {
    const page = mountZephirLike(document, delayMs);
    await start();
    await until(() => label('modele') === 'TRAFIC' && label('energie') === 'GAZOLE');
    expect(label('marque')).toBe('RENAULT');
    expect(page.brandChanges()).toBe(1);
  });

  it('ne rechoisit pas une marque déjà choisie (cela viderait le modèle)', async () => {
    const page = mountZephirLike(document, 150, true);
    await start();
    await until(() => label('modele') === 'TRAFIC' && label('energie') === 'GAZOLE');
    expect(page.brandChanges()).toBe(0);
  });
});
