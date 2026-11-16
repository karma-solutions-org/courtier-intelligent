# Extranets

Tout ce qu'un extranet d'assureur fait **à sa façon** vit ici, isolé du moteur commun (`engine/`). Le moteur appelle
toujours un adaptateur ; un assureur sans dossier ici utilise `genericAdapter`.

```
extranets/
  adapter.ts        Interface ExtranetAdapter (points d'extension) et ExtranetDefinition
  generic.ts        Comportement par défaut
  registry.ts       Extranets qui ont un comportement propre (insurerId, domaines, adaptateur)
  index.ts          adapterFor({ insurerId, origin }) : par assureur du job, sinon par domaine, sinon générique
  testing/
    simulator.ts    Simulateur d'extranet multi-pages (refus de « Suivant », boutons bascule, ajout de ligne)
    journey.ts      runJourney() : lance l'extension sur le simulateur jusqu'à la lecture du tarif
  <insurerId>/
    adapter.ts      Seulement ce qui diffère du générique
    fixture.ts      Pages du parcours, HTML RÉEL de l'extranet (données client remplacées)
    journey.test.ts Parcours complet jusqu'au tarif (test de non-régression)
```

## Configurer un nouvel extranet

1. **Le parcours générique d'abord.** Lancez une tarification : beaucoup d'extranets passent sans rien de propre.
   On ne crée le dossier de l'extranet que lorsqu'il diffère vraiment (pas de dossier vide « au cas où »).
2. **Créer le dossier** : `npm run extranet:new -- <insurerId> <domaine>` (ex. `oyat oyat-assurances.fr`).
   L'identifiant est celui du catalogue (`ci_insurers/{insurerId}`).
3. **Relever le HTML réel** de chaque page bloquante (console du navigateur, `outerHTML` du bloc concerné) dans
   `fixture.ts`, une entrée par étape, en remplaçant les données client.
4. **Corriger** :
   - comportement propre à l'extranet → `<insurerId>/adapter.ts`, en redéfinissant un point d'extension ;
   - besoin qu'aucun point d'extension ne couvre → ajouter le point dans `adapter.ts` **avec son défaut dans
     `generic.ts`** (les autres extranets ne changent pas) ;
   - vrai défaut du moteur commun (lecture d'un libellé, d'un type de champ…) → le moteur, avec un test unitaire.
5. **Écrire `journey.test.ts`** sur le modèle de `zephir/journey.test.ts`.
6. **`npm test`** : tous les parcours (Zephir compris) doivent rester verts. S'il en casse un, on corrige le
   changement, jamais le test de l'autre extranet.

## Règles

- Jamais de `if (insurerId === …)` ni de sélecteur propre à un extranet dans le moteur commun.
- Un point d'extension doit rester rapide : il est appelé pour chaque champ ou à chaque étape.
- `extranets.test.ts` échoue si un extranet enregistré n'a pas son `adapter.ts`, `fixture.ts` et `journey.test.ts`.

## État

| Extranet | Dossier | Parcours jusqu'au tarif |
|---|---|---|
| Zephir | `zephir/` | ✅ (octobre 2026) |
| Autres assureurs du catalogue | — (générique) | à configurer |
