# Extranet de démonstration « Horizon Assurances (démo locale) »

Deuxième faux extranet d'assureur (identifiant catalogue `assureur-horizon-local`, port **8091**), 100 % statique
(HTML/CSS/JS, sans build). Il sert à tester la tarification **multi-assureurs** en local, avec un parcours volontairement
différent de l'« Assureur Test » (port 8090). Aucune donnée n'est envoyée : les réponses restent dans le
`sessionStorage` de l'onglet et servent uniquement à calculer un tarif fictif.

Pages :

| Page | Rôle |
| --- | --- |
| `index.html` | Portail des partenaires (aucun identifiant) : bouton **Ouvrir un projet auto** |
| `projet-auto.html` | **Une seule page** en trois volets repliables, dans cet ordre : véhicule, conducteur (et antécédents), souscripteur ; bouton **Calculer la cotisation** |
| `cotisation.html` | **Votre cotisation** : numéro de projet `HZN-AAAA-NNNN`, tableau « Cotisation TTC annuelle / mensuelle », franchise générale, garanties de la formule Confort, « Ce qui n'est pas couvert » |

## Ce qui change par rapport à l'Assureur Test

- **Pas d'étapes** : aucun indicateur « Étape n sur N » ; c'est le bouton « Calculer la cotisation » qui fait de la page
  la dernière (l'extension remplit tout, le courtier calcule lui-même).
- **Ordre et libellés** : véhicule d'abord (« Constructeur », « Modèle commercial », « Finition », « Date de 1re mise en
  circulation » au format JJ/MM/AAAA dans un champ texte, « Puissance fiscale (CV) » en liste…), conducteur ensuite
  (« Date d'obtention du permis B », « Coefficient de réduction-majoration », « Compagnie actuelle »…), souscripteur à la
  fin (« Nom d'usage », « Né(e) le », « Courriel », « Commune »).
- **Saisies en plusieurs cases** : immatriculation en 3 cases (2/3/2), date de naissance du conducteur en 3 cases
  (JJ / MM / AAAA), téléphone mobile en 5 cases de 2 chiffres.
- **Choix** : usage en boutons radio (« Loisirs uniquement », « Loisirs et trajet travail », « Usage professionnel ») ;
  Oui / Non en boutons radio ; catégorie (« Véhicule de tourisme (VP) »…) et énergie en listes à codes (VP, VU, 2R ; ES,
  GO…) ; nombre de sinistres en liste (0 à « 4 et plus ») ; **lieu de garage la nuit** dans une liste déroulante maison
  (`role="combobox"` + `role="listbox"`).
- **Tarif** : formule propre à Horizon (âge et ancienneté du permis, âge et valeur du véhicule, CV, sinistres, CRM, usage,
  garage, catégorie, énergie, résiliation) ; mensualité = annuelle + 3 % de fractionnement, divisée par 12 ; franchise
  générale relevée à 500 € pour un jeune conducteur.

La reconnaissance par le vrai moteur (champs reliés sans IA, remplissage complet, lecture de la cotisation calculée)
est vérifiée par `src/engine/demo-extranet-horizon.test.ts` (`npm test`).

## Lancer la démo

1. Prérequis identiques à ceux de l'Assureur Test (voir `../demo-extranet/README.md`), plus l'assureur dans le
   catalogue du dépôt back, sur le modèle de `catalog/insurers/assureur-test-local.json` :
   `{ "id": "assureur-horizon-local", "name": "Horizon Assurances (démo locale)", "extranetUrl": "http://localhost:8091/index.html", "extranetDomains": ["localhost:8091"], "productsSupported": ["auto"] }`,
   puis republier le catalogue (`ops:seed-catalog`).
2. Extension construite avec `npm run build:demo` (localhost autorisé, tous ports).
3. Dans `extension/` : `npm run demo:horizon` → <http://localhost:8091/index.html> (ou `npm run demo:all` pour les trois
   démos à la fois).
4. Dans l'application : activer « Horizon Assurances (démo locale) » pour le produit Auto, puis **Tarifer** un dossier
   dont le besoin est validé.
5. Sur <http://localhost:8091/index.html>, cliquer **Ouvrir un projet auto** : l'extension remplit les trois volets.
   Vérifier, puis cliquer **Calculer la cotisation**. La page **Votre cotisation** s'affiche et l'extension lit le
   numéro de projet, les cotisations annuelle et mensuelle, la franchise et les garanties.

Pour recommencer : lien **Nouveau projet** sur la page de cotisation (vide les réponses de l'onglet).
