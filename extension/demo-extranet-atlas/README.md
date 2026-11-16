# Extranet de démonstration « Atlas Mutuelle (démo locale) »

Troisième faux extranet d'assureur (identifiant catalogue `assureur-atlas-local`, port **8092**), 100 % statique
(HTML/CSS/JS, sans build). Il sert à tester la tarification **multi-assureurs** en local, avec un parcours encore
différent de l'« Assureur Test » (8090) et d'« Horizon Assurances » (8091). Les réponses ne quittent jamais la page :
rien dans l'URL, rien d'envoyé, rien de stocké ; elles servent uniquement à calculer un tarif fictif.

Pages :

| Page | Rôle |
| --- | --- |
| `index.html` | Espace intermédiaires (aucun identifiant) : bouton **Démarrer une étude tarifaire** |
| `etude.html` | **Assistant en 4 étapes sur une seule page** (sans rechargement) : Antécédents → Conducteur → Véhicule → Souscripteur, barre de progression, boutons **Étape suivante** puis **Découvrir mon tarif** ; la proposition s'affiche ensuite sur la même page |

## Ce qui change par rapport aux autres démos

- **Ordre inversé** : les antécédents d'abord, le souscripteur en dernier.
- **Étape détectée par la barre de progression** (`role="progressbar"`, `aria-valuenow` / `aria-valuemax`), sans texte
  « Étape n sur N » ; les étapes sont des panneaux masqués / affichés, avec un court chargement (`aria-busy`) entre deux.
- **Validation propre à Atlas** : « Étape suivante » refuse une étape incomplète (message `role="alert"`, champs
  `aria-invalid`).
- **Contrôles maison** : « Actuellement assuré(e) ? » en boutons radio dessinés (`role="radiogroup"` / `role="radio"`) ;
  la **compagnie d'assurance actuelle** n'apparaît qu'après « Oui », dans une liste déroulante maison
  (`button[aria-haspopup="listbox"]`) ; « Type de véhicule » en boutons bascule (`aria-pressed` : Tourisme, Utilitaire,
  Deux-roues) ; type de permis en pastilles (boutons radio masqués, dessinés par leur libellé) ; déclarations en cases à
  cocher (« Avez-vous déjà été résilié(e) ? », « Suspension ou annulation de permis depuis 5 ans »).
- **Dates** : naissance du conducteur en trois listes (jour, mois en lettres, année), permis en mois/année
  (`type="month"`), naissance du souscripteur en texte au format AAAA-MM-JJ.
- **Noms techniques** : `hist_*`, `cnd_*`, `veh_*`, `sou_*` ; listes à codes (U1/U2/U3 pour l'usage, G/P/V pour le
  stationnement nocturne, SAL/FON/… pour la catégorie socio-professionnelle).
- **Tarif au mois d'abord** : « Proposition n° ATL-AAAA-NNNNN », mensualité mise en avant, puis « soit … par an en
  paiement comptant » (douze mensualités moins 4 %), franchise de base (200 €, 400 € à partir de 2 sinistres), garanties
  et exclusions en listes. Formule propre à Atlas (âge, ancienneté du permis, sinistres, valeur, CV, usage, stationnement,
  type de véhicule, résiliation, suspension, CRM).

La reconnaissance par le vrai moteur (4 étapes reliées sans IA, remplies et validées par « Étape suivante », puis
lecture de la proposition) est vérifiée par `src/engine/demo-extranet-atlas.test.ts` (`npm test`).

## Lancer la démo

1. Prérequis identiques à ceux de l'Assureur Test (voir `../demo-extranet/README.md`), plus l'assureur dans le
   catalogue du dépôt back, sur le modèle de `catalog/insurers/assureur-test-local.json` :
   `{ "id": "assureur-atlas-local", "name": "Atlas Mutuelle (démo locale)", "extranetUrl": "http://localhost:8092/index.html", "extranetDomains": ["localhost:8092"], "productsSupported": ["auto"] }`,
   puis republier le catalogue (`ops:seed-catalog`).
2. Extension construite avec `npm run build:demo` (localhost autorisé, tous ports).
3. Dans `extension/` : `npm run demo:atlas` → <http://localhost:8092/index.html> (ou `npm run demo:all` pour les trois
   démos à la fois).
4. Dans l'application : activer « Atlas Mutuelle (démo locale) » pour le produit Auto, puis **Tarifer** un dossier dont
   le besoin est validé.
5. Sur <http://localhost:8092/index.html>, cliquer **Démarrer une étude tarifaire** : l'extension remplit chaque étape et
   passe à la suivante. À la dernière, vérifier puis cliquer **Découvrir mon tarif** : la proposition s'affiche et
   l'extension lit le numéro, la mensualité, le prix annuel, la franchise et les garanties.

Pour recommencer : lien **Nouvelle étude** (recharge la page, les réponses sont oubliées).
