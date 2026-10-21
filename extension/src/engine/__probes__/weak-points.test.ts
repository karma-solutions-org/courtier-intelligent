// Sondes : chaque test décrit le comportement ATTENDU sur un extranet réel. Un test rouge = faiblesse confirmée.
import { describe, expect, it } from 'vitest';
import { analyzeForm } from '../analyzer';
import { fillField, matchOption } from '../filler';

const setup = (html: string) => {
  document.body.innerHTML = html;
  return analyzeForm(document);
};
const fieldBy = (a: ReturnType<typeof analyzeForm>, pred: (f: any) => boolean) => a.fields.find(pred)!;

describe('probes: analyse', () => {
  it('P1 shadow DOM inputs are found', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const root = document.getElementById('host')!.attachShadow({ mode: 'open' });
    root.innerHTML = '<label for="n">Nom</label><input id="n" name="nom">';
    expect(analyzeForm(document).fields.length).toBe(1);
  });

  it('P2 floating label placed AFTER the input (Material) is used', () => {
    const a = setup('<div class="mat"><input name="f_123"><label>Nom</label></div>');
    expect(a.fields[0].label).toBe('Nom');
  });

  it('P3 button-styled radios (input display:none + visible label) are analysed', () => {
    const a = setup(`<p>Usage</p>
      <input type="radio" id="r1" name="usage" value="P" style="display:none"><label for="r1">Privé</label>
      <input type="radio" id="r2" name="usage" value="T" style="display:none"><label for="r2">Trajet</label>`);
    expect(a.fields.filter(f => f.kind === 'radio').length).toBe(1);
  });

  it('P4 date of birth in three <select> (jour/mois/année) becomes one date field', () => {
    const opts = (n: number, s = 1) => Array.from({ length: n }, (_, i) => `<option value="${i + s}">${i + s}</option>`).join('');
    const a = setup(`<label>Date de naissance</label><div>
      <select name="naiss_jour"><option value="">JJ</option>${opts(31)}</select>
      <select name="naiss_mois"><option value="">MM</option>${opts(12)}</select>
      <select name="naiss_annee"><option value="">AAAA</option>${opts(80, 1940)}</select></div>`);
    expect(a.fields.some(f => f.kind === 'date')).toBe(true);
  });

  it('P5 two "Nom" fields in different sections get distinct, section-qualified keys/labels', () => {
    const a = setup(`<h2>Souscripteur</h2><label for="a">Nom</label><input id="a">
      <h2>Conducteur</h2><label for="b">Nom</label><input id="b">`);
    expect(a.fields[0].section).not.toBe(a.fields[1].section);
  });

  it('P6 radios without form id in two separate forms are NOT merged into one group', () => {
    const a = setup(`<form><input type="radio" name="sexe" value="H"><input type="radio" name="sexe" value="F"></form>
      <form><input type="radio" name="sexe" value="H"><input type="radio" name="sexe" value="F"></form>`);
    expect(a.fields.filter(f => f.kind === 'radio').length).toBe(2);
  });
});

describe('probes: options', () => {
  it('P7 boolean true matches "Oui, au moins un"', () => {
    expect(matchOption([{ value: 'A', label: 'Oui, au moins un' }, { value: 'B', label: 'Non' }], true)?.value).toBe('A');
  });

  it('P8 number 2 matches label "2 sinistres", not the option whose internal code is "2"', () => {
    const o = [{ value: '1', label: 'Aucun' }, { value: '2', label: '1 sinistre' }, { value: '3', label: '2 sinistres' }];
    expect(matchOption(o, 2)?.label).toBe('2 sinistres');
  });

  it('P9 number 15000 matches option "15 000 €"', () => {
    const o = [{ value: 'a', label: '10 000 €' }, { value: 'b', label: '15 000 €' }];
    expect(matchOption(o, 15000)?.value).toBe('b');
  });

  it('P10 "OUI" with code values matches', () => {
    expect(matchOption([{ value: 'Y', label: 'OUI' }, { value: 'N', label: 'NON' }], 'oui')?.value).toBe('Y');
  });
});

describe('probes: fill', () => {
  it('P11 masked phone input reformatting "0612345678" -> "06 12 34 56 78" is accepted', async () => {
    const a = setup('<label for="t">Téléphone</label><input id="t" name="tel">');
    const el = document.getElementById('t') as HTMLInputElement;
    el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').replace(/(\d{2})(?=\d)/g, '$1 '); });
    const r = await fillField(a.fields[0], a.elements.get(a.fields[0].key)!, '0612345678');
    expect(r.status).toBe('filled');
  });

  it('P12 number field receives "12 000" / "1,5" (FR formatting)', async () => {
    const a = setup('<label for="v">Valeur</label><input id="v" type="number">');
    const r = await fillField(a.fields[0], a.elements.get(a.fields[0].key)!, '12 000');
    expect(r.status).toBe('filled');
  });

  it('P13 dependent select still holding the PREVIOUS parent options waits for the reload', async () => {
    const a = setup(`<label for="m">Modèle</label><select id="m"><option value="">--</option>
      <option value="1">Clio</option><option value="2">Megane</option><option value="3">Captur</option></select>`);
    const el = document.getElementById('m') as HTMLSelectElement;
    setTimeout(() => { el.innerHTML = '<option value="">--</option><option value="9">208</option><option value="10">308</option><option value="11">3008</option>'; }, 150);
    const r = await fillField(a.fields[0], a.elements.get(a.fields[0].key)!, '308', { listTimeoutMs: 800 });
    expect(r.status).toBe('filled');
  });

  it('P14 autocomplete with no matching suggestion is NOT reported as filled', async () => {
    const a = setup('<label for="c">Ville</label><input id="c" role="combobox" aria-controls="lb"><ul id="lb" role="listbox"></ul>');
    const r = await fillField(a.fields[0], a.elements.get(a.fields[0].key)!, 'Marseille', { suggestionTimeoutMs: 100 });
    expect(r.status).toBe('failed');
  });

  it('P15 SPA re-render replacing the input after analysis is recovered', async () => {
    const a = setup('<div id="w"><label for="n">Nom</label><input id="n" name="nom"></div>');
    document.getElementById('w')!.innerHTML = '<label for="n">Nom</label><input id="n" name="nom">';
    const r = await fillField(a.fields[0], a.elements.get(a.fields[0].key)!, 'Dupont');
    expect(r.status).toBe('filled');
  });

  it('P16 readonly input (datepicker) is not reported filled while ignoring typing', async () => {
    const a = setup('<label for="d">Date d\'effet</label><input id="d" readonly placeholder="jj/mm/aaaa">');
    expect(a.fields.length).toBe(0); // readonly fields should be excluded or handled specially
  });

  it('P17 offscreen honeypot / visually hidden input (left:-9999px, opacity 0) is skipped', () => {
    const a = setup('<label for="h">Nom</label><input id="h" style="position:absolute;left:-9999px;opacity:0">');
    expect(a.fields.length).toBe(0);
  });
});
