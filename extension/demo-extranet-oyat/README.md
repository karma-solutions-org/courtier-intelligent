# Extranet de démonstration « Démo type Oyat (locale) »

Quatrième faux extranet d'assureur (identifiant catalogue `assureur-oyat-local`, port **8093**), 100 % statique
(HTML/CSS/JS, sans build). Il reproduit la **structure HTML de l'extranet réel Oyat** telle qu'elle a été relevée
(`src/engine/extranets/oyat/fixture.ts`), pour tester l'extension en vrai navigateur sur une page réaliste. Aucune
marque ni image Oyat : pictogrammes maison (`asterisque.svg`, `coche_cancel.svg`). Aucune donnée n'est envoyée : les
réponses restent dans le `sessionStorage` de l'onglet et servent uniquement à calculer un tarif fictif.

Pages :

| Page | Rôle |
| --- | --- |
| `index.html` | Espace courtiers (aucun identifiant) : lien **Nouveau devis automobile** |
| `conducteur.html` | **Etape 1 « Conducteur 1 »** : exactement les lignes relevées sur Oyat (date d'effet, civilité, identité, naissance, permis, AAC, adresse, antécédents sur 36 mois, résiliations, CRM, sanctions, troubles, sinistres) |
| `vehicule.html` | **Etape 2 « Véhicule »** (non relevée sur le vrai Oyat, construite dans le même style) : immatriculation + « Je ne la connais pas », marque, modèle, date de 1re mise en circulation, énergie, usage, lieu de stationnement la nuit, code postal de stationnement |
| `tarif.html` | **Votre tarif** : numéro de devis `OYD-AAAA-NNNNN`, primes annuelle et mensuelle TTC, franchise générale, garanties, exclusions |

## Ce qui reproduit Oyat

- **Une ligne par question** : `div.ligne` > `<label>` puis `div.objet` qui porte le ou les champs ; sections en
  `<fieldset>` dont la `<legend>` est un titre de section (pas la question des boutons radio).
- **Labels piégeux** : `for` visant un id absent (`for="oDateReprise"` pour `oDateReprise_jour/_mois/_annee`), ou pas de
  `for` du tout (Civilité, « Avez-vous été assuré… », résiliations).
- **Obligatoire = image** `asterisque` dans le label, sans astérisque en texte ni attribut `required` (adaptateur
  `extranets/oyat/adapter.ts`).
- **Dates en trois cases** (jour, mois, année) ; CRM en texte libre « (ex : 0.50) » ; nombre de sinistres sur 36 mois en
  texte ; sanctions en cases à cocher ; antécédents en 4 boutons radio (« Non, aucune assurance » … « Oui, 24 mois et
  plus »).
- **« &gt; Continuer Devis »** : un lien `<a role="button" class="btn next">` (flèche en tête). Il refuse d'avancer tant
  qu'une ligne obligatoire est vide : pictogramme `coche_cancel` et « Champ obligatoire » sur la ligne, message en tête
  (`role="alert"`). Sinon les réponses de l'étape sont enregistrées et le lien mène à l'étape suivante.
- La date d'effet est proposée par l'extranet (lendemain) ; les « depuis Octobre 2023 » suivent la date du jour.

Pas de bouton final : l'étape 2 se termine aussi par « &gt; Continuer Devis », qui affiche la page de tarif (l'extension
le clique, comme sur Oyat).

La reconnaissance par le vrai moteur (champs reliés sans IA, obligatoires lus sur l'image, remplissage complet des deux
étapes, lecture du tarif calculé) est vérifiée par `src/engine/demo-extranet-oyat.test.ts` (`npm test`).

## Lancer la démo

1. Prérequis identiques à ceux de l'Assureur Test (voir `../demo-extranet/README.md`), plus l'assureur dans le
   catalogue du dépôt back, sur le modèle de `catalog/insurers/assureur-test-local.json` :
   `{ "id": "assureur-oyat-local", "name": "Démo type Oyat (locale)", "extranetUrl": "http://localhost:8093/index.html", "extranetDomains": ["localhost:8093"], "productsSupported": ["auto"] }`,
   puis republier le catalogue (`ops:seed-catalog`). L'extension lui applique l'adaptateur Oyat
   (`src/engine/extranets/registry.ts`).
2. Extension construite avec `npm run build:demo` (localhost autorisé, tous ports).
3. Servir ce dossier sur le port 8093 (http-server statique), puis ouvrir <http://localhost:8093/index.html>.
4. Dans l'application : activer « Démo type Oyat (locale) » pour le produit Auto, puis **Tarifer** un dossier dont le
   besoin est validé. Les questions propres à Oyat (civilité, situation familiale, ville de naissance, AAC,
   résiliations détaillées, troubles) doivent avoir une réponse dans le dossier, sinon l'étape 1 reste bloquée et le
   courtier les complète à la main.
5. Cliquer **Nouveau devis automobile** : l'extension remplit l'étape 1, clique « &gt; Continuer Devis », remplit
   l'étape 2, clique de nouveau, puis lit le tarif sur **Votre tarif**.

Pour recommencer : lien **Nouveau devis** sur la page de tarif (vide les réponses de l'onglet).
