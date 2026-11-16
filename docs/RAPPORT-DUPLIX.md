# Rapport : Courtier Intelligent face à Duplix

_21 octobre 2026. Analyse des dépôts `courtier-intelligent` (front et extension) et `courtier-intelligent-back` (Cloud Functions), et recherche publique sur duplix.io._

---

## 1. Duplix en bref

### Identité
- **Société** : Duplix est édité par WONDAIRFUL SAS (Neuilly-sur-Seine, à l'origine Fréjus), créée en mars 2021 par deux courtiers.
- **Dirigeants** : Cyril Renou (Président) et Hervé Massié (DG, cofondateur de Wazari).
- **Financement** : le site indique « soutenu par Bpifrance ». Aucune levée de fonds publique.
- **Taille annoncée** : environ 1 000 à 1 500 utilisateurs.

### Proposition de valeur
Le slogan est « une saisie, vos compagnies ». Duplix se présente comme un **automate de saisie**, « ni comparateur ni CRM ».

1. Le courtier remplit **un formulaire unique** dans app.duplix.io (auto : plus de 30 champs).
2. Il choisit les assureurs dont il a déjà les **codes partenaires**.
3. L'**extension Chrome** ouvre chaque extranet, sur lequel le courtier est déjà connecté. Elle remplit environ 85 % des champs en quelques secondes. Duplix ne stocke **jamais** les identifiants extranet.
4. Le courtier vérifie, complète et enregistre le devis sur l'extranet.
5. Duplix affiche un **tableau comparatif** :
   - prime, franchise, frais, commission et garanties, souvent 3 formules par assureur ;
   - meilleure offre surlignée ;
   - vue « client » ou vue « complète » ;
   - fractionnement mensuel, trimestriel ou annuel ;
   - bouton « envoyer au prospect ».
6. Chaque tarification est **horodatée et archivée** comme preuve de conseil.
7. Au renouvellement, le courtier **re-tarifie** sans ressaisie (devoir de suivi ACPR 2024-R-03).

### Fonctions autour du cœur

| Fonction | Contenu |
|---|---|
| Hub client | Prospect, client, ancien client ; relances ; e-mail et téléphonie intégrés ; tableau de bord gamifié (« niveau DupliXer ») |
| GED | Pièces typées et datées automatiquement (« Pas de trace, pas de preuve ») |
| Pack Conformité (oct. 2025) | Règle des 3 devis tracée automatiquement ; 7 documents ACPR pré-remplis aux couleurs du cabinet (DER, FIL, réclamations, recueil des besoins, fiche RGPD, FIC, fiche de devoir de conseil) ; 15 h de formation DDA Qualiopi incluses |
| Palmarès et Duplix Data | Baromètre trimestriel des tarifs auto, et **revente aux assureurs** d'une base anonymisée d'environ 500 000 tarifs réels. C'est un second modèle économique |

### Branches et assureurs
- **Couverts** : auto (particuliers et pros) et RC décennale.
- **En préparation** : MRH et deux-roues.
- **Absents** : santé, prévoyance, emprunteur.
- **Assureurs annoncés** : 15 en auto (NetVox, Apivia, AXA, Generali, April, Solly Azar, Spring, Zephir, Maxance, Oyat, etc.) et 6 en décennale. Ce sont surtout des grossistes.

### Prix et confiance
- **Prix** : 49 € TTC par mois sans engagement, ou 489 € par an, contrats et devis illimités. Pas d'essai gratuit : démo visio de 15 minutes.
- **Hébergement** : OVH, en France.
- **Confiance** : discours « créé par des courtiers, 100 % français, indépendant ».

### Points faibles de Duplix
- **Pas d'IA** : ni OCR, ni extraction de documents, ni lecture intelligente des extranets.
- **Pas de signature électronique, de KYC ni de LCB-FT** opérationnel.
- Remplissage partiel (85 %) : il reste du travail manuel sur chaque extranet.
- Panel limité à **2 branches**.
- Des concurrents plus récents se positionnent comme « agents IA » : Coverbay, Aeliam, Panora.

> **Conclusion** : Duplix gagne grâce à **la couverture d'assureurs réels, la simplicité et la conformité**, pas grâce à la technologie. Votre application est déjà en avance techniquement (IA, OCR, mémoire de formulaires). Elle est en retard sur la **couverture réelle**, la **conformité** et le **produit commercial**.

---

## 2. Où en est Courtier Intelligent par rapport à Duplix

| Capacité | Duplix | Courtier Intelligent | Écart |
|---|---|---|---|
| Formulaire unique et questionnaire | Oui, statique (auto et décennale) | **Oui, dynamique** (schéma JSON, conditions, sauvegarde automatique) | En avance |
| Extension qui remplit les extranets | Oui, scripts maintenus à la main | **Oui, moteur générique** : synonymes, mémoire partagée, repli IA, lecture de mise en page | En avance techniquement |
| Assureurs réels pris en charge | 21 | **0 en production** : 3 extranets de démo, plus des sondes Oyat | **Écart majeur** |
| Branches | Auto et décennale | Auto (habitation seulement via les chemins `extra.*`) | À étendre |
| Capture du tarif | Le courtier enregistre le devis | Capture automatique, repli IA, confirmation dans le panneau | En avance |
| Saisie manuelle d'une offre | Oui | **Supprimée côté front** (le back `tarification-saisirOffre` existe) | À corriger |
| Comparatif | Primes, frais, commission, formules, fractionnement, vue client | Score, écarts avec le besoin, garanties normalisées | Ajouter les formules, la commission et le fractionnement |
| Proposition au client | Envoi au prospect | Email HTML avec mentions ORIAS et ACPR | Ajouter un PDF |
| OCR et IA sur les documents | Non | **Oui** : CIN, Kbis, carte grise, permis, relevé d'information, détection du type | En avance |
| Preuve « 3 devis » horodatée | Oui | Événements `ci_events` et snapshots, mais pas de rapport de preuve | À ajouter |
| Documents réglementaires (DER, FIC, devoir de conseil…) | 7 documents pré-remplis | **Absents** (aucune génération PDF) | **Écart majeur** |
| Re-tarification au renouvellement | Oui | Non : pas d'entité contrat, pas de tâche planifiée | À ajouter |
| CRM, relances | Basique | Fiche client et dossiers, sans relances | À ajouter |
| Signature électronique | Non | Non | Opportunité de dépasser Duplix |
| Abonnement et paiement | Stripe, 49 € | Offres en JSON, sans paiement | À ajouter |
| Multi-postes et rôles | Admin, salarié, commercial | Admin et courtier, session unique, invitations, journal d'audit | Équivalent |

---

## 3. Ce qu'il faut CORRIGER

Les points sont classés par priorité. Pour chacun : l'emplacement dans le code, puis le problème.

### P0 : sécurité (avant tout utilisateur réel)

1. **Le catalogue commun peut être modifié par n'importe quel cabinet**
   - Où : back `functions/src/champs/champs.callable.ts:93-114`.
   - Problème : `champs-signaler` ajoute des questions et des `insurerRequiredPaths` au produit **global** `ci_products`, partagé par tous les cabinets. Le seul garde-fou est l'`origin`, envoyé par le client.
   - Correction : écrire seulement dans `ci_cabinets/{c}/…` ou dans une file de **propositions validées par un admin**.

2. **La mémoire commune des formulaires peut être empoisonnée**
   - Où : back `memoires.callable.ts:52-117` et `:152`.
   - Problème : 2 cabinets suffisent pour promouvoir ou invalider une mémoire pour tous.
   - Correction : relever le seuil, pondérer selon l'ancienneté des cabinets, ajouter une revue manuelle.

3. **`ia-proxy` sert de proxy IA généraliste**
   - Où : back `ia/ia.callable.ts:18-60`.
   - Problème : le prompt `system` vient du client.
   - Correction : envoyer un `purpose` (mapping, layout, capture) et choisir le prompt **côté serveur**. Ajouter une limite par minute et compter les tokens.

4. **Les identifiants dans les chemins Firestore ne sont pas validés**
   - Où : back `core/auth.utils.ts:109`.
   - Correction : refuser les `/` dans `requireString`, ou créer un `requireId()`.

5. **Destinataires et liens d'email libres**
   - Où : back `equipe.callable.ts:39` et `propositions.callable.ts:33`.
   - Problème : `appUrl` est fourni par le client, le destinataire `to` est libre.
   - Correction : fixer l'URL côté serveur, et envoyer la proposition à l'email de l'assuré.

6. **Les règles Firestore divergent**
   - Où : front `firestore.courtier-intelligent.rules`, celle qui est testée.
   - Problème : elle est en retard sur `docs/regles-console-courtier-intelligent.rules` et sur le back. Elle autorise par exemple la création et la suppression directes de `ci_assures`.
   - Correction : **garder une seule source** (le back) et faire porter les `rules-tests` sur cette version.

7. **L'extension a accès à tous les sites**
   - Où : `extension/manifest.json:7-10`, `host_permissions: https://*/*`.
   - Problème : c'est trop large pour le Chrome Web Store et inquiétant pour les courtiers.
   - Correction : revenir à `optional_host_permissions`, demandées par domaine d'assureur.

8. **Les règles Storage sont incomplètes**
   - Où : back `storage.rules:11-17`.
   - Problème : ni le statut actif ni la période de grâce ne sont vérifiés.

9. **Les données personnelles sont mélangées avec les autres applications**
   - Problème : le cluster Elasticsearch est partagé avec CompliScan, et les collections des autres apps sont en `if true` sur la même base. Le catalogue est lisible par tous les comptes du projet.
   - Rappel : ces règles des autres apps sont hors périmètre. Il faut quand même le **signaler** et prévoir des index dédiés.

### P1 : bugs et fonctionnalités cassées

1. **La saisie manuelle d'une offre a disparu du front**
   - Problème : `manual-offer-dialog` a été supprimé dans le commit a06de29. Pourtant l'UI la promet (`comparison-tab.structure.ts:4`, landing `:75`), et le back `tarification-saisirOffre` existe.
   - Correction : **réintroduire le dialogue**. C'est indispensable tant que l'extension ne couvre pas tous les assureurs.

2. **`equipe-reinitialiserAppareil` échoue toujours**
   - Où : back `equipe.callable.ts:254` et `ops/reset-device.ts:41`.
   - Problème : la fonction exige `member.device`, qui n'est plus jamais écrit depuis le passage à la session unique.
   - Correction : réinitialiser `session`, ou supprimer la fonctionnalité de l'UI.

3. **Quotas d'offres incohérents**
   - Où : back `catalog/plans/*.json` et `shared/limits.ts:8`.
   - Problème : l'offre `essentiel` a 10 000 appels IA, `cabinet` 1 000 et `reseau` 5 000. Le repli est à 10 000.

4. **Le quota IA n'est pas rendu en cas d'exception**
   - Où : back `documents.callable.ts:146-167`, `lirePiece`, `reconnaitrePiece`.
   - Correction : ajouter un `try/finally`. Factoriser au passage le flux « réserver, appeler Gemini, rendre », copié 4 fois.

5. **Le fichier est téléchargé avant la réservation du quota**
   - Où : back `documents.callable.ts:140`.
   - Correction : réserver le quota d'abord.

6. **`reprendrePiecesClient` peut dupliquer les pièces**
   - Problème : deux appels simultanés peuvent copier les mêmes pièces.
   - Correction : rendre l'opération idempotente, avec une clé par pièce source.

7. **`extensionId` est vide en production**
   - Où : front `app/src/environments/environment.ts:9`.
   - Problème : la connexion automatique de l'extension ne fonctionne pas sur l'environnement hébergé.

8. **Suggestion de besoin limitée au produit `auto`**
   - Où : `shared/need.ts:146`.
   - Problème : les copies de produit par un cabinet (`cab-…`) n'ont pas de suggestion.

9. **Les prompts IA de l'extension parlent toujours d'« assurance auto »**
   - Où : `ai-fallback.ts:30` et `capture-ai.ts:21`.
   - Correction : passer la branche du produit en paramètre.

### P2 : qualité, CI et maintenabilité

1. **La CI du front ne fonctionne pas**
   - Problème : les workflows ont été copiés d'un autre dépôt. Il n'y a pas de `package.json` ni de `.nvmrc` à la racine, et le README pointe vers `karma-solutions-org/...`.
2. **Le déploiement de production vise `aibs-part`**
   - Problème : ce projet n'existe pas, le seul projet est `aibs-partenaire-testing`. C'est le cas à la fois dans `deploy.yml` du front et dans celui du back.
3. **La CI du back ne lance que les tests de règles**
   - Correction : ajouter les tests unitaires et d'intégration, qui existent déjà, comme condition au déploiement.
4. **Pas d'ESLint dans l'app.**
   - Les versions de TypeScript divergent : 6.0 pour l'app, 7.0 pour l'extension. `rules-tests` utilise firebase 11 et vitest 2.
5. **L'architecture déclarée n'est pas respectée**
   - Des containers injectent des services et font des `subscribe()` manuels.
   - Exemples : `trash-container`, `dossier-detail-container`, `document-import-container`.
   - Il y a des fichiers énormes de 600 à 800 lignes, avec styles inline au-delà du budget de 4 ko.
6. **Erreurs avalées en silence**
   - Où : `catchError(() => EMPTY)` et `.catch(() => undefined)` dans le front, l'extension et les triggers Elasticsearch.
   - Il n'y a ni logger commun ni identifiant de corrélation.
7. **Code mort et documentation périmée**
   - Code mort :
     - `under-construction` ;
     - `shared/vehicle-lookup.ts` et `appelsPlaqueParMois` ;
     - `extraDevices` et `maxAppareilsParUtilisateur` ;
     - le parcours « Donner l'accès » de l'extension ;
     - `functions/lib/` obsolète.
   - Documentation : les README du front, du back et de l'extension sont périmés (dossier `functions/` absent, « pas d'iframes », nombre de tests).
