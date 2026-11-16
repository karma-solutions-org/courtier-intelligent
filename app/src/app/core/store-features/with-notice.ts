import { patchState, signalStoreFeature, withMethods, withState } from '@ngrx/signals';

/** Message ponctuel (snackbar) et sa durée d'affichage en millisecondes. */
export interface Notice {
  text: string;
  duration: number;
}

export interface NoticeState {
  notice: Notice | null;
}

/**
 * Message ponctuel d'un store : le store le pose (`patchState(store, setNotice(...))`), le container l'affiche dans un
 * `effect` puis appelle `clearNotice()`. Le store ne connaît pas `MatSnackBar`.
 */
export function withNotice() {
  return signalStoreFeature(
    withState<NoticeState>({ notice: null }),
    withMethods((store) => ({
      clearNotice: () => patchState(store, { notice: null }),
    })),
  );
}

/** Mise à jour d'état qui pose un message. */
export function setNotice(text: string, duration: number): NoticeState {
  return { notice: { text, duration } };
}
