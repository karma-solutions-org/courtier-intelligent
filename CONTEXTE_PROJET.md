# Courtier Intelligent — Contexte complet du projet

> Document à donner à Claude (ou à tout nouveau développeur) pour reprendre le projet sans perdre le contexte.

## 1. Le produit

**Courtier Intelligent** est un **SaaS multi-tenant** vendu à des **cabinets de courtage en assurance**.
Il permet au courtier de :

1. **saisir un dossier** : assuré, produit (auto, habitation, santé…) et questionnaire du produit ;
2. **analyser le besoin** du client : niveau de couverture, budget, franchise acceptable, garanties indispensables. Cette analyse répond au **devoir de conseil** (réglementation DDA) ;
3. **obtenir 3 tarifs** grâce à une **extension Chrome** qui remplit automatiquement les **extranets des compagnies d'assurance** ;
4. **comparer les 3 offres** côte à côte (prime, franchises, garanties, plafonds, exclusions), voir les **écarts avec le besoin**, **choisir et justifier** ;
5. **envoyer la proposition** à l'assuré et **suivre le dossier** jusqu'à la souscription.

**Vocabulaire :**
- **Tenant / Cabinet** = le cabinet de courtage qui achète l'app (notre client).
- **Utilisateur** = courtier ou admin du cabinet.
- **Assuré** = le client du courtier. Il n'a **aucun accès** à l'app : c'est le courtier qui saisit tout manuellement.

## 2. Rôles

| Rôle | Droits |
|---|---|
| `superadmin` (le propriétaire de la plateforme) | Cabinets, produits, questionnaires, garanties, assureurs, monitoring de l'extension |
| `admin` (du cabinet) | Membres et paramètres du cabinet, plus les droits courtier |
| `courtier` | Assurés et dossiers du cabinet |

Assurés et dossiers sont visibles par tout le cabinet ; chaque dossier a un courtier assigné (filtre « Mes dossiers » par défaut).

## 3. Stack

