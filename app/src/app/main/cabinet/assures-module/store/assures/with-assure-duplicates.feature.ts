import { inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, combineLatest, debounceTime, EMPTY, map, of, pipe, switchMap, take, tap } from 'rxjs';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { AssuresService } from '../../services/assures.service';
import { displayName, DuplicateCandidate, DuplicateMatch, hasDuplicateCriteria, localDuplicates } from '../../util/assures.utils';
import { AssuresStoreState } from './assures.state';

/** Alerte de doublon pendant la saisie d'un client (création ou modification). */
export function withAssureDuplicates() {
  return signalStoreFeature(
    { state: type<AssuresStoreState>() },
    withMethods((store, service = inject(AssuresService), authStore = inject(AuthStore)) => ({
      clearDuplicates: () => patchState(store, { duplicates: [] }),
      /**
       * Alerte de doublon : vérification serveur sur tout le cabinet (SIRET compris), 400 ms après la dernière frappe.
       * switchMap écarte une réponse dépassée ; serveur injoignable : comparaison avec les clients chargés.
       */
      checkDuplicates: rxMethod<{ candidate: DuplicateCandidate; excludeId?: string }>(
        pipe(
          debounceTime(400),
          switchMap(({ candidate, excludeId }) => {
            const cabinetId = authStore.cabinetId();
            if (!cabinetId || !hasDuplicateCriteria(candidate)) {
              patchState(store, { duplicates: [] });
              return EMPTY;
            }
            const clean = (value: string | null | undefined) => value?.trim() || undefined;
            return service
              .verifyDuplicates({
                firstName: clean(candidate.firstName),
                lastName: clean(candidate.lastName),
                birthDate: clean(candidate.birthDate),
                email: clean(candidate.email),
                siret: clean(candidate.siret),
                companyName: clean(candidate.companyName),
                excludeId,
              })
              .pipe(
                // Nom affiché : client déjà chargé, sinon lu une fois.
                switchMap((found) => {
                  if (!found.length) return of([] as DuplicateMatch[]);
                  const known = new Map(store.assures().map((assure) => [assure.id, assure]));
                  return combineLatest(
                    found.map((match) =>
                      (known.has(match.id) ? of(known.get(match.id)!) : service.watchAssure(cabinetId, match.id).pipe(take(1))).pipe(
                        map((assure): DuplicateMatch => ({ ...match, name: assure ? displayName(assure) : 'Client' })),
                      ),
                    ),
                  );
                }),
                tap((duplicates) => patchState(store, { duplicates })),
                catchError(() => {
                  patchState(store, { duplicates: localDuplicates(candidate, store.assures(), excludeId) });
                  return EMPTY;
                }),
              );
          }),
        ),
      ),
    })),
  );
}
