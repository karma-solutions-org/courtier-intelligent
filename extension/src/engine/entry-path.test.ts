import { matchesUrlPattern, sanitizeEntry, sanitizeNavAction, urlPatternOf } from '@shared';
import { afterEach, describe, expect, it } from 'vitest';
import { describeClick, findActionTarget } from './entry-path';

const URL = 'https://zeole.zephir.fr/accueil';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('urlPatternOf', () => {
  it('garde le chemin sans paramètres, numéros remplacés par *', () => {
    expect(urlPatternOf('https://x.fr/devis/12345/etape?client=Dupont#top')).toBe('/devis/*/etape');
    expect(matchesUrlPattern('https://x.fr/devis/999/etape', '/devis/*/etape')).toBe(true);
    expect(matchesUrlPattern('https://x.fr/accueil', '/devis/*/etape')).toBe(false);
  });
});

describe('sanitizeNavAction', () => {
  it('refuse les boutons qui engagent le client', () => {
    expect(sanitizeNavAction({ label: 'Souscrire le contrat', selector: null, urlPattern: '/x' })).toBeNull();
    expect(sanitizeNavAction({ label: 'Payer', selector: null, urlPattern: '/x' })).toBeNull();
    for (const label of ['Valider', 'Valider le devis', 'Confirmer', 'Envoyer', 'Émettre le contrat', "J'accepte", 'Adhérer', 'Finaliser']) {
      expect(sanitizeNavAction({ label, selector: null, urlPattern: '/x' })).toBeNull();
    }
    expect(sanitizeNavAction({ label: 'Nouveau devis', selector: null, urlPattern: '/x' })).not.toBeNull();
    expect(sanitizeNavAction({ label: 'Tarificateur', selector: '#menu', urlPattern: '/accueil' })).toEqual({
      label: 'Tarificateur',
      selector: '#menu',
      urlPattern: '/accueil',
    });
  });

  it('refuse un chemin vide', () => {
    expect(sanitizeEntry([])).toBeNull();
  });
});

describe('describeClick', () => {
  it('décrit un clic sur un lien de menu (texte, position, page)', () => {
    document.body.innerHTML = `<nav id="menu"><a href="/tarif"><span>Tarificateur</span></a><a href="/porte">Portefeuille</a></nav>`;
    const span = document.querySelector('span')!;
    expect(describeClick(span, URL)).toEqual({ label: 'Tarificateur', selector: '#menu > a:nth-of-type(1)', urlPattern: '/accueil' });
  });

  it('ignore un clic dans un champ ou sur du texte', () => {
    document.body.innerHTML = `<p>Bienvenue</p><input id="q" />`;
    expect(describeClick(document.querySelector('p'), URL)).toBeNull();
    expect(describeClick(document.getElementById('q'), URL)).toBeNull();
  });
});

describe('findActionTarget', () => {
  it('retrouve l’élément par son texte, le plus profond', () => {
    document.body.innerHTML = `<ul><li role="menuitem"><a href="/auto">Auto</a></li></ul>`;
    expect(findActionTarget(document, { label: 'Auto', selector: null, urlPattern: null })).toBe(document.querySelector('a'));
  });

  it('départage deux éléments de même texte par la position enregistrée, sinon ne clique pas', () => {
    document.body.innerHTML = `<div id="a"><button>Nouveau devis</button></div><div id="b"><button>Nouveau devis</button></div>`;
    expect(findActionTarget(document, { label: 'Nouveau devis', selector: '#b > button', urlPattern: null })).toBe(document.querySelector('#b button'));
    expect(findActionTarget(document, { label: 'Nouveau devis', selector: null, urlPattern: null })).toBeNull();
  });

  it('ignore un élément masqué', () => {
    document.body.innerHTML = `<div hidden><a href="/x">Auto</a></div>`;
    expect(findActionTarget(document, { label: 'Auto', selector: null, urlPattern: null })).toBeNull();
  });
});
