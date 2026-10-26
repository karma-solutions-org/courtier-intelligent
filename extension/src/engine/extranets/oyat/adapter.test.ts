import { describe, expect, it } from 'vitest';
import { oyatAdapter } from './adapter';

const STAR = '<img src="https://extranet.oyat-assurances.fr/ressources/images/asterisque.gif">';

describe('oyatAdapter.isRequired', () => {
  it('image asterisque.gif dans le label de la ligne : obligatoire', () => {
    document.body.innerHTML = `<div class="ligne"><label for="oNom">Nom :${STAR}</label><div><input id="oNom"></div></div>`;
    expect(oyatAdapter.isRequired(document.getElementById('oNom')!)).toBe(true);
  });

  it('sans image : facultatif', () => {
    document.body.innerHTML = '<div class="ligne"><label for="oAdresse1">Adresse :</label><div><input id="oAdresse1"></div></div>';
    expect(oyatAdapter.isRequired(document.getElementById('oAdresse1')!)).toBe(false);
  });

  it('« Je ne la connais pas » à côté de l’immatriculation obligatoire : option, pas une question obligatoire', () => {
    document.body.innerHTML = `<div class="ligne"><label for="oImmat">Immatriculation :${STAR}</label>
      <div><input id="oImmat" type="text"> <input id="inconnue" type="checkbox"> Je ne la connais pas</div></div>`;
    expect(oyatAdapter.isRequired(document.getElementById('oImmat')!)).toBe(true);
    expect(oyatAdapter.isRequired(document.getElementById('inconnue')!)).toBe(false);
  });
});