- **Angular** (standalone components, signals, Angular Material, `@angular/fire`)
- **Firebase** : Auth, Firestore, Cloud Functions, Storage, Hosting
- **Extension Chrome Manifest V3** (TypeScript)
- **IA (Gemini)** appelée **uniquement via une Cloud Function proxy** (aucune clé dans l'extension)

**Hors périmètre pour l'instant** (choix du porteur de projet, ne pas proposer) : outillage qualité/CI, monorepo (Nx…), paiement/Stripe, génération de PDF, choix de région.

## 4. Architecture retenue

```
            ┌────────────────────── Firebase ───────────────────────┐
            │ Auth      : claims { tenantId, role }                 │
            │ Firestore : tenants/*, catalogue global, formMemories │
            │ Functions : cabinets, invitations, token extension,   │
            │             proxy IA, référence dossier, email        │
            │ Storage   : documents (carte grise, devis…)           │
            └──────▲─────────────────────────────▲──────────────────┘
                   │ temps réel                  │ temps réel
            ┌──────┴──────┐   1 message    ┌─────┴──────┐
            │ App Angular │ ─────────────► │ Extension  │ ──► Extranets
            └─────────────┘  (connexion)   └────────────┘     assureurs
```

**Principe clé : Firestore est la source unique de vérité.**
L'app et l'extension n'échangent **qu'un seul message** : l'app envoie à l'extension un **custom token Firebase** (même `uid`, `tenantId` et `role` que le courtier). Ensuite, tout passe par Firestore en temps réel.

**Pourquoi ce choix** (plutôt que des messages directs app ↔ extension) : aucun résultat perdu si l'onglet de l'app est fermé ; reprise possible plus tard ou sur un autre poste ; suivi en temps réel natif ; historique complet ; aucun code de synchronisation à écrire.

**Structure du repo** (un seul repo, dossiers simples) :

```
courtier-intelligent/
├─ app/          Angular (back-office cabinet + console super-admin)
├─ extension/    Chrome MV3
├─ functions/    Cloud Functions
├─ shared/       Types partagés (modèle canonique, statuts…)
├─ firestore.rules · storage.rules · firebase.json
```

## 5. Modèle canonique (le langage commun app ↔ extension ↔ IA)

Liste **fermée** de chemins :

```
client.*            firstName, lastName, nationalId, birthDate, phone, email,
                    address.street, address.postalCode, address.city, address.country
vehicle.*           registration, brand, model, version, firstRegistrationDate, fiscalPower,
                    vehicleValue, vehicleType, usage, parkingType, purchaseDate
driver.*            firstName, lastName, birthDate, licenseDate, licenseType, profession, phone
insuranceHistory.*  currentlyInsured, previousInsurer, previousContractStartDate, previousContractEndDate,
                    seniority, bonusMalus, claimsCount, responsibleClaimsCount, nonResponsibleClaimsCount,
                    wasTerminated, terminatedByInsurer, terminationReason, terminationDate
```

**Règles absolues :**
- l'extension ne mappe **jamais** vers un chemin hors de la liste (sinon `null`) ;
- **ne jamais inventer de donnée** : `null` (non renseigné) ≠ `0` ; les valeurs sensibles portent un niveau de connaissance `KNOWN | UNKNOWN | DECLARED_UNKNOWN` ;
- chaque champ du questionnaire produit porte un `canonicalPath`.

Le premier produit est **l'Auto**. Les autres produits ajouteront des chemins (`home.*`, `health.*`) plus tard.

## 6. Données Firestore

```
// GLOBAL (super-admin)
products/{productId}              name, active, questionnaireSchema, guaranteeCatalog[]
insurers/{insurerId}              name, logo, extranetUrl, extranetDomains[], productsSupported[]
guaranteeSynonyms/{productId}     { "bris de glace": "BDG", ... }
formMemories/{memoryKey}          origin, formFingerprint, version,
                                  fields[]{fieldKey,label,type,order,canonicalPath,confidence},
                                  hits, lastUsedAt        // structure seulement, AUCUNE donnée client
extensionReports/{id}             insurerId, origin, step, issue, at   // AUCUNE donnée client

// PAR CABINET
tenants/{tenantId}                name, orias, address, phone, email, logoPath, active,
                                  enabledInsurers[], enabledProducts[]
tenants/{t}/members/{uid}         email, displayName, role, status
tenants/{t}/invitations/{id}      email, role, expiresAt, status
tenants/{t}/counters/dossiers     value
tenants/{t}/assures/{id}          type, civilite, firstName, lastName, birthDate, email, phone, address{}
tenants/{t}/dossiers/{id}
    reference, assureId, productId, assignedTo, status,
    data{}                         // valeurs par canonicalPath
    completeness{ ok, missing[] },
    needAnalysis{ coverageLevel, budgetMax, maxDeductible, mandatoryGuarantees[], niceToHave[], notes, validatedAt },
    decision{ insurerId, justification, decidedBy, decidedAt },
    proposal{ sentAt, sentTo }, outcome{ result, contractNumber, effectiveDate }
  /quoteJobs/{insurerId}           status, ownerUid, quoteData{}, missingFields[], currentStep, totalSteps, error, attempts
  /offers/{insurerId}              quoteNumber, premiumAnnual, premiumMonthly, deductibles{},
                                   guarantees[]{code,label,included,limit,deductible}, exclusions[],
                                   source: auto|manual, gaps[], score
  /documents/{id}                  type, storagePath, ocrFields[], status
  /events/{id}                     type, by, at, data     // historique non modifiable
```

## 7. Statuts

**Dossier :** `brouillon → complet → besoin_validé → tarification → comparaison → décision → proposition_envoyée → souscrit | refusé | sans_suite`

**Job de tarification (un par assureur) :** `requested → analyzing → needs_info ⇄ filling → awaiting_submit → captured | failed`

## 8. Flux de tarification

1. **Connexion** : App → Function `createExtensionToken` → message → Extension → `signInWithCustomToken`.
2. **Lancer** : le courtier clique « Tarifer chez A » → l'app écrit `quoteJobs/A {requested, quoteData}` et ouvre l'extranet.
3. **Analyser** : l'extension détecte la page → mémoire partagée connue ? → mapping immédiat ; sinon DOM + synonymes + scoring → IA via proxy si doute → sauvegarde dans `formMemories`.
4. **Compléter** : champs requis absents → `{needs_info, missingFields}` → l'app affiche un formulaire → le courtier répond → l'extension reprend.
5. **Remplir** : étape par étape → `{filling, currentStep}` → `{awaiting_submit}`. **C'est le courtier qui soumet** sur l'extranet, jamais l'extension.
6. **Capturer** : page résultat → l'extension écrit `offers/A` → `{captured}`. En cas d'échec → `{failed}` → relance ou **saisie manuelle** dans l'app.
7. **Comparer** : une Function calcule les écarts → tableau côte à côte → choix + justification obligatoire.
8. **Proposer** : email à l'assuré → suivi → souscrit / refusé.

**Mémoire partagée des formulaires** : la structure d'un extranet apprise une fois sert à **tous les cabinets** (pas d'appel IA répété). Invalidation par empreinte du formulaire si l'extranet change.

