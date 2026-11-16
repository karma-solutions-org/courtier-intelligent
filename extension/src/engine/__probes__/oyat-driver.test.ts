import { describe, expect, it } from 'vitest';
import { analyzeForm } from '../analyzer';
import { fillField } from '../filler';
import { mapFields } from '../mapping';
import { planFill } from '../plan';

/** Bloc « Conducteur 1 » d'Oyat : tableau « libellé | champ », boutons Oui / Non dans la cellule de droite. */
describe('Oyat : conducteur 1', () => {
  it('remplit pays de naissance, pays du permis et la question de résiliation', async () => {
    document.body.innerHTML = `
      <form><h2>Conducteur 1</h2><table>
        <tr><td>Pays de naissance : <span>*</span></td><td><select name="cond1_pays_naiss"><option value="">Choisissez</option><option value="99">FRANCE</option><option value="351">TUNISIE</option></select></td></tr>
        <tr><td>Pays d'obtention du permis : *</td><td><select name="cond1_pays_permis"><option value="">Choisissez</option><option value="99">FRANCE</option><option value="351">TUNISIE</option></select></td></tr>
        <tr><td>Avez-vous été résilié par un précédent assureur depuis Octobre 2023 ? *</td><td><label><input type="radio" name="resil" value="O"> Oui</label><label><input type="radio" name="resil" value="N"> Non</label></td></tr>
      </table></form>`;
    const { fields, elements } = analyzeForm(document);
    const plan = planFill(fields, mapFields(fields), {
      'driver.birthCountry': 'Tunisie',
      'driver.licenseCountry': 'France',
      'insuranceHistory.wasTerminated': false,
    } as never);
    for (const instruction of plan.instructions) await fillField(instruction.field, elements.get(instruction.field.key) ?? [], instruction.value);

    expect((document.querySelector('[name="cond1_pays_naiss"]') as HTMLSelectElement).value).toBe('351');
    expect((document.querySelector('[name="cond1_pays_permis"]') as HTMLSelectElement).value).toBe('99');
    expect((document.querySelector('[name="resil"][value="N"]') as HTMLInputElement).checked).toBe(true);
  });
});
