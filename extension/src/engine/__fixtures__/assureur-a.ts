/**
 * Extranet de l'« assureur A » simulé : parcours en 3 étapes avec les types de champs d'un vrai extranet
 * (libellés `for`, libellés englobants, `aria-label`, groupes radio, select, date en texte et en `type=date`,
 * saisie assistée, champ qui apparaît sous une réponse, indicateur « Étape x sur y »).
 *
 * L'accès à l'extranet réel n'est pas encore disponible : ce simulacre sert de référence aux tests.
 */

export interface AssureurAOptions {
  /** Remplace « Téléphone » par un libellé que les synonymes ne reconnaissent pas (test du repli sur l'IA). */
  obscurePhoneLabel?: boolean;
  /** Affiche l'indicateur « Étape x sur y » (sinon l'étape se déduit des champs). */
  stepIndicator?: boolean;
}

const STEP_1 = (obscurePhone: boolean) => `
  <h2>Vos informations</h2>
  <fieldset>
    <legend>Civilité</legend>
    <label><input type="radio" name="civilite" value="mme" /> Mme</label>
    <label><input type="radio" name="civilite" value="m" /> M.</label>
  </fieldset>
  <div><label for="nom">Nom *</label><input id="nom" name="nom" autocomplete="family-name" required /></div>
  <div><label>Prénom * <input name="prenom" required /></label></div>
  <div><label for="naissance">Date de naissance *</label><input id="naissance" name="naissance" placeholder="JJ/MM/AAAA" required /></div>
  <div><label for="email">Adresse e-mail *</label><input id="email" name="email" type="email" required /></div>
  <div><label for="email2">Confirmez votre e-mail *</label><input id="email2" name="email_confirmation" type="email" required /></div>
  ${
    obscurePhone
      ? '<div><label for="tel">Votre numéro direct</label><input id="tel" name="num1" type="tel" /></div>'
      : '<div><label for="tel">Téléphone mobile</label><input id="tel" name="telephone" type="tel" /></div>'
  }
  <div><label for="adresse">Adresse</label><input id="adresse" name="adresse" /></div>
  <div><label for="cp">Code postal *</label><input id="cp" name="cp" maxlength="5" required /></div>
  <div>
    <label for="ville">Ville</label>
    <input id="ville" name="ville" role="combobox" aria-autocomplete="list" aria-controls="ville-list" />
    <ul id="ville-list" role="listbox"></ul>
  </div>
  <div><input type="password" name="mdp" aria-label="Mot de passe" /></div>
  <input type="hidden" name="csrf" value="x" />
  <div style="display:none"><label for="piege">Ne pas remplir</label><input id="piege" name="piege" /></div>
`;

const STEP_2 = `
  <h2>Votre véhicule</h2>
  <div><label for="immat">Immatriculation *</label><input id="immat" name="immatriculation" required /></div>
  <div>
    <label for="marque">Marque *</label>
    <select id="marque" name="marque" required>
      <option value="">Choisir…</option>
      <option value="RENAULT">Renault</option>
      <option value="PEUGEOT">Peugeot</option>
      <option value="CITROEN">Citroën</option>
    </select>
  </div>
  <div><label for="modele">Modèle *</label><input id="modele" name="modele" required /></div>
  <div><label for="dmec">Date de première mise en circulation *</label><input id="dmec" name="dmec" type="date" required /></div>
  <div><label for="cv">Puissance fiscale (CV) *</label><input id="cv" name="puissance" type="number" required /></div>
  <fieldset>
    <legend>Usage du véhicule *</legend>
    <label><input type="radio" name="usage" value="U1" /> Privé</label>
    <label><input type="radio" name="usage" value="U2" /> Privé et trajet domicile-travail</label>
    <label><input type="radio" name="usage" value="U3" /> Professionnel</label>
  </fieldset>
  <div>
    <label for="parking">Lieu de stationnement la nuit *</label>
    <select id="parking" name="parking" required>
      <option value="">Sélectionner</option>
      <option value="G">Garage privé</option>
      <option value="P">Parking fermé</option>
      <option value="V">Voie publique</option>
    </select>
  </div>
`;