## 9. Sécurité

- Isolation des cabinets : tout accès à `tenants/{t}` exige `request.auth.token.tenantId == t`.
- Claims posés **uniquement** par les Functions.
- Extension : même identité que le courtier ; elle n'écrit que le statut du job, les offres et `formMemories`.
- `formMemories` et `extensionReports` : jamais de donnée client.
- `events` : création seule, ni modification ni suppression.
- Clé IA uniquement côté Function, avec limite d'appels par cabinet.
- L'extension ne soumet jamais seule et ne stocke aucun identifiant d'extranet.

## 10. Écrans

**Cabinet** : connexion · tableau de bord · liste des dossiers · stepper « Nouveau dossier » (assuré → produit → questionnaire → récapitulatif) · détail du dossier (onglets Infos, Besoin, Tarification, Comparatif, Proposition et suivi, Historique) · assurés · paramètres (cabinet, membres, assureurs et produits actifs).

**Super-admin** : cabinets · produits et questionnaires · garanties et synonymes · assureurs · monitoring de l'extension.

## 11. Cloud Functions

`createTenant` · `inviteMember` / `acceptInvitation` · `setMemberRole` / `setMemberStatus` · `createExtensionToken` · `aiProxy` · `onDossierCreate` (référence `2026-000123`) · `onDossierWrite` (complétude, transitions, historique) · `onOfferWrite` (normalisation des garanties, écarts, score) · `sendProposal` · `dailyReminders`.

## 12. Extension existante de référence

