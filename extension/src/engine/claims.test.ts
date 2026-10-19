import type { CanonicalData } from '@shared';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeForm } from './analyzer';
import { fillField } from './filler';
import { mapFields } from './mapping';

/**
 * Tableau « Sinistres » façon Oyat : une ligne par sinistre, colonnes Type de sinistre (liste), Responsabilité
 * (0 % / 50 % / 100 %), Date (trois cases jour / mois / année) et Coût. La ligne n reçoit le sinistre n du dossier.
 */
const claimRow = (n: number) => `
  <tr>
    <td>
      <select name="sinistres[${n}].type">
        <option value="">Sélectionner</option>
        <option value="MAT">Matériel</option>
        <option value="CORP">Corporel</option>
        <option value="BDG">Bris de glace</option>
        <option value="VOL">Vol</option>
        <option value="INC">Incendie</option>
        <option value="AUT">Autre</option>
      </select>
    </td>
    <td>
      <label><input type="radio" name="sinistres[${n}].resp" value="R0" />0%</label>
      <label><input type="radio" name="sinistres[${n}].resp" value="R50" />50%</label>
      <label><input type="radio" name="sinistres[${n}].resp" value="R100" />100%</label>
    </td>
    <td>
      <input name="sinistres[${n}].jj" maxlength="2" /> / <input name="sinistres[${n}].mm" maxlength="2" /> /
      <input name="sinistres[${n}].aaaa" maxlength="4" />
    </td>
    <td><input name="sinistres[${n}].cout" type="number" /></td>
  </tr>`;

const mountOyat = () => {
  document.body.innerHTML = `
    <h2>Antécédents</h2>
    <label for="nb">Nombre de sinistres</label><input id="nb" name="nb" type="number" />
    <table>
      <thead><tr><th>Type de sinistre</th><th>Responsabilité</th><th>Date</th><th>Coût</th></tr></thead>
      <tbody>${claimRow(0)}${claimRow(1)}</tbody>
    </table>`;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Tableau de sinistres (une ligne par sinistre)', () => {
  it('lit le titre de colonne et le rang de la ligne', () => {
    mountOyat();
    const fields = analyzeForm(document).fields;
    const type2 = fields.find(f => f.name === 'sinistres[1].type')!;
    expect(type2).toMatchObject({ label: 'Type de sinistre', row: 2 });
    expect(fields.find(f => f.name === 'sinistres[0].resp')).toMatchObject({ kind: 'radio', label: 'Responsabilité', row: 1 });
    expect(fields.find(f => f.name === 'sinistres[0].jj')).toMatchObject({ inputType: 'split-dmy', label: 'Date', row: 1 });
    expect(fields.find(f => f.name === 'nb')?.row).toBeUndefined();
  });

  it('associe la ligne n au sinistre n, et le coût à rien', () => {
    mountOyat();
    const { fields } = analyzeForm(document);
    const byName = new Map(mapFields(fields).map(m => [fields.find(f => f.key === m.fieldKey)!.name, m.canonicalPath]));
    expect(byName.get('sinistres[0].type')).toBe('insuranceHistory.claims.1.type');
    expect(byName.get('sinistres[0].resp')).toBe('insuranceHistory.claims.1.responsibility');
    expect(byName.get('sinistres[0].jj')).toBe('insuranceHistory.claims.1.date');
    expect(byName.get('sinistres[1].type')).toBe('insuranceHistory.claims.2.type');
    expect(byName.get('sinistres[0].cout')).toBeNull();
    expect(byName.get('nb')).toBe('insuranceHistory.claimsCount');
  });

  it('un dossier avec 1 sinistre remplit la première ligne (type, %, date)', async () => {
    mountOyat();
    const data: CanonicalData = {
      'insuranceHistory.claims.1.type': 'bris_de_glace',
      'insuranceHistory.claims.1.responsibility': '50',
      'insuranceHistory.claims.1.date': '2024-03-07',
    };
    const { fields, elements } = analyzeForm(document);
    for (const mapping of mapFields(fields)) {
      const value = mapping.canonicalPath ? data[mapping.canonicalPath] : undefined;
      if (value === undefined || value === null || typeof value === 'object') continue;
      const field = fields.find(f => f.key === mapping.fieldKey)!;
      expect((await fillField(field, elements.get(field.key)!, value)).status, field.label).toBe('filled');
    }
    const input = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    expect(document.querySelector<HTMLSelectElement>('[name="sinistres[0].type"]')!.value).toBe('BDG');
    expect(document.querySelector<HTMLInputElement>('[name="sinistres[0].resp"]:checked')?.value).toBe('R50');
    expect([input('sinistres[0].jj').value, input('sinistres[0].mm').value, input('sinistres[0].aaaa').value]).toEqual(['07', '03', '2024']);
    // La deuxième ligne reste vide : aucun sinistre inventé.
    expect(document.querySelector<HTMLSelectElement>('[name="sinistres[1].type"]')!.value).toBe('');
  });
});
