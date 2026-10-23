import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeForm, isAuthPage } from './analyzer';
import { mountAssureurA } from './__fixtures__/assureur-a';
import { zephirAdapter } from './extranets/zephir/adapter';

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

describe('isAuthPage : jamais de remplissage sur une page de connexion', () => {
  it('formulaire identifiant + mot de passe', () => {
    document.body.innerHTML = '<form><input name="user" /><input type="password" name="pwd" /><button>Valider</button></form>';
    expect(isAuthPage(document)).toBe(true);
  });

  it('formulaire « connexion » sans mot de passe visible (étape identifiant seul)', () => {
    document.body.innerHTML = '<form id="login-form"><input name="email" /><button>Continuer</button></form>';
    expect(isAuthPage(document)).toBe(true);
    document.body.innerHTML = '<form><input name="email" /><button>Se connecter</button></form>';
    expect(isAuthPage(document)).toBe(true);
  });

  it('un questionnaire qui demande de créer un mot de passe n’est pas une page de connexion', () => {
    mountAssureurA(document);
    expect(isAuthPage(document)).toBe(false);
  });
});

describe('analyzeForm : les champs de recherche du site sont ignorés', () => {
  it('type search, zone role=search, nom « q » ou « recherche »', () => {
    document.body.innerHTML = `
      <div role="search"><input name="s" aria-label="Chercher" /></div>
      <input type="search" name="x" />
      <input name="q" />
      <input name="recherche" placeholder="Rechercher" />
      <label for="nom">Nom</label><input id="nom" name="nom" />`;
    expect(analyzeForm(document).fields.map(f => f.name)).toEqual(['nom']);
  });
});

describe('Champ obligatoire sans astérisque (Angular, Zephir)', () => {
  it('un contrôle « ng-invalid » est obligatoire, un contrôle valide non', () => {
    document.body.innerHTML = `<label for="u">Usage</label><select id="u" name="usage" formcontrolname="usage" class="ng-invalid"><option value="">--</option><option value="1">Privé</option></select>
      <label for="c">Commentaire</label><input id="c" name="commentaire" class="ng-valid" />`;
    const { fields } = analyzeForm(document);
    expect(fields.find(f => f.label === 'Usage')?.required).toBe(true);
    expect(fields.find(f => f.label === 'Commentaire')?.required).toBe(false);
  });
});

describe('Boutons bascule Oui / Non (Zephir, mat-button-toggle)', () => {
  it('un groupe de boutons aria-pressed est une question à choix, titrée par le texte qui le précède', () => {
    document.body.innerHTML = `<div><span>Garage</span><mat-button-toggle-group formcontrolname="garage" class="ng-invalid" role="group">
      <mat-button-toggle><button type="button" aria-pressed="false">Oui</button></mat-button-toggle>
      <mat-button-toggle><button type="button" aria-pressed="false">Non</button></mat-button-toggle></mat-button-toggle-group></div>`;
    const { fields } = analyzeForm(document);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ label: 'Garage', kind: 'radio', required: true });
    expect(fields[0].options.map(o => o.label)).toEqual(['Oui', 'Non']);
  });

  it('Zephir, formulaire ngModel sans formcontrolname : le groupe « ng-invalid » rend la question obligatoire', () => {
    document.body.innerHTML = `<div><p>Le véhicule est-il utilisé pour le transport de matières dangereuses ?</p>
      <mat-button-toggle-group name="matDang" class="ng-untouched ng-pristine ng-invalid" role="group">
      <mat-button-toggle><button type="button" aria-pressed="false">Oui</button></mat-button-toggle>
      <mat-button-toggle><button type="button" aria-pressed="false">Non</button></mat-button-toggle></mat-button-toggle-group></div>`;
    expect(analyzeForm(document, zephirAdapter).fields[0]).toMatchObject({ kind: 'radio', required: true });
    // Règle propre à Zephir : sans son adaptateur, le groupe n'est pas lu comme obligatoire.
    expect(analyzeForm(document).fields[0].required).toBe(false);
  });
});

describe('Zephir : libellé d’un groupe Oui / Non rangé dans son propre bloc', () => {
  it('lit la question dans le <label> qui précède le bloc du groupe (pas le nom technique AUTO03)', () => {
    document.body.innerHTML = `<div class="form-input"><label><span>Le véhicule est-il utilisé pour le transport de matières dangereuses ?</span></label>
      <div class="form-input"><mat-button-toggle-group role="group" required="" class="ng-invalid">
        <mat-button-toggle value="true"><button type="button" aria-pressed="false" name="AUTO03"><span><span>Oui</span></span></button></mat-button-toggle>
        <mat-button-toggle value="false"><button type="button" aria-pressed="false" name="AUTO03"><span><span>Non</span></span></button></mat-button-toggle>
      </mat-button-toggle-group><app-control-error></app-control-error></div></div>`;
    const [field] = analyzeForm(document, zephirAdapter).fields;
    expect(field).toMatchObject({ label: 'Le véhicule est-il utilisé pour le transport de matières dangereuses ?', required: true });
  });
});

describe('Zephir : libellé d’une liste à côté d’un bloc de boutons bascule', () => {
  it('ne prend pas « Remorque / Caravane » et ses boutons comme libellé de la liste voisine', () => {
    document.body.innerHTML = `<div><div><span>Remorque / Caravane :</span>
      <mat-button-toggle-group role="group"><button type="button" aria-pressed="true">- de 750kg</button><button type="button" aria-pressed="false">+ de 750kg</button></mat-button-toggle-group></div>
      <div><select name="csp"><option>Salarié non sédentaire</option><option>Artisan sédentaire</option></select></div></div>`;
    const select = analyzeForm(document).fields.find(f => f.kind === 'select');
    expect(select?.label ?? '').not.toContain('Remorque');
  });
});