8. **Performance Elasticsearch**
   - Problème : `refresh: true` à chaque écriture, et `query_string` avec `*token*`.
9. **Workflow git**
   - Problème : tout est commité sur `develop`, avec des messages de commit vagues. Par exemple, « add node_modules » cache la suppression d'une fonctionnalité.
10. **Menu** : pas d'entrée « Dossiers » dans la navigation.

---

## 4. Ce qu'il faut AJOUTER pour égaler Duplix, puis le dépasser

### A. Pour égaler Duplix (indispensable pour vendre)

1. **Assureurs réels**
   - C'est l'actif n°1 de Duplix.
   - Viser d'abord 5 à 8 extranets auto, en commençant par ceux de la liste Duplix qui sont accessibles aux courtiers : Oyat (déjà sondé), April, Solly Azar, NetVox, Zephir, Maxance, Apivia.
   - Pour chacun :
     - fiche `ci_insurers` avec `extranetDomains` ;
     - fixtures et tests de non-régression ;
     - mémoire de formulaire validée.
   - Prévoir une **surveillance des extranets** : rapport `ci_extensionReports` et alerte quand le taux de remplissage baisse.
2. **Comparatif « métier »**
   - Plusieurs formules par assureur.
   - Prime, franchise, frais de dossier et **commission courtier**.
   - **Fractionnement** (mensuel, trimestriel, annuel).
   - Meilleure offre mise en avant.
   - Vue client sans la commission et vue complète.
