# Extranet de démonstration « Assureur Test (démo locale) »

Faux extranet d'assureur, 100 % statique (HTML/CSS/JS, sans build), pour montrer de bout en bout le remplissage
automatique d'un devis auto par l'extension et la capture du tarif. Aucune donnée n'est envoyée : les réponses
restent dans le `sessionStorage` de l'onglet et servent uniquement à calculer un tarif fictif.

Pages :

| Page | Rôle |
| --- | --- |
| `index.html` | Accueil « connexion » (aucun identifiant) : bouton **Accéder à l'espace courtier** |
| `devis-etape1.html` | Étape 1 sur 3 – Souscripteur (`client.*`) |
| `devis-etape2.html` | Étape 2 sur 3 – Véhicule (`vehicle.*`, listes usage / stationnement / type) |
| `devis-etape3.html` | Étape 3 sur 3 – Conducteur principal (`driver.*`) et antécédents (`insuranceHistory.*`), bouton **Calculer mon tarif** |
| `resultat.html` | **Votre tarif** : devis n° DEMO-2026-0042, primes annuelle et mensuelle, franchise, garanties, exclusions |

La reconnaissance par le vrai moteur est vérifiée par `src/engine/demo-extranet.test.ts` (`npm test`).

## Prérequis (projet Firebase de test `aibs-partenaire-testing`)

1. Catalogue republié avec l'assureur de démo (`catalog/insurers/assureur-test-local.json` du dépôt back) :
   `npm --prefix functions run ops:seed-catalog -- --project aibs-partenaire-testing`
2. Fonctions déployées : `sessions-ouvrir`, `sessions-ouvrirExtension` (et `fermer*`), `dossiers-*`,
   `tarification-lancer`, `tarification-completer`, `tarification-saisirOffre`, `offres-onWrite`, `memoires-*`,
   `ia-proxy` (facultatif : repli IA), ainsi que les règles Firestore à jour.
3. Un compte courtier avec un cabinet actif.

## Démonstration pas à pas

1. **Construire et charger l'extension** : dans `extension/`, `npm install` puis `npm run build`.
   Dans Chrome, `chrome://extensions` → activer le *Mode développeur* → **Charger l'extension non empaquetée** →
   choisir le dossier `extension/dist`.
2. **Lancer l'application** : dans `app/`, `npm start` → <http://localhost:4200>, se connecter avec le compte courtier.
3. **Lancer le faux extranet** : dans `extension/`, `npm run demo:extranet` → <http://localhost:8090/index.html>
   (laisser le terminal ouvert).
4. **Activer l'assureur** : dans l'application, **Paramètres → Assureurs et produits** → activer
   « Assureur Test (démo locale) » pour le produit Auto.
5. **Connecter l'extension** : ouvrir le panneau latéral de l'extension et se connecter (session extension).
6. **Préparer un dossier** : créer (ou ouvrir) un dossier Auto, compléter le questionnaire puis passer le besoin à
   **Besoin validé**.
7. **Tarifer** : sur la carte « Assureur Test (démo locale) » du dossier, cliquer **Tarifer**. Le job de tarification
   passe à « demandé ».
8. **Ouvrir l'extranet** : aller sur <http://localhost:8090/index.html> et cliquer
   **Accéder à l'espace courtier**. L'extension reconnaît le domaine `localhost` et reprend le job.
9. **Étapes 1 et 2** : l'extension remplit les champs ; vérifier puis cliquer **Suivant** (l'extension ne clique
   jamais elle-même).
10. **Étape 3** : l'extension remplit le conducteur et les antécédents ; s'il manque une information, elle est
    demandée dans le panneau latéral (statut *needs_info*). Le job passe ensuite à « en attente de validation ».
11. **Soumettre** : cliquer **Calculer mon tarif**. La page **Votre tarif** s'affiche (tarif calculé à partir des
    réponses) ; l'extension capture le devis DEMO-2026-0042, les primes, la franchise et les garanties.
12. **Retour à l'application** : l'offre capturée apparaît sur le dossier, prête pour la comparaison et la proposition.

Pour recommencer : lien **Nouveau devis** sur la page de résultat (vide les réponses de l'onglet).
