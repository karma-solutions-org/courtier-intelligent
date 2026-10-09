import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { fromEvent, merge, pipe, switchMap, tap, timer } from 'rxjs';
import { ExtensionPing } from '../../../../core/providers/extension.provider';
import { ExtensionService } from '../services/extension.service';

/** L'extension peut être installée ou retirée pendant que l'app est ouverte : on revérifie régulièrement. */
const RECHECK_INTERVAL_MS = 30_000;

interface ExtensionState {
  /** Dernier résultat de la détection (null : pas encore vérifié). */
  ping: ExtensionPing | null;
}

/** Store global : l'extension Chrome est-elle installée ? */
export const ExtensionStore = signalStore(
  { providedIn: 'root' },
  withState<ExtensionState>({ ping: null }),
  withComputed(({ ping }) => ({
    status: computed(() => ping()?.status ?? null),
    isInstalled: computed(() => ping()?.status === 'installed'),
    version: computed(() => {
      const result = ping();
      return result?.status === 'installed' ? result.version : null;
    }),
  })),
  withMethods((store, service = inject(ExtensionService)) => ({
    /** Vérifie maintenant, puis toutes les 30 s et à chaque retour sur l'onglet. */
    _watch: rxMethod<void>(
      pipe(
        switchMap(() => merge(timer(0, RECHECK_INTERVAL_MS), fromEvent(window, 'focus'))),
        switchMap(() => service.ping().pipe(tap(ping => patchState(store, { ping })))),
      ),
    ),
  })),
  withHooks({ onInit: store => store._watch() }),
);
