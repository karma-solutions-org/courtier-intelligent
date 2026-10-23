import { afterEach, describe, expect, it } from 'vitest';
import { genericAdapter } from '../generic';
import { zephirAdapter } from './adapter';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Zephir', () => {
  it('« Ajouter un sinistre » : sélecteur direct .btnAjoutTable, clique l’icône ⊕', () => {
    document.body.innerHTML = `<div class="btnAjoutTable"><span style="margin-right: 5px;">Ajouter un sinistre</span>
      <svg class="fa-circle-plus" role="img"><path></path></svg></div>`;
    expect(zephirAdapter.findAddRowButton(document, 'claims')?.tagName.toLowerCase()).toBe('svg');
  });

  it('groupe Material « ng-invalid » : champ obligatoire', () => {
    document.body.innerHTML = `<mat-button-toggle-group class="ng-invalid"><button aria-pressed="false">Oui</button></mat-button-toggle-group>
      <mat-button-toggle-group class="ng-valid"><button aria-pressed="true">Non</button></mat-button-toggle-group>`;
    const [invalid, valid] = [...document.querySelectorAll('button')];
    expect(zephirAdapter.isRequired(invalid)).toBe(true);
    expect(zephirAdapter.isRequired(valid)).toBe(false);
    expect(genericAdapter.isRequired(invalid)).toBe(false);
  });
});
