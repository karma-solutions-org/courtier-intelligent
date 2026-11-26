# Extranet de démonstration « Démo type Zephir (locale) »

Faux extranet d'assureur (identifiant catalogue `assureur-zephir-local`, port **8094**), 100 % statique (HTML/CSS/JS
vanilla, sans build ni Angular). Il reproduit la **structure HTML** de l'extranet réel Zephir (application Angular
Material) telle que relevée dans `src/engine/extranets/zephir/fixture.ts`, pour tester l'extension dans un vrai
navigateur. Ni logo ni marque. Aucune donnée n'est envoyée : les réponses restent dans le `sessionStorage` de l'onglet
et servent uniquement à calculer un tarif fictif.

L'assureur `assureur-zephir-local` est enregistré dans `src/engine/extranets/registry.ts` avec l'adaptateur Zephir.

Pages :

| Page | Rôle |
| --- | --- |
| `index.html` | Accueil (aucun identifiant) : bouton **Nouveau projet Auto** |
| `projet-auto.html` | **Application d'une seule page** : le contenu du formulaire est remplacé à chaque **Suivant** (`button.boutonSubmit`), après un court chargement |

Parcours de `projet-auto.html`, dans l'ordre du relevé de l'extranet réel :

1. **Informations complémentaires** (véhicule) : immatriculation, marque, modèle, date de mise en circulation, code
   postal et ville du lieu de stationnement, **Garage** Oui / Non (obligatoire), **Remorque / Caravane** déjà répondu,
   juste avant la liste de la classe socio-professionnelle (sans libellé propre, comme sur l'extranet réel).
2. **Antécédents** du conducteur principal : bonus-malus, « Assuré actuellement » et « Résilié par un précédent
   assureur » (Oui / Non obligatoires), tableau des sinistres vide et **Ajouter un sinistre** (`div.btnAjoutTable` :
   un `span` suivi d'une icône `svg`) qui ajoute une ligne (date jj/mm/aaaa, type, taux de responsabilité).
3. **Même page** pour le conducteur secondaire (même titre, mêmes champs : piège de l'extranet réel).
4. **Résumé**, sans champ.
5. **Déclarations complémentaires** : trois questions Oui / Non obligatoires (permis valide, situation incompatible,
   transport de matières dangereuses / de personnes).
6. **Votre tarif Auto** : devis `ZD-AAAA-NNNNNN`, prime annuelle TTC et mensualité (+ 4 % de fractionnement), franchise,
   garanties, exclusions.

Comportements Angular Material imités : groupes `mat-button-toggle-group` / `mat-button-toggle`, boutons
`aria-pressed`, classes `ng-invalid` → `ng-valid` au clic, `required=""` ; **Suivant est refusé** (la page reste
affichée avec un message d'erreur) tant qu'un `mat-button-toggle-group[required].ng-invalid` est présent. Le volet
**Synthèse** (qui parle de « sinistre ») est affiché à côté du formulaire sur toutes les pages.

La reconnaissance par le vrai moteur (champs reliés sans IA, réponses Oui / Non, ligne de sinistre ajoutée et remplie
sur les deux pages d'antécédents, passage de toutes les pages, lecture du tarif) est vérifiée par
`src/engine/demo-extranet-zephir.test.ts` (`npm test`).

## Lancer la démo

1. Prérequis identiques à ceux de l'Assureur Test (voir `../demo-extranet/README.md`), plus l'assureur dans le
   catalogue du dépôt back, sur le modèle de `catalog/insurers/assureur-test-local.json` :
   `{ "id": "assureur-zephir-local", "name": "Démo type Zephir (locale)", "extranetUrl": "http://localhost:8094/index.html", "extranetDomains": ["localhost:8094"], "productsSupported": ["auto"] }`,
   puis republier le catalogue (`ops:seed-catalog`).
2. Extension construite avec `npm run build:demo` (localhost autorisé, tous ports).
3. Dans `extension/` : `npm run demo:zephir` → <http://localhost:8094/index.html> (ou `npm run demo:all`).
4. Dans l'application : activer « Démo type Zephir (locale) » pour le produit Auto, puis **Tarifer** un dossier.
5. Sur <http://localhost:8094/index.html>, cliquer **Nouveau projet Auto** : l'extension remplit chaque page et clique
   **Suivant** jusqu'au tarif, qu'elle lit.

Pour recommencer : **Abandonner** (ou **Nouveau projet** sur la page de tarif) vide les réponses de l'onglet.
