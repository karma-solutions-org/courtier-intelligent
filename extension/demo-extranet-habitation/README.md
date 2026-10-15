# Extranet de démonstration « Assureur Habitat (démo locale) »

Faux extranet d'assureur **habitation**, 100 % statique, servi sur <http://localhost:8091>. Il sert à tester
**l'ajout automatique des champs** : la plupart de ses champs n'existent pas dans le questionnaire d'un produit
Habitation tout neuf. L'extension les remplit quand elle peut, et **signale les autres** au serveur, qui les ajoute au
questionnaire du produit : **obligatoires** s'ils sont marqués `*` sur l'extranet, **facultatifs** sinon.

| Page | Champs |
| --- | --- |
| `devis-etape1.html` | Souscripteur (reconnus) + **Situation familiale \*** + Nombre d'occupants |
| `devis-etape2.html` | **Type de logement \***, **Qualité de l'occupant \***, **Surface habitable \***, **Nombre de pièces \***, **Résidence principale \***, Étage, Année de construction, Dépendances |
| `devis-etape3.html` | **Capital mobilier \***, Objets de valeur, Piscine, Alarme, **Sinistres sur 5 ans \***, **Résilié par un précédent assureur \*** — bouton **Calculer mon tarif** |
| `resultat.html` | Tarif HAB-DEMO-2026-0007 (capturé par l'extension) |

La lecture par le vrai moteur est vérifiée par `src/engine/demo-extranet-habitation.test.ts` (`npm test`).

## Pas à pas

1. **Extension** : dans `extension/`, `npm run build:demo`, puis `chrome://extensions` → ↻ sur Courtier Intelligent.
2. **App** : dans `app/`, `npm start` → <http://localhost:4200>, se connecter (compte admin d'un cabinet actif).
3. **Extranet** : dans `extension/`, `npm run demo:extranet-habitation` (laisser le terminal ouvert).
4. **Produit** : Paramètres → Assureurs et produits → **Nouveau produit** → nom `Habitation`, point de départ
   **Produit vierge** → Créer. Puis ✏️ → ajouter 2 ou 3 **garanties** (ex. Responsabilité civile, Dégâts des eaux, Vol)
   → Enregistrer le produit.
5. **Assureur** : **Ajouter un assureur** → nom `Assureur Habitat (démo)`, adresse `http://localhost:8091/index.html`,
   produit tarifé **Habitation** → Ajouter.
6. **Extension connectée** : ouvrir son panneau et se connecter (même compte que l'app).
7. **Dossier** : nouveau dossier **Habitation** pour un client (nom, prénom, date de naissance, email, adresse) →
   questionnaire → valider la **Couverture**.
8. **Tarifer** : sur la carte « Assureur Habitat (démo) », **Tarifer**.
9. **Extranet** : <http://localhost:8091/index.html> → **Accéder à l'espace courtier**. À chaque étape, l'extension
   remplit ce qu'elle connaît (le souscripteur) ; vérifier, compléter les autres champs à la main, puis **Suivant**.
10. **Résultat** : **Calculer mon tarif** → l'offre est capturée dans le dossier.
11. **Vérifier l'ajout des champs** : Paramètres → Assureurs et produits → ✏️ sur Habitation. Une section
    **« Questions des assureurs »** contient les nouveaux champs, avec **Obligatoire** coché pour ceux marqués `*`.
    Ils apparaissent aussi dans le questionnaire des dossiers Habitation.

Les deux extranets de démo (Auto sur 8090, Habitation sur 8091) partagent le domaine `localhost` : l'extension
retrouve la bonne tarification d'après l'assureur du job.