Une première version existe dans `C:\Users\AIBS\extension\chrome-extension` (« AutoFill Courtier »).
On **réutilise ses idées** : analyse DOM, synonymes, score de confiance, repli IA, mémoire structurelle des formulaires, modèle canonique fermé, étape « champs manquants », OCR de documents, règle « ne jamais inventer ».
On **change** : communication via Firestore (et non plus par messages), mémoire **partagée** dans Firestore (et non plus locale), IA via proxy (plus de clé dans l'extension), et **ajout de la capture du tarif** (absente de la v1).

## 13. Backlog (16 Epics, pas de stories)

| Epic | Contenu | Sprint |
|---|---|---|
| E0 · Fondations | Projet Angular, Firebase + emulators, extension MV3, types partagés, layout | S1 |
| E1 · Cabinets et utilisateurs | Connexion, guards par rôle, `createTenant`, règles d'isolation, invitations, rôles, paramètres, liste des cabinets | S1–S2 |
| E2 · Catalogue | Format JSON du questionnaire, seed Auto + 3 assureurs, CRUD produits / garanties / assureurs | S2 |
| E3 · Assurés | Création, liste et recherche, fiche, doublons | S3 |
| E4 · Dossiers | Stepper, questionnaire dynamique, brouillon auto, complétude, référence, liste, détail, machine à états, historique, assignation, `quoteData` | S3–S4 |
| E5 · Analyse du besoin | Formulaire, validation, suggestions | S4 |
| E6 · Connexion de l'extension | `createExtensionToken`, détection, session, règles, side panel, `aiProxy` | S5 |
| E7 · Mapping et remplissage | Écoute des jobs, analyse DOM, synonymes et scoring, repli IA, champs manquants, remplissage, multi-étapes, side panel | S5–S6 |
| E8 · Mémoire partagée | `formMemories` : lecture, écriture, invalidation, gestion super-admin | S6, S8 |
| E9 · Tarification dans l'app | Onglet tarification, bouton Tarifer, champs manquants, relance, saisie manuelle | S5–S7 |
| E10 · Capture du tarif | Page résultat, extraction, confirmation, rapport d'échec | S7 |
| E11 · Les 3 assureurs réels | Assureurs A, B, C de bout en bout, monitoring | S7–S8 |
| E12 · Documents et OCR | Upload, OCR, pré-remplissage avec confirmation | S11 |
| E13 · Comparatif et décision | Normalisation, écarts, tableau, choix justifié, score | S9 |
| E14 · Proposition et suivi | Email, réponse, souscription, relances | S10 |
| E15 · Tableau de bord | Compteurs, mes dossiers, taux de transformation | S10 |

**Sprints de 2 semaines (S1 → S11). MVP à la fin de S10.** Un **spike extension** de 3 jours est prévu en S2 sur l'extranet de l'assureur A, pour valider la faisabilité tôt.

**Unité de travail = l'Epic.** Pas de découpage en stories : chaque Epic est une issue GitHub, développée sur une branche et livrée par une PR.

**Estimation** : développeur junior aidé d'agents IA → **environ 6 à 7 mois** pour le MVP (5 en optimiste, 8–9 en pessimiste).

## 14. GitHub

- Repo : **`dhiamockchahasg-coder/courtier-intelligent`** (privé).
- Branches : `main` (production, protégée) · `develop` (intégration, protégée) · `feature/<Epic>-<description>`.
- Règle : **un Epic = une branche (`feature/E0-fondations`) = une PR vers `develop`** ; fin de sprint = PR `develop → main` + release `v0.X`.
- Commits : `feat(E4): …`, `fix(E7): …`, `chore: …`, `docs: …`.
- Labels : `epic`, `spike`, `bug`, `P1`/`P2`/`P3`, `app`, `extension`, `functions`, `firestore`, `E0`…`E15`.
- Milestones : `S1` … `S11`.
- Les 16 Epics sont les seuls items du board (pas de sub-issues).
- GitHub Project **« Courtier Intelligent »**, vue Board « Kanban » avec 4 colonnes : **Backlog → Todo → In Progress → Done**.
- Configuration faite **manuellement** dans l'interface GitHub (choix du porteur de projet).

## 15. État actuel (06/10/2026)

- ✅ Plan, architecture et backlog validés.
- ✅ Repo GitHub `courtier-intelligent` créé.
- ✅ GitHub Project créé, avec les 4 colonnes et la vue Kanban.
- ✅ 16 Epics créés en issues (#1 à #20, quelques numéros sautés).
- ⏳ À faire : protection des branches, puis **démarrer S1**.

## 16. Préférences du porteur de projet

- Développeur **junior** : explications simples, étape par étape.
- Échanges en **français**.
- Préfère des plans **épurés**, centrés sur l'essentiel ; ne pas ajouter de sujets hors périmètre (voir section 3).
- Veut des noms **dans une seule langue** (d'où « Courtier Intelligent »).
