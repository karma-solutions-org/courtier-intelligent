# Extension Chrome « Courtier Intelligent – Remplissage auto »

Extension MV3 (TypeScript) : elle remplit les extranets des assureurs à partir des tarifications demandées dans l'app.
**Elle ne soumet jamais seule** : elle ne clique sur aucun bouton (ni « Suivant », ni « Obtenir mon tarif »), le courtier avance et valide lui-même.

## Installer et tester

```bash
npm install
npm run build              # dist/ : à charger dans chrome://extensions (mode développeur → Charger l'extension non empaquetée)
npm run build:emulators    # idem, mais vise les emulators Firebase locaux (auth 9099, firestore 8080, functions 5001)
npm test                   # 297 tests (Vitest + jsdom)
npm run typecheck
```

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
| `sidepanel/` | Connexion, dossier et job en cours, progression, champs non trouvés, correction manuelle, confirmation du tarif lu |

## Règles

- **Rien n'est inventé** : `null`, absent et chaîne vide n'ont pas de valeur ; « l'assuré ne sait pas » et « inconnu » ne se remplissent pas ; un champ facultatif sans donnée reste vide ; une option qui ne correspond pas n'est jamais choisie au hasard.
- **L'IA ne voit aucune donnée client** : libellés, types et options des champs seulement.
- **Aucun identifiant d'extranet** n'est lu ni stocké ; les mots de passe ne sont jamais remplis.
- Les libellés des pages tierces sont affichés dans le side panel avec `textContent` (jamais comme HTML).
- **Capture du tarif** : rien n'est enregistré sans la confirmation du courtier dans le side panel (il peut corriger primes et numéro de devis). L'offre (`source: auto`) et le passage du job à `captured` sont écrits ensemble. S'il refuse le tarif, le job passe en `failed` (relance ou saisie manuelle dans l'app).
- **Rapports d'échec** (`extensionReports`) : assureur, origine de l'extranet, étape et un **code** parmi une liste fermée (`EXTENSION_REPORT_ISSUES`) ; jamais de texte libre ni d'URL complète.

## Limites connues

- Le moteur est validé sur un **extranet simulé** (`engine/__fixtures__/assureur-a.ts`, 3 étapes, tous les types de champs). L'accès aux vrais extranets n'est pas encore disponible : les synonymes et le scoring seront ajustés assureur par assureur (E11).
- Seule la page principale est analysée (pas les iframes).
- Capture : validée sur des pages de résultat simulées (`engine/__fixtures__/resultats.ts`). Le code des garanties (référentiel du produit) n'est pas posé par l'extension : elle écrit le libellé lu, la normalisation est prévue côté serveur (`onOfferWrite`, E13). Si la détection automatique manque une page de résultat, le courtier clique « Lire le tarif de cette page ».
- Mémoire partagée : une mémoire fausse n'est invalidée qu'après le signalement de 2 cabinets distincts (protection contre un cabinet qui fausserait celle des autres) ; d'ici là, chaque extension écarte localement ses entrées invalides.