3. **Pack conformité**
   - Génération **PDF** aux couleurs du cabinet, à partir des données déjà saisies :
     - DER et fiche d'information légale ;
     - recueil des besoins (vous avez déjà `needAnalysis`) ;
     - FIC ou comparatif ;
     - **fiche de devoir de conseil** (vous avez déjà `decision.justification`) ;
     - mention RGPD.
   - **Rapport de preuve « 3 devis »** : assureurs interrogés, date et heure, snapshot du besoin et des offres. Vos `ci_events` et snapshots contiennent déjà tout.
   - Archivage non modifiable des PDF dans Storage.
4. **Entité Contrat et re-tarification**
   - Créer `ci_contrats` lors de la souscription : assureur, numéro, date d'effet, échéance, prime.
   - Ajouter une tâche planifiée (Cloud Scheduler) qui crée des alertes d'échéance à J-60 et J-30.
   - Ajouter un bouton « re-tarifier » qui clone le dossier sans ressaisie.
5. **Saisie manuelle d'offre**, avec import du PDF de devis lu par l'IA (voir B.1).
6. **Abonnement**
   - Stripe : offres, essai gratuit, portail client, application des quotas.
   - Page tarifs publique.
   - Landing sans maquettes factices.
7. **Deuxième branche** : décennale ou MRH, avec un vrai questionnaire produit et des prompts selon la branche.