const STEP_3 = `
  <h2>Conducteur principal</h2>
  <div><label for="nom-cond">Nom du conducteur *</label><input id="nom-cond" name="nom_conducteur" required /></div>
  <div><label for="prenom-cond">Prénom du conducteur *</label><input id="prenom-cond" name="prenom_conducteur" required /></div>
  <div><label for="naiss-cond">Date de naissance du conducteur *</label><input id="naiss-cond" name="naissance_conducteur" placeholder="JJ/MM/AAAA" required /></div>
  <div><label for="permis">Date d'obtention du permis *</label><input id="permis" name="date_permis" type="date" required /></div>
  <h2>Historique d'assurance</h2>
  <fieldset>
    <legend>Êtes-vous actuellement assuré ? *</legend>
    <label><input type="radio" name="assure" value="1" /> Oui</label>
    <label><input type="radio" name="assure" value="0" /> Non</label>
  </fieldset>
  <div id="assureur-actuel" hidden><label for="assureur">Assureur actuel *</label><input id="assureur" name="assureur" required /></div>
  <div><label for="crm">Coefficient bonus-malus *</label><input id="crm" name="crm" type="number" step="0.01" required /></div>
  <div><label for="sinistres">Nombre de sinistres (36 derniers mois) *</label><input id="sinistres" name="sinistres" type="number" required /></div>
  <fieldset>
    <legend>Avez-vous déjà été résilié ? *</legend>
    <label><input type="radio" name="resilie" value="1" /> Oui</label>
    <label><input type="radio" name="resilie" value="0" /> Non</label>
  </fieldset>
  <div><label><input type="checkbox" name="cgu" /> J'accepte les conditions générales</label></div>
`;

const CITIES = ['Lyon 3e', 'Lyon 6e', 'Paris 1er'];

export interface AssureurA {
  /** Étape affichée (1 à 3). */
  readonly step: number;
  /** Le courtier clique sur « Suivant » : la page affiche l'étape suivante (après un court chargement). */
  next(): void;
  /** Boutons de l'extranet : le test vérifie que l'extension n'en clique aucun. */
  buttons(): HTMLButtonElement[];
}

/** Monte l'extranet simulé dans `document.body`. */
export function mountAssureurA(doc: Document, options: AssureurAOptions = {}): AssureurA {
  const { obscurePhoneLabel = false, stepIndicator = true } = options;
  doc.body.innerHTML = `
    <header><strong>Extranet Assureur A</strong> <span id="indicator"></span></header>
    <form id="wizard" novalidate>
      <div id="content"></div>
      <div id="spinner" class="spinner" hidden>Chargement…</div>
      <div class="actions">
        <button type="button" id="prev">Précédent</button>
        <button type="button" id="next">Suivant</button>
        <button type="button" id="submit" hidden>Obtenir mon tarif</button>
      </div>
    </form>`;
  const content = doc.getElementById('content')!;
  const state = { step: 0 };

  const render = (step: number) => {
    state.step = step;
    content.innerHTML = step === 1 ? STEP_1(obscurePhoneLabel) : step === 2 ? STEP_2 : STEP_3;
    doc.getElementById('indicator')!.textContent = stepIndicator ? `Étape ${step} sur 3` : '';
    (doc.getElementById('next') as HTMLElement).hidden = step === 3;
    (doc.getElementById('submit') as HTMLElement).hidden = step !== 3;
    wire();
  };

  const wire = () => {
    // Saisie assistée : les suggestions apparaissent après la saisie de la ville.
    const city = doc.getElementById('ville');
    city?.addEventListener('input', () => {
      const list = doc.getElementById('ville-list')!;
      const typed = (city as HTMLInputElement).value.toLowerCase();
      list.innerHTML = '';
      if (typed.length < 2) return;
      setTimeout(() => {
        list.innerHTML = '';
        CITIES.filter(name => name.toLowerCase().includes(typed)).forEach(name => {
          const option = doc.createElement('li');
          option.setAttribute('role', 'option');
          option.textContent = name;
          option.addEventListener('click', () => {
            (city as HTMLInputElement).value = name;
            list.innerHTML = '';
          });
          list.appendChild(option);
        });
      }, 20);
    });
    // Un champ apparaît sous la réponse « Oui » (la structure change, pas l'étape).
    doc.querySelectorAll<HTMLInputElement>('input[name="assure"]').forEach(radio =>
      radio.addEventListener('change', () => {
        (doc.getElementById('assureur-actuel') as HTMLElement).hidden = radio.value !== '1';
      }),
    );
    // Un masque de saisie qui refuse les formats inattendus.
    doc.getElementById('cp')?.addEventListener('input', event => {
      const input = event.target as HTMLInputElement;
      if (!/^\d*$/.test(input.value)) input.value = '';
    });
  };

  render(1);
  return {
    get step() {
      return state.step;
    },
    next() {
      const spinner = doc.getElementById('spinner')!;
      spinner.hidden = false;
      content.innerHTML = '';
      setTimeout(() => {
        spinner.hidden = true;
        render(state.step + 1);
      }, 30);
    },
    buttons: () => [...doc.querySelectorAll<HTMLButtonElement>('button')],
  };
}
