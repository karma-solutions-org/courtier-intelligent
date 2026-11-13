# Architecture — Courtier Intelligent (Angular 22 + SignalStore)

> À lire avant d'écrire du code. Ces règles priment sur les habitudes par défaut. Demander avant de s'en écarter.
>
> Structure reprise de `aibs-partenaire-web-and-desktop` (`core/` + `main/<zone>/<feature>-module/`, container / presentation, `*.structure.ts`, providers), avec **NgRx SignalStore à la place de NgRx classique** et **sans Electron**.

## 1. Stack

| Couche | Choix |
|---|---|
| Framework | **Angular 22** : standalone, zoneless, OnPush, TypeScript strict |
| État | **NgRx SignalStore** (`@ngrx/signals`, `@ngrx/signals/entities`, `@ngrx/signals/rxjs-interop`) |
| Async | `rxMethod()` pour les flux Firestore temps réel et les écritures ; `resource()` pour une lecture ponctuelle |
| UI | **Angular Material** + SCSS ; composants partagés du projet dans `core/components/` (`app-card`, `app-table`, `app-logo`, `app-confirm-dialog`) |
| Backend | **Firebase** (Auth, Firestore, Functions, Storage) via le **SDK `firebase`**, **derrière nos providers** (`core/providers/`, même rôle que `ngx-sg`) |
| Bibliothèque interne | **`@karma-solutions-org/ngx-sg` 24** (installée, registre GitHub `@karma-solutions-org`). Elle ne contient plus de cartes ni de tableaux : seulement des providers Firebase, des features SignalStore (`withRequestStatus`, `withLoad`, `withWrite`, `withLivePages`) et un sélecteur de documents. À n'utiliser qu'après accord, à la place d'un équivalent de `core/` |
| Locale | `fr-FR` |

**Interdit dans le code :**
- `@ngrx/store`, `@ngrx/effects`, `@ngrx/router-store` (`createAction`, `createReducer`, `createEffect`, `createSelector`, `provideState`, `provideEffects`) ;
- `NgModule`, `zone.js` ;
- `*ngIf` / `*ngFor` ;
- `@Input` / `@Output` / `@ViewChild` ;
- l'injection par constructeur ;
- `subscribe()` manuel dans un composant ;
- un import de `firebase/*` en dehors de `core/providers/` ; `@angular/fire` ;
- un `template:` ou des `styles:` dans le `.ts` d'un composant (toujours `templateUrl` + `styleUrl`).

## 2. Couches et règle de dépendance

```
container (page) → store → service → provider (DatabaseProvider, AuthenticationProvider…) → Firebase
       ↓
presentation (dumb)
```

- Un **presentation component** ne reçoit que des `input()` et émet des `output()`. Il n'injecte rien.
- Un **container component** injecte des stores, jamais un service ni un provider.
- Un **store** injecte des services, jamais un provider directement.
- Un **service** est le seul à parler aux providers (`DatabaseProvider`, `StorageProvider`, `BackendProvider`, `AuthenticationProvider`).
- `core/` ne dépend jamais de `main/`, sauf `core/routing`, qui charge les composants en lazy.

## 3. Structure des dossiers

```
app/src/app/
├── app.config.ts
├── core/
│   ├── routing/
│   │   ├── routes.ts                         # routes racines (lazy par zone)
│   │   ├── common-routes/                    # common.routes.ts + common-route-container.model.ts
│   │   ├── cabinet-routes/                   # cabinet.routes.ts + cabinet-route-container.model.ts
│   │   ├── guards/                           # auth.guard.ts, role.guard.ts (fonctionnels, canMatch)
│   │   └── matcher/                          # matchers d'URL si besoin
│   ├── components/                           # composants transverses, même découpage que les modules
│   │   ├── card/card-presentation/           # <app-card heading subtitle [padded]> + slot [cardActions]
│   │   ├── table/                            # <app-table [columns] [rows]> + gabarits appTableCell
│   │   │   ├── table-presentation/
│   │   │   ├── directives/table-cell.directive.ts
│   │   │   └── models/table-column.model.ts
│   │   ├── logo/logo-presentation/
│   │   └── confirm-dialog/                   # confirm-dialog-presentation/ + models/ + util/openConfirmDialog
│   ├── directives/                           # infinite-scroll, tab-query-param
│   ├── providers/                            # ports Firebase (seul endroit qui importe firebase/*)
│   ├── store-features/                       # signalStoreFeature réutilisables (withRequestStatus…)
│   └── utils/                                # backend-error.utils, outils de test…
└── main/
    ├── commons/                              # zone partagée
    │   ├── authentication-module/            # signin, signup, forget-password, accept-invitation, create-cabinet
    │   ├── main-module/                      # shell (sidebar, topbar), accueil, page introuvable
    │   ├── extension-module/                 # détection de l'extension Chrome (installée / absente)
    │   └── presentation-module/              # page d'accueil publique
    └── cabinet/                              # zone cabinet (admin + courtier)
        ├── dashboard-module/                 # tableau de bord
        ├── assures-module/                   # clients et leurs pièces
        ├── dossiers-module/                  # brouillon, détail, besoin, tarification, comparatif, proposition
        ├── settings-module/                  # cabinet, membres, catalogue, journal
        └── trash-module/                     # corbeille (admin)
```

