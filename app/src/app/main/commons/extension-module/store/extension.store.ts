import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, exhaustMap, fromEvent, merge, pipe, switchMap, tap, timer } from 'rxjs';
import { ExtensionPing } from '../../../../core/providers/extension.provider';
import { AuthStore } from '../../authentication-module/store/auth.store';
import { ExtensionService } from '../services/extension.service';

/** L'extension peut être installée ou retirée pendant que l'app est ouverte : on revérifie régulièrement. */
const RECHECK_INTERVAL_MS = 30_000;

interface ExtensionState {
  /** Dernier résultat de la détection (null : pas encore vérifié). */
  ping: ExtensionPing | null;
  /** Connexion de l'app (`uid:auth_time`) pour laquelle la connexion automatique a déjà été tentée. */
  autoConnectTriedFor: string | null;
  /** Raison du dernier échec de la connexion automatique (null : aucun échec). */
  connectError: string | null;
}

/**
 * Store global : l'extension Chrome est-elle installée ? Et connexion automatique : une extension installée mais
 * pas connectée au compte de l'app est connectée avec un jeton émis par le serveur, une seule fois par connexion
 * de l'app (une déconnexion volontaire depuis l'extension n'est pas annulée toutes les 30 s).
 */
export const ExtensionStore = signalStore(
  { providedIn: 'root' },
  withState<ExtensionState>({ ping: null, autoConnectTriedFor: null, connectError: null }),
  withComputed(({ ping }) => ({
    status: computed(() => ping()?.status ?? null),
    isInstalled: computed(() => ping()?.status === 'installed'),
    version: computed(() => {
      const result = ping();
      return result?.status === 'installed' ? result.version : null;
    }),
  })),
  withMethods((store, service = inject(ExtensionService), auth = inject(AuthStore)) => {
    /** Connexion de l'app à laquelle l'extension doit être rattachée, ou null (pas de session ouverte). */
    const appLogin = (): { uid: string; key: string } | null => {
      const user = auth.user();
      if (!user?.cabinetId || auth.sessionStatus() !== 'open') return null;
      return { uid: user.uid, key: `${user.uid}:${user.authTime ?? ''}` };
    };

    const autoConnect = rxMethod<string>(
      pipe(
        tap(key => patchState(store, { autoConnectTriedFor: key, connectError: null })),
        exhaustMap(() =>
          service.connect().pipe(
            tap(result => patchState(store, { connectError: result.ok ? null : result.message })),
            // Réussie : relit l'état de l'extension (désormais connectée) pour l'affichage.
            switchMap(result => (result.ok ? service.ping().pipe(tap(ping => patchState(store, { ping }))) : EMPTY)),
          ),
        ),
      ),
    );

    const onPing = (ping: ExtensionPing) => {
      patchState(store, { ping });
      const login = appLogin();
      if (!login || ping.status !== 'installed' || store.autoConnectTriedFor() === login.key) return;
      if (ping.signedIn && ping.uid === login.uid) return;
      autoConnect(login.key);
    };

    return {
      /** Vérifie maintenant, puis toutes les 30 s et à chaque retour sur l'onglet. */
      _watch: rxMethod<void>(
        pipe(
          switchMap(() => merge(timer(0, RECHECK_INTERVAL_MS), fromEvent(window, 'focus'))),
          switchMap(() => service.ping().pipe(tap(onPing))),
        ),
      ),
    };
  }),
  withHooks({ onInit: store => store._watch() }),
);
