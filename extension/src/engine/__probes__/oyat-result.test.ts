import { describe, expect, it } from 'vitest';
import { detectResultPage, extractFromDom } from '../capture';

/** Page de tarif Oyat : titre « Devis automobile… », tarifs dans un tableau, choix du pack et frais encore modifiables. */
describe('page de tarif sans titre « Votre tarif » (Oyat)', () => {
  it('est reconnue comme résultat grâce à l’en-tête du tableau de prix', () => {
    document.body.innerHTML = `
      <h1>Devis automobile Hors Normes / Sinistre</h1>
      <p>Tarif / DALT@2399463 - LAABIDI Helmi</p>
      <table>
        <tr><th colspan="4">Tarifs Formules (euros)</th></tr>
        <tr><th>Formule</th><th>/ an</th><th>/ semestre</th><th>/ mois</th></tr>
        <tr><td>F1</td><td>1835</td><td>976</td><td>161</td></tr>
        <tr><td>F2</td><td>3660</td><td>1908</td><td>313</td></tr>
      </table>
      <label><input type="radio" name="pack" checked> Confort</label>
      <label>Frais de souscription <input type="text" value="0"></label>`;
    const extraction = extractFromDom(document);
    expect(extraction.resultHeading).toBe(true);
    expect(detectResultPage(extraction, 0)).not.toBe('none');
  });
});