### Anatomie d'un module

```
dossiers-module/
├── components/
│   ├── dossier-detail/
│   │   ├── dossier-detail-container/                    # smart : injecte les stores, aucun appel de service
│   │   │   ├── dossier-detail-container.component.ts
│   │   │   ├── dossier-detail-container.component.html
│   │   │   ├── dossier-detail-container.component.scss
│   │   │   └── dossier-detail-container.component.spec.ts
│   │   └── dossier-detail-presentation/                 # dumb : input() / output(), n'injecte rien
│   │       ├── dossier-detail-presentation.component.ts
│   │       ├── dossier-detail-presentation.component.html
│   │       ├── dossier-detail-presentation.component.scss
│   │       ├── dossier-detail-presentation.component.spec.ts
│   │       └── dossier-detail-presentation.component.structure.ts   # textes, colonnes, config UI
│   └── status-chip/
│       └── status-chip-presentation/                    # petit composant réutilisable : présentation seule
├── models/                                  # *.model.ts, *.enum.ts (modèles propres à l'UI)
├── services/
│   └── dossiers.service.ts                  # seul accès aux providers
├── store/
│   └── dossiers.store.ts                    # UN fichier SignalStore (remplace actions/reducer/effects/selectors)
└── util/
    └── dossiers.utils.ts
```

**Nommage :**
- un écran = un dossier `xxx/` contenant `xxx-container/` (smart) et `xxx-presentation/` (dumb) ;
- un petit composant réutilisable (puce, champ, boîte de dialogue simple) = `xxx/xxx-presentation/` seul ;
- chaque dossier de composant contient **4 fichiers** : `.ts`, `.html`, `.scss`, `.spec.ts` (+ `.structure.ts` si besoin) ;
- classes : `XxxContainerComponent`, `XxxPresentationComponent` ; sélecteurs préfixés `app-` ;
- `xxx.component.structure.ts` = textes et configuration de l'UI, sans aucune logique.

**Specs :** un `.spec.ts` encore sans test contient un `it.todo('à écrire')` : Vitest refuse un fichier sans aucun test.

## 4. Modèles partagés

Le modèle canonique (`client.*`, `vehicle.*`…), les statuts (dossier, job) et les types `Dossier`, `QuoteJob`, `Offer`, `FormMemory` vivent dans **`shared/`** à la racine du repo. Ils sont utilisés par l'app, l'extension et les Functions.

Les `models/` d'un module **importent** ces types ; ils ne les redéfinissent jamais. Seuls les modèles propres à l'UI vivent dans le module.

## 5. Stores (SignalStore)

**Portée :**

| Type de store | Où le fournir |
|---|---|
| Global (auth, session du cabinet, navbar, extension) | `providedIn: 'root'` |
| Feature | `providers` de la route du module |
| Composant (stepper, formulaire local) | `providers` du composant |

Toujours choisir la plus petite portée qui suffit.

```ts
export const DossiersStore = signalStore(
  withState({ filter: initialFilter, selectedId: null as string | null }),
  withEntities<Dossier>(),
  withRequestStatus(),                                   // core/store-features : isPending, error
  withComputed(({ entityMap, selectedId }) => ({
    selected: computed(() => (selectedId() ? entityMap()[selectedId()!] : null)),
  })),
  withMethods((store, service = inject(DossiersService), auth = inject(AuthStore)) => ({
    select: (id: string | null) => patchState(store, { selectedId: id }),
    // Flux temps réel Firestore
    listen: rxMethod<DossierFilter>(pipe(
      tap(filter => patchState(store, { filter }, setPending())),
      switchMap(filter => service.watchDossiers(auth.cabinetId()!, filter).pipe(tapResponse({
        next: dossiers => patchState(store, setAllEntities(dossiers), setFulfilled()),
        error: (e: Error) => patchState(store, setError(e.message)),
      }))),
    )),
    // Écriture
    create: rxMethod<NewDossier>(pipe(
      exhaustMap(input => service.create(auth.cabinetId()!, input).pipe(tapResponse({
        next: () => patchState(store, setFulfilled()),
        error: (e: Error) => patchState(store, setError(e.message)),
      }))),
    )),
  })),
  withHooks({ onInit: store => store.listen(store.filter) }),
);
```

