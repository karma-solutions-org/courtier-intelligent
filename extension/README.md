# Extension Chrome « Courtier Intelligent – Remplissage auto »

Extension MV3 (TypeScript) : elle remplit les extranets des assureurs à partir des tarifications demandées dans l'app.
**Elle ne soumet jamais seule** : elle remplit chaque étape et passe à la suivante (« Suivant », « Étape suivante »), mais ne clique jamais sur le bouton final de tarification (« Obtenir mon tarif », « Calculer ») : c'est le courtier qui le fait, puis l'extension lit le tarif affiché.

## Installer et tester

```bash
npm install
npm run build:dev          # dist/ de développement (localhost autorisé, sourcemaps) : à charger dans chrome://extensions
npm run build:demo         # idem, avec les faux extranets (npm run demo:extranet…, ports 8090-8094)
npm run build:emulators    # idem, mais vise les emulators Firebase locaux (auth 9099, firestore 8080, functions 5001)
npm run watch              # build de développement reconstruit à chaque modification
npm run build              # build de PRODUCTION (paquet à publier) : sans localhost ni sourcemaps
npm test                   # 615 tests (Vitest + jsdom)
npm run typecheck
```

### Extranets de démonstration (tarification multi-assureurs en local)

Cinq faux extranets statiques, tous reconnus par le vrai moteur (tests `src/engine/demo-extranet*.test.ts`) ; à
charger avec un build `build:demo` (localhost autorisé) et à déclarer dans le catalogue des assureurs (dépôt back).

| Assureur (id catalogue) | Dossier | Commande | Adresse | Parcours |
|---|---|---|---|---|
| Assureur Test (`assureur-test-local`) | `demo-extranet/` | `npm run demo:extranet` | <http://localhost:8090/index.html> | 3 pages : souscripteur, véhicule, conducteur + antécédents |
| Horizon Assurances (`assureur-horizon-local`) | `demo-extranet-horizon/` | `npm run demo:horizon` | <http://localhost:8091/index.html> | 1 seule page en volets (véhicule, conducteur, souscripteur), cases multiples, liste maison, page « Votre cotisation » |
| Atlas Mutuelle (`assureur-atlas-local`) | `demo-extranet-atlas/` | `npm run demo:atlas` | <http://localhost:8092/index.html> | assistant 4 étapes sur une page (antécédents → souscripteur), contrôles ARIA, tarif au mois sur la même page |
| Démo type Oyat (`assureur-oyat-local`) | `demo-extranet-oyat/` | `npm run demo:oyat` | <http://localhost:8093/index.html> | structure HTML relevée sur Oyat : lignes `div.ligne`, astérisque en image, dates en 3 cases, « > Continuer Devis » ; adaptateur Oyat |
| Démo type Zephir (`assureur-zephir-local`) | `demo-extranet-zephir/` | `npm run demo:zephir` | <http://localhost:8094/index.html> | structure HTML relevée sur Zephir (Angular Material) : Oui / Non obligatoires (ng-invalid), « Ajouter un sinistre », pages d'antécédents en double, déclarations ; adaptateur Zephir |

`npm run demo:all` sert les cinq à la fois (Ctrl+C arrête tout). Détails dans le `README.md` de chaque dossier.

Pour que l'app détecte l'extension, renseigner son identifiant (visible dans `chrome://extensions`) dans `extensionId` des fichiers `app/src/environments/`.

## Architecture

