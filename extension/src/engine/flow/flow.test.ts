import { afterEach, describe, expect, it } from 'vitest';
import type { FormField } from '../analyzer';
import { genericAdapter } from '../extranets';
import { AdvanceGuard } from './advance';
import { ClaimRows, declaredClaims } from './claim-rows';

afterEach(() => {
  document.body.innerHTML = '';
});

const ADD = '<div><span>Ajouter un sinistre</span><svg></svg></div>';
const row = (n: number) => ({ row: n }) as FormField;

describe('ClaimRows', () => {
  it('une ligne par sinistre déclaré, une seule demande par ligne', () => {
    document.body.innerHTML = ADD;
    const rows = new ClaimRows(genericAdapter);
    const data = { 'insuranceHistory.claimsCount': 2 };
    expect(rows.nextAddButton(document, [], data)).not.toBeNull();
    // Le clic n'a rien ajouté : pas de nouvelle demande.
    expect(rows.nextAddButton(document, [], data)).toBeNull();
    expect(rows.nextAddButton(document, [row(1)], data)).not.toBeNull();
    expect(rows.nextAddButton(document, [row(1), row(2)], data)).toBeNull();
    rows.reset();
    expect(rows.nextAddButton(document, [], data)).not.toBeNull();
  });

  it('sans sinistre déclaré : rien à ajouter, la page n’attend pas de sinistre', () => {
    document.body.innerHTML = ADD;
    const rows = new ClaimRows(genericAdapter);
    expect(rows.nextAddButton(document, [], { 'insuranceHistory.claimsCount': 0 })).toBeNull();
    expect(rows.awaitsClaims(document, {})).toBe(false);
  });

  it('le mot « sinistre » sans bouton d’ajout (volet Synthèse) n’est pas un tableau de sinistres', () => {
    document.body.innerHTML = '<p>Sinistralité : 1 sinistre(s) corporel responsable(s)</p>';
    expect(new ClaimRows(genericAdapter).awaitsClaims(document, { 'insuranceHistory.claimsCount': 1 })).toBe(false);
  });

  it('declaredClaims plafonne à 6', () => {
    expect(declaredClaims({ 'insuranceHistory.claimsCount': 9 })).toBe(6);
  });
});

describe('AdvanceGuard', () => {
  it('un essai par étape, de nouveau après une nouvelle étape', () => {
    const guard = new AdvanceGuard();
    expect(guard.firstTry('a')).toBe(true);
    expect(guard.firstTry('a')).toBe(false);
    guard.reset();
    expect(guard.firstTry('a')).toBe(true);
  });
});