**Règles :**
1. Seules les méthodes du store appellent `patchState`. Garder `protectedState` activé.
2. L'état contient des données simples et sérialisables ; tout ce qui est dérivé va dans `withComputed`.
3. Les effets de bord vivent dans `withMethods` / `withHooks`, jamais dans les composants.
4. `switchMap` pour les lectures et les flux, `exhaustMap` pour les écritures.
5. La logique réutilisable va dans un `signalStoreFeature()` sous `core/store-features/`.
6. Un store peut injecter un store de portée plus large (`AuthStore`), jamais un store de portée plus étroite.
7. Le `cabinetId` vient toujours de `AuthStore`, qui lit les claims ; il n'est jamais saisi ni passé par l'URL.

**Correspondance avec l'ancien projet (NgRx classique) :**

| `aibs-partenaire` (NgRx) | Courtier Intelligent (SignalStore) |
|---|---|
| `store/xxx.state.ts` + `reducer/` | `withState` + méthodes avec `patchState` |
| `store/xxx.actions.ts` + `dispatch` | méthodes du store |
| `selector/` | `withComputed` |
| `effects/` | `rxMethod` / `withHooks` |
| `provideState` / `provideEffects` dans les routes | store dans les `providers` de la route |
| router-store + `CustomRouterSerializer` | `withComponentInputBinding()` |

**Rôle de chaque couche (vérifié : aucun chemin Firestore ni appel de function hors des services) :**

| Couche | Fait | Ne fait jamais |
|---|---|---|
| Provider (`core/providers`) | parle au SDK Firebase | connaître un chemin métier |
| Service | chemins `ci_cabinets/{id}/…`, requêtes, appels de functions, conversion des documents | garder un état, afficher un message |
| Store | état, orchestration (file d'écritures, temps réel, pagination), messages | construire un chemin Firestore |
| Container / presentation | lier le store à l'écran / afficher | appeler un service |

**Taille d'un store :** au-delà de ~250 lignes, découper en `signalStoreFeature` dans `store/<nom>/` (une feature par
responsabilité, état commun dans `<nom>.state.ts`), comme `DossierStore` : `withDossierDerived`, `withDossierWrites`,
`withDossierSync`, `withDossierEvents`, `withDossierClosing`, `withClientPieces`. Le fichier `<nom>.store.ts` ne fait
plus que composer les features.

**Conventions ajoutées (refactor des stores) :**
- Un widget autonome a son propre store fourni par le composant (`providers: [XxxStore]`) : `TrashStore`,
  `DocumentImportStore`, `AssureDocumentImportStore`. Il peut injecter un store plus large (`DossierStore`, `AuthStore`).
- Message ponctuel (snackbar) : `withNotice()` (`core/store-features/with-notice.ts`) ; le store pose
  `setNotice(texte, durée)`, le container l'affiche dans un `effect` puis appelle `clearNotice()`. Le store ne connaît
  pas `MatSnackBar`.
- Résultat d'une boîte de dialogue : `await firstValueFrom(dialog.afterClosed())` dans une méthode `async` du container,
  jamais `.subscribe()`.
- Lectures réactives complexes reprises telles quelles d'un composant : `withProps` (membres préfixés `_`, privés au store).

## 6. Composants

- Utiliser `input()`, `output()`, `model()`, `viewChild()` et `inject()`.
- Utiliser `@if`, `@for` (toujours avec `track`), `@switch`, et `@defer` pour les blocs lourds (comparatif, tableaux).
- Les containers injectent les stores ; les composants de présentation n'injectent rien.
- Les textes de l'UI sont en français, dans les fichiers `*.structure.ts`. Les identifiants du code sont en anglais.

## 7. Services et providers

Les providers vivent dans `core/providers/`. Chaque port est une classe abstraite, liée à son implémentation Firebase dans `provideInfrastructure()` :