### B. Pour dépasser Duplix (l'IA est votre avantage)

1. **Lecture IA des devis PDF des assureurs**
   - Le courtier dépose le PDF, et l'offre normalisée est créée automatiquement.
   - Utile pour les assureurs non couverts par l'extension. Duplix ne sait pas le faire.
2. **Dossier pré-rempli depuis les pièces**
   - Carte grise, permis et relevé d'information donnent un questionnaire rempli à plus de 80 % avant même la tarification. C'est déjà en grande partie fait : à mettre en avant.
3. **Taux de remplissage visé supérieur à 85 %**
   - S'appuyer sur la mémoire partagée et la lecture de mise en page par IA.
   - Afficher ce taux par assureur dans un tableau de bord.
4. **Signature électronique** de la proposition et des documents de conseil (Yousign ou Docusign).
5. **Conformité étendue** : KYC et LCB-FT (vérification de pièce d'identité par OCR, PPE et gel des avoirs). Vous avez déjà l'OCR de la CIN et du Kbis.
6. **Portail client** : lien sécurisé pour déposer les pièces, consulter la proposition et la signer.
7. **CRM léger** : relances, tâches, statut prospect, client ou ancien client, et e-mails envoyés.
8. **Données marché**, plus tard : statistiques anonymisées des tarifs capturés. Attention au RGPD et au consentement des cabinets.

---

## 5. Feuille de route proposée

| Phase | Durée indicative | Contenu |
|---|---|---|
| **1. Assainir** | 1 à 2 semaines | Sécurité P0 (points 1 à 7) ; corriger la CI et la cible de déploiement ; source unique des règles ; réintroduire la saisie manuelle d'offre ; bug de réinitialisation d'appareil ; quotas |
| **2. Rendre vendable** | 4 à 6 semaines | 5 extranets auto réels avec tests ; comparatif métier (formules, commission, fractionnement) ; PDF de conseil et preuve « 3 devis » ; entité Contrat |
| **3. Monétiser** | 2 à 3 semaines | Stripe et offres ; landing réelle ; onboarding avec installation guidée de l'extension ; publication sur le Chrome Web Store (permissions par domaine) |
| **4. Se différencier** | En continu | Lecture IA des devis PDF ; signature électronique ; renouvellements automatiques ; 2e branche (décennale ou MRH) ; KYC et LCB-FT ; portail client |

---

## Sources principales (Duplix)

- https://duplix.io/, /solution, /duplixauto, /tarifs, /conformite, /ressources (FAQ), /le-groupe, /palmares, /cgv, /mentions-legales, /politique-de-confidentialite, https://data.duplix.io/
- Chrome Web Store : https://chromewebstore.google.com/detail/duplix/mdeeelggfddnkamdbdcjppllafmmibpn
- L'Assurance en Mouvement (déc. 2023, juin 2024) ; Option Finance (déc. 2025, janv. 2026) ; Aeliam (comparatif « tarifer plusieurs compagnies »)
- Limite : les articles de l'Argus et de la Tribune n'ont pas pu être lus (erreur 403). Aucun avis indépendant sur Duplix n'a été trouvé.