| Pièce | Rôle |
|---|---|
| `background/service-worker.ts` | Connexion Firebase propre à l'extension, vérification de la session de l'appareil (alarme + suivi en direct), jobs du courtier, proxy d'IA, badge des tarifications à lancer |
| `background/auth-controller.ts` | Connexion, refus (pas de cabinet, aucune session d'app ouverte), perte d'accès quand la session de l'appareil est coupée |
| `background/origin-match.ts` | Reconnaît l'extranet d'un assureur d'après `insurers/{id}.extranetDomains` (https seulement) et choisit le job à exécuter |
| `content/content-script.ts` | Sur une page d'extranet, démarre le `FormRunner` pour le job reçu |
| `engine/analyzer.ts` | Analyse du DOM : champs, libellés, types, options, sections, caractère obligatoire, empreinte de la structure |
| `engine/mapping.ts` + `field-synonyms.ts` | Synonymes et scoring vers le modèle canonique (liste fermée : un chemin hors liste est impossible) |
| `engine/ai-fallback.ts` | Repli sur `ia-proxy` pour les champs incertains ; seule la structure du formulaire est envoyée, la réponse est validée |
| `engine/memory.ts` | Mémoire partagée des formulaires : formulaire connu → mapping sans IA, apprentissage après un remplissage validé, invalidation si elle échoue |
| `engine/plan.ts` | Quoi remplir, quoi demander au courtier (`needs_info` + `missingFields`), quoi laisser |
| `engine/filler.ts` | Remplissage : texte, nombre, date, liste, radio, case à cocher, saisie assistée, avec `focus`/`input`/`change`/`blur` |
| `engine/steps.ts` + `runner.ts` | Parcours en plusieurs étapes : détection de l'étape, attente du chargement, `currentStep`, nouveaux champs sous une réponse |
| `engine/capture.ts` + `offer.ts` | Capture du tarif (E10) : détection de la page de résultat, lecture dans le DOM des primes, franchises, garanties (tableau ou liste), plafonds, exclusions et numéro de devis |
| `engine/capture-ai.ts` | Repli sur `ia-proxy` quand le DOM ne suffit pas : texte de la page **expurgé** des données du dossier et des coordonnées ; un montant absent de la page est écarté |
| `engine/extranets/` | Ce que chaque extranet fait à sa façon : un dossier par extranet (adaptateur, pages réelles, test de parcours), registre, simulateur commun ; `adapterFor` choisit par assureur du job |
| `engine/flow/` | Parcours : lignes de sinistres (`claim-rows.ts`), clic sur « Suivant » (`advance.ts`) |
| `content/floating-bar.ts` | Barre flottante sur l'extranet : pause / reprise, sauvegarde du tarif affiché |
| `sidepanel/` | Connexion, dossier et job en cours, progression, champs non trouvés, correction manuelle, confirmation du tarif lu |

## Règles

- **Rien n'est inventé** : `null`, absent et chaîne vide n'ont pas de valeur ; « l'assuré ne sait pas » et « inconnu » ne se remplissent pas ; un champ facultatif sans donnée reste vide ; une option qui ne correspond pas n'est jamais choisie au hasard.
- **L'IA ne voit aucune donnée client** : libellés, types et options des champs seulement.
- **Aucun identifiant d'extranet** n'est lu ni stocké ; les mots de passe ne sont jamais remplis.
- Les libellés des pages tierces sont affichés dans le side panel avec `textContent` (jamais comme HTML).
- **Capture du tarif** : rien n'est enregistré sans la confirmation du courtier dans le side panel (il peut corriger primes et numéro de devis). L'offre (`source: auto`) et le passage du job à `captured` sont écrits ensemble. S'il refuse le tarif, le job passe en `failed` (relance ou saisie manuelle dans l'app).
- **Rapports d'échec** (`extensionReports`) : assureur, origine de l'extranet, étape et un **code** parmi une liste fermée (`EXTENSION_REPORT_ISSUES`) ; jamais de texte libre ni d'URL complète.

## Ajouter un extranet sans casser ceux qui marchent

Voir **`src/engine/extranets/README.md`** : un dossier par extranet (adaptateur, HTML réel de ses pages, test de
parcours complet), créé par `npm run extranet:new -- <insurerId> <domaine>`. Toute modification doit garder verts
les tests de parcours de tous les extranets configurés (Zephir : `src/engine/extranets/zephir/journey.test.ts`).

## Limites connues

- Le moteur est validé sur un **extranet simulé** (`engine/__fixtures__/assureur-a.ts`, 3 étapes, tous les types de champs). L'accès aux vrais extranets n'est pas encore disponible : les synonymes et le scoring seront ajustés assureur par assureur (E11).
- Seule la page principale est analysée (pas les iframes).
- Capture : validée sur des pages de résultat simulées (`engine/__fixtures__/resultats.ts`). Le code des garanties (référentiel du produit) n'est pas posé par l'extension : elle écrit le libellé lu, la normalisation est prévue côté serveur (`onOfferWrite`, E13). Si la détection automatique manque une page de résultat, le courtier clique « Lire le tarif de cette page ».
- Mémoire partagée : une mémoire fausse n'est invalidée qu'après le signalement de 2 cabinets distincts (protection contre un cabinet qui fausserait celle des autres) ; d'ici là, chaque extension écarte localement ses entrées invalides.