| Port (abstrait) | Implémentation |
|---|---|
| `AuthenticationProvider` | `FireauthProvider` (expose `user$` avec les claims `cabinetId` et `role`) |
| `DatabaseProvider` | `FirestoreProvider` (`watchDocument`, `watchCollection`, `add`, `set`, `update`, `delete`) |
| `BackendProvider` | `FirebaseFunctionsProvider` (`call(name, data)`) |
| `StorageProvider` | `FirestorageProvider` (`upload`, `getUrl`, `delete`) |

```ts
// app.config.ts
provideBrowserGlobalErrorListeners(),
provideRouter(ROUTES, withComponentInputBinding()),
provideInfrastructure(),
{ provide: LOCALE_ID, useValue: "fr-FR" },
```

Le SDK est initialisé une seule fois dans `core/providers/firebase.ts`. `environment.useEmulators` bascule vers les emulators locaux.

Aucun `provideStore`, `provideState` ni `provideEffects`.

- Un service par module (`xxx.service.ts`, `providedIn: 'root'`). Il ne retourne que des `Observable` typés.
- **Modèle entité** (même principe que `ReclamationModel` d'aibs-partenaire) : chaque collection a un modèle avec
  `fromMap` (reconstruit le document lu) et `entity` (chemin de la collection ; une fonction des parents pour une
  sous-collection). Entité utilisée par plusieurs modules (cabinet, membre, client, dossier, produit, assureur) :
  `core/entities/` ; entité propre à un module (historique, documents, offres, invitations…) :
  `<module>/models/entities/` :

  ```ts
  export const DossierModel = {
    fromMap,
    entity: (cabinetId: string) => databaseEntity(`ci_cabinets/${cabinetId}/ci_dossiers`, fromMap),
  };
  ```
- Le service passe l'entité et une requête construite, jamais un chemin écrit à la main :

  ```ts
  this._database.list(DossierModel.entity(cabinetId),
    new DatabaseQueryBuilder().orderBy('createdAt', OrderByDirection.desc).limit(20).build());
  this._database.watchById(DossierModel.entity(cabinetId), dossierId);
  ```
  (`DatabaseProvider` : `watchById`, `list`, `listByIds`, `updateById`. Les méthodes par chemin sont `protected` : un
  chemin écrit à la main hors des providers ne compile pas.)
- Les chemins Firestore sont **toujours** préfixés par `cabinets/{cabinetId}/…`, sauf pour le catalogue global.
- Les appels aux Cloud Functions passent par `BackendProvider`.

## 8. Routing

- Chaque zone (`commons`, `cabinet`) et chaque module sont chargés en lazy.
- Chaque zone a un `xxx-route-container.model.ts` qui centralise ses chemins (comme `BackOfficeRouteContainerModel`).
- Les guards sont fonctionnels, avec `canMatch` : `authGuard`, puis `roleGuard('admin' | 'courtier')`. Le code d'une zone non autorisée n'est jamais téléchargé.
- Les paramètres de route sont liés aux `input()` grâce à `withComponentInputBinding()`.
- Le store d'un module est fourni dans les `providers` de sa route.

```ts
{
  path: CabinetRouteContainerModel.DOSSIERS_ROUTE.path,
  loadComponent: () => import('../../../main/cabinet/dossiers-module/components/dossiers-container/dossiers-container.component')
    .then(c => c.DossiersContainerComponent),
  providers: [DossiersStore],
}
```

## 9. Extension Chrome

- `main/commons/extension-module/` contient un `ExtensionService`, qui détecte si l'extension est installée (message `PING`).
- Connexion de l'extension : l'app obtient un jeton de la function `sessions-emettreJetonExtension` et l'envoie à l'extension (message `CONNECT`, via `core/providers/extension.provider.ts`). C'est le seul échange direct.
- Ensuite, l'app ne parle **jamais** directement à l'extension : tout passe par Firestore (`ci_quoteJobs`, `ci_offers`), écouté en temps réel par `PricingStore`.

## 10. Règles pour les agents IA

1. Respecter strictement les sections 1, 2, 3 et 5.
2. Placer le nouveau code là où l'indique la section 3 ; demander en cas de doute.
3. Un module = `components/` (container + presentation) + `models/` + `services/` + `store/` + `util/`.
4. Ne jamais redéfinir un type qui existe dans `shared/`.
5. Ne pas modifier les dépendances, la configuration de build ni les règles de sécurité sans qu'on le demande.
6. Signaler toute API Angular expérimentale utilisée (par exemple Signal Forms).
