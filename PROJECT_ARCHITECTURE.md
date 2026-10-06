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
| UI | **Angular Material** + SCSS |
| Backend | **Firebase** (Auth, Firestore, Functions, Storage) via le **SDK `firebase`**, **derrière nos providers** (`core/providers/`, même rôle que `ngx-sg`) |
| Locale | `fr-FR` |

**Interdit dans le code :**
- `@ngrx/store`, `@ngrx/effects`, `@ngrx/router-store` (`createAction`, `createReducer`, `createEffect`, `createSelector`, `provideState`, `provideEffects`) ;
- `NgModule`, `zone.js` ;
- `*ngIf` / `*ngFor` ;
- `@Input` / `@Output` / `@ViewChild` ;
- l'injection par constructeur ;
- `subscribe()` manuel dans un composant ;
- un import de `firebase/*` en dehors de `core/providers/` ; `@angular/fire` et `ngx-sg` (incompatibles avec Angular 22).

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
│   │   ├── super-admin-routes/               # super-admin.routes.ts + super-admin-route-container.model.ts
│   │   ├── guards/                           # auth.guard.ts, role.guard.ts (fonctionnels, canMatch)
│   │   └── matcher/                          # matchers d'URL si besoin
│   ├── components/                           # composants transverses (statistics-card…)
│   ├── store-features/                       # signalStoreFeature réutilisables (withRequestStatus…)
│   ├── structures/                           # general-dialog, general-error, snackbar .structure.ts
│   └── utils/                                # date-utils, route-utils…
└── main/
    ├── commons/                              # zone partagée
    │   ├── authentication-module/            # signin, forget-password, accept-invitation
    │   ├── main-module/                      # shell / layout
    │   ├── navbar-module/
    │   ├── toolbar-module/
    │   └── extension-module/                 # liaison avec l'extension Chrome (envoi du token)
    ├── cabinet/                              # zone cabinet (admin + courtier)
    │   ├── home-module/                      # tableau de bord
    │   ├── assures-module/
    │   ├── dossiers-module/                  # stepper, détail, besoin, historique
    │   ├── tarification-module/              # jobs, champs manquants, saisie manuelle
    │   ├── comparatif-module/
    │   ├── proposition-module/
    │   └── settings-module/                  # cabinet, membres, assureurs actifs
    └── super-admin/
        ├── tenants-management-module/
        ├── catalogue-management-module/      # produits, questionnaires, garanties
        ├── insurers-management-module/
        └── extension-monitoring-module/
```

### Anatomie d'un module

```
dossiers-module/
├── components/
│   ├── dossiers-container/                  # smart : injecte le store
│   │   ├── dossiers-container.component.ts|html|scss
│   ├── list-dossiers/                       # dumb : input()/output()
│   │   ├── list-dossiers.component.ts|html|scss
│   │   └── list-dossiers.component.structure.ts   # textes, colonnes, config UI
│   └── new-dossier/
│       ├── new-dossier-container/
│       └── new-dossier-presentation/
├── models/                                  # *.model.ts, *.enum.ts
├── services/
│   └── dossiers.service.ts                  # seul accès aux providers
├── store/
│   └── dossiers.store.ts                    # UN fichier SignalStore (remplace actions/reducer/effects/selectors)
└── util/
    └── dossiers.utils.ts
```

**Nommage :**
- `xxx-container` = composant smart ;
- `xxx-presentation` (ou nom métier simple) = composant dumb ;
- `xxx.component.structure.ts` = textes et configuration de l'UI, sans aucune logique.

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
      switchMap(filter => service.watchDossiers(auth.tenantId()!, filter).pipe(tapResponse({
        next: dossiers => patchState(store, setAllEntities(dossiers), setFulfilled()),
        error: (e: Error) => patchState(store, setError(e.message)),
      }))),
    )),
    // Écriture
    create: rxMethod<NewDossier>(pipe(
      exhaustMap(input => service.create(auth.tenantId()!, input).pipe(tapResponse({
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
7. Le `tenantId` vient toujours de `AuthStore`, qui lit les claims ; il n'est jamais saisi ni passé par l'URL.

**Correspondance avec l'ancien projet (NgRx classique) :**

| `aibs-partenaire` (NgRx) | Courtier Intelligent (SignalStore) |
|---|---|
| `store/xxx.state.ts` + `reducer/` | `withState` + méthodes avec `patchState` |
| `store/xxx.actions.ts` + `dispatch` | méthodes du store |
| `selector/` | `withComputed` |
| `effects/` | `rxMethod` / `withHooks` |
| `provideState` / `provideEffects` dans les routes | store dans les `providers` de la route |
| router-store + `CustomRouterSerializer` | `withComponentInputBinding()` |

## 6. Composants

- Utiliser `input()`, `output()`, `model()`, `viewChild()` et `inject()`.
- Utiliser `@if`, `@for` (toujours avec `track`), `@switch`, et `@defer` pour les blocs lourds (comparatif, tableaux).
- Les containers injectent les stores ; les composants de présentation n'injectent rien.
- Les textes de l'UI sont en français, dans les fichiers `*.structure.ts`. Les identifiants du code sont en anglais.

## 7. Services et providers

Les providers vivent dans `core/providers/`. Chaque port est une classe abstraite, liée à son implémentation Firebase dans `provideInfrastructure()` :

| Port (abstrait) | Implémentation |
|---|---|
| `AuthenticationProvider` | `FireauthProvider` (expose `user$` avec les claims `tenantId` et `role`) |
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

- Un service par module (`xxx.service.ts`, `providedIn: 'root'`). Il construit ses requêtes avec un `QueryModel` (filtres, tri, limite) et ne retourne que des `Observable` typés.
- Les chemins Firestore sont **toujours** préfixés par `tenants/{tenantId}/…`, sauf pour le catalogue global.
- Les appels aux Cloud Functions passent par `BackendProvider`.

## 8. Routing

- Chaque zone (`commons`, `cabinet`, `super-admin`) et chaque module sont chargés en lazy.
- Chaque zone a un `xxx-route-container.model.ts` qui centralise ses chemins (comme `BackOfficeRouteContainerModel`).
- Les guards sont fonctionnels, avec `canMatch` : `authGuard`, puis `roleGuard('superadmin' | 'admin' | 'courtier')`. Le code d'une zone non autorisée n'est jamais téléchargé.
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

- `main/commons/extension-module/` contient un `ExtensionService`, qui détecte l'extension et lui envoie le custom token (`chrome.runtime.sendMessage`), et un `ExtensionStore` global, qui expose l'état `connected`.
- Après la connexion, l'app ne parle **jamais** directement à l'extension : tout passe par Firestore (`quoteJobs`, `offers`), écouté en temps réel par `TarificationStore`.

## 10. Règles pour les agents IA

1. Respecter strictement les sections 1, 2, 3 et 5.
2. Placer le nouveau code là où l'indique la section 3 ; demander en cas de doute.
3. Un module = `components/` (container + presentation) + `models/` + `services/` + `store/` + `util/`.
4. Ne jamais redéfinir un type qui existe dans `shared/`.
5. Ne pas modifier les dépendances, la configuration de build ni les règles de sécurité sans qu'on le demande.
6. Signaler toute API Angular expérimentale utilisée (par exemple Signal Forms).
