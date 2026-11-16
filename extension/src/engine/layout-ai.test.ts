import { describe, expect, it, vi } from 'vitest';
import { analyzeForm } from './analyzer';
import { fillField } from './filler';
import { applyLayout, buildLayoutRequest, needsLayoutReading, parseLayoutResponse, readLayoutWithAi } from './layout-ai';

/**
 * Mise en page qu'aucune règle ne lit : options sans <label> dont le texte est loin du bouton (cellules de tableau),
 * date en trois cases sans maxlength ni nom parlant.
 */
const UNSEEN = `
  <table>
    <tr><td>Civilité</td><td><input type="radio" name="oSexe" value="H"></td><td><span>Monsieur</span></td>
        <td><input type="radio" name="oSexe" value="F"></td><td><span>Madame</span></td></tr>
    <tr><td>Né(e) le</td><td><input type="text" name="oD1" /><input type="text" name="oD2" /><input type="text" name="oD3" /></td></tr>
  </table>`;

const setup = () => {
  document.body.innerHTML = UNSEEN;
  return analyzeForm(document);
};

const AI_ANSWER = JSON.stringify({
  labels: { 'radio:osexe': 'Civilité', 'text:od1': 'Date de naissance' },
  options: { 'radio:osexe': [{ value: 'H', label: 'Monsieur' }, { value: 'F', label: 'Madame' }] },
  groups: [{ keys: ['text:od1', 'text:od2', 'text:od3'], type: 'date_dmy' }],
});

describe('Lecture de la mise en page par l’IA', () => {
  it('se déclenche sur un formulaire mal lu par les règles, pas sur un formulaire propre', () => {
    expect(needsLayoutReading(setup())).toBe(true);
    document.body.innerHTML = '<label for="n">Nom</label><input id="n" name="nom" /><label for="v">Ville</label><input id="v" name="ville" />';
    expect(needsLayoutReading(analyzeForm(document))).toBe(false);
  });

  it('corrige les options, le libellé et regroupe les trois cases en une date', async () => {
    const analysis = setup();
    const refined = applyLayout(analysis, parseLayoutResponse(AI_ANSWER, analysis));

    const civilite = refined.fields.find(f => f.key === 'radio:osexe')!;
    expect(civilite.label).toBe('Civilité');
    expect(civilite.options.map(o => o.label)).toEqual(['Monsieur', 'Madame']);
    const date = refined.fields.find(f => f.key === 'text:od1')!;
    expect(date).toMatchObject({ kind: 'date', inputType: 'split-dmy', label: 'Date de naissance' });
    expect(refined.fields).toHaveLength(2);
    expect(refined.fingerprint).toBe(analysis.fingerprint);

    expect((await fillField(date, refined.elements.get(date.key)!, '1985-10-16')).status).toBe('filled');
    expect([...document.querySelectorAll<HTMLInputElement>('input[type=text]')].map(i => i.value)).toEqual(['16', '10', '1985']);
  });

  it('ne croit pas l’IA sur parole : clé inconnue, valeur inventée, groupe impossible', () => {
    const analysis = setup();
    const layout = parseLayoutResponse(
      JSON.stringify({
        labels: { 'radio:inconnu': 'X', 'radio:osexe': '' },
        options: { 'radio:osexe': [{ value: 'Z', label: 'Inventé' }] },
        groups: [
          { keys: ['text:od1', 'text:od3'], type: 'date_dmy' }, // cases non consécutives
          { keys: ['radio:osexe', 'text:od1', 'text:od2'], type: 'date_dmy' }, // pas que des cases de texte
          { keys: ['text:od1', 'text:od2', 'text:od3'], type: 'segments' }, // découpage sans taille connue
        ],
      }),
      analysis,
    );
    expect(layout).toEqual({ labels: {}, options: {}, groups: [] });
    expect(parseLayoutResponse('pas du JSON', analysis)).toEqual({ labels: {}, options: {}, groups: [] });
  });

  it('n’envoie aucune donnée client, même si la page en affiche près d’un champ', () => {
    document.body.innerHTML = `${UNSEEN}<p>Dossier de LAABIDI <input type="text" name="ref" /> 06 12 34 56 78</p>`;
    const request = buildLayoutRequest(analyzeForm(document), { 'client.lastName': 'LAABIDI' });
    const content = request.messages[0].content;
    expect(request.purpose).toBe('layout');
    expect(content).not.toMatch(/LAABIDI|06 12 34/);
    expect(content).toContain('Monsieur'); // le texte des options, lui, est bien envoyé
  });

  it('une panne de l’IA laisse l’analyse telle quelle', async () => {
    const analysis = setup();
    const { layout, used } = await readLayoutWithAi(analysis, vi.fn().mockRejectedValue(new Error('quota')));
    expect(used).toBe(false);
    expect(applyLayout(analysis, layout)).toBe(analysis);
  });
});
