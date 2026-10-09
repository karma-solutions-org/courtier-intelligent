import { inject, Injectable } from '@angular/core';
import { DossierStatus } from '@shared';
import { Observable } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';

/** Comparaison et décision : le choix de l'offre passe par la function `dossiers-decider` (machine à états, historique). */
@Injectable({ providedIn: 'root' })
export class ComparisonService {
  private readonly _backend = inject(BackendProvider);

  decide(dossierId: string, insurerId: string, justification: string): Observable<{ status: DossierStatus }> {
    return this._backend.call('dossiers-decider', { dossierId, insurerId, justification });
  }
}
