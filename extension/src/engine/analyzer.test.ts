import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeForm } from './analyzer';
import { mountAssureurA } from './__fixtures__/assureur-a';

describe('analyzeForm : extranet de l’assureur A, étape 1', () => {
  beforeEach(() => {
    mountAssureurA(document);
  });

  const analysis = () => analyzeForm(document);
  const field = (label: RegExp) => analysis().fields.find(f => label.test(f.label))!;

  it('trouve les champs saisissables avec leur libellé, nettoyé de l’astérisque', () => {
    const labels = analysis().fields.map(f => f.label);

    expect(labels).toEqual([
      'Civilité',
      'Nom',
      'Prénom',
      'Date de naissance',
      'Adresse e-mail',
      'Confirmez votre e-mail',
      'Téléphone mobile',
      'Adresse',
      'Code postal',
      'Ville',
    ]);
  });

  it('ignore les mots de passe, les champs cachés et les champs invisibles (pièges anti-robot)', () => {
    const names = analysis().fields.map(f => f.name);

    expect(names).not.toContain('mdp');
    expect(names).not.toContain('csrf');
    expect(names).not.toContain('piege');
  });

  it('lit le libellé par `for`, par `<label>` englobant et par aria-label', () => {
    expect(field(/^Nom$/).id).toBe('nom'); // <label for>
    expect(field(/^Prénom$/).name).toBe('prenom'); // <label> englobant
    document.body.insertAdjacentHTML('beforeend', '<input name="x" aria-label="Pays de résidence" />');
    expect(analysis().fields.at(-1)!.label).toBe('Pays de résidence');
  });

  it('lit le libellé indiqué par aria-labelledby', () => {
    document.body.insertAdjacentHTML('beforeend', '<span id="l1">Numéro</span> <span id="l2">de contrat</span><input name="c" aria-labelledby="l1 l2" />');
    expect(analysis().fields.at(-1)!.label).toBe('Numéro de contrat');
  });

  it('repère les champs obligatoires (astérisque ou attribut required)', () => {
    expect(field(/^Nom$/).required).toBe(true);
    expect(field(/^Adresse$/).required).toBe(false);
    expect(field(/Téléphone/).required).toBe(false);
    expect(field(/Code postal/).required).toBe(true);
  });

  it('détermine le type de chaque champ', () => {
    expect(field(/^Nom$/)).toMatchObject({ kind: 'text', inputType: 'text' });
    expect(field(/e-mail$/)).toMatchObject({ kind: 'text', inputType: 'email' });
    expect(field(/Téléphone/)).toMatchObject({ kind: 'text', inputType: 'tel' });
    expect(field(/Ville/).kind).toBe('autocomplete');
  });

  it('regroupe les boutons radio en UN champ, avec la légende pour libellé et les options', () => {
    const civilite = field(/Civilité/);

    expect(civilite).toMatchObject({ kind: 'radio', key: expect.stringContaining('civilite') });
    expect(civilite.options).toEqual([
      { value: 'mme', label: 'Mme' },
      { value: 'm', label: 'M.' },
    ]);
    expect(analysis().elements.get(civilite.key)).toHaveLength(2);
  });

  it('retient les attributs utiles au mapping : autocomplete, placeholder, longueur maximale', () => {
    expect(field(/^Nom$/).autocomplete).toBe('family-name');
    expect(field(/naissance/i).placeholder).toBe('JJ/MM/AAAA');
    expect(field(/Code postal/).maxLength).toBe(5);
  });

  it('donne à chaque champ une clé unique et un ordre', () => {
    const { fields } = analysis();

    expect(new Set(fields.map(f => f.key)).size).toBe(fields.length);
    expect(fields.map(f => f.order)).toEqual(fields.map((_, index) => index));
  });

  it('rattache chaque champ à sa section (dernier titre qui précède)', () => {
    expect(field(/^Nom$/).section).toBe('Vos informations');
    expect(field(/Ville/).section).toBe('Vos informations');
  });
});

describe('analyzeForm : autres étapes', () => {
  it('étape 2 : select avec ses options (sans l’invite « Choisir »), date, nombre, groupe radio sous sa légende', () => {
    const ax = mountAssureurA(document);
    ax.next();
    return new Promise<void>(resolve =>
      setTimeout(() => {
        const { fields } = analyzeForm(document);
        const byLabel = (label: RegExp) => fields.find(f => label.test(f.label))!;

        expect(byLabel(/Marque/)).toMatchObject({ kind: 'select', required: true });
        expect(byLabel(/Marque/).options.map(o => o.label)).toEqual(['Renault', 'Peugeot', 'Citroën']);
        expect(byLabel(/mise en circulation/)).toMatchObject({ kind: 'date', inputType: 'date' });
        expect(byLabel(/Puissance fiscale/)).toMatchObject({ kind: 'number' });
        expect(byLabel(/Usage/)).toMatchObject({ kind: 'radio', section: 'Usage du véhicule' });
        expect(byLabel(/Usage/).options.map(o => o.label)).toEqual(['Privé', 'Privé et trajet domicile-travail', 'Professionnel']);
        expect(byLabel(/Marque/).section).toBe('Votre véhicule');
        resolve();
      }, 80),
    );
  });
});

describe('Empreinte du formulaire', () => {
  it('ne dépend pas des valeurs saisies', () => {
    mountAssureurA(document);
    const before = analyzeForm(document).fingerprint;

    (document.getElementById('nom') as HTMLInputElement).value = 'Dupont';
    (document.getElementById('email') as HTMLInputElement).value = 'jean@example.fr';

    expect(analyzeForm(document).fingerprint).toBe(before);
    expect(before).toMatch(/^v1:[0-9a-f]{14}$/);
  });

  it('change quand le formulaire change (nouvelle étape, champ ajouté, libellé modifié)', () => {
    mountAssureurA(document);
    const step1 = analyzeForm(document).fingerprint;

    document.getElementById('content')!.insertAdjacentHTML('beforeend', '<label for="n">Nouveau</label><input id="n" name="n" />');
    const withNewField = analyzeForm(document).fingerprint;
    document.querySelector('label[for="nom"]')!.textContent = 'Nom de famille *';
    const relabelled = analyzeForm(document).fingerprint;

    expect(new Set([step1, withNewField, relabelled]).size).toBe(3);
  });

  it('ne contient aucune donnée du formulaire (structure seulement)', () => {
    mountAssureurA(document);
    (document.getElementById('nom') as HTMLInputElement).value = 'SecretDupont';
    const serialized = JSON.stringify(analyzeForm(document).fields);

    expect(serialized).not.toContain('SecretDupont');
  });
});
