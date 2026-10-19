import { inject, Injectable } from '@angular/core';
import { DossierOutcomeResult, DossierStatus } from '@shared';
import { Observable } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';

export interface ProposalAnswer {
  result: DossierOutcomeResult;
  contractNumber?: string;
  effectiveDate?: string;
}

/** Proposition et suivi : envoi de l'email et réponse de l'assuré passent par les functions `propositions-*`. */
@Injectable({ providedIn: 'root' })
export class ProposalService {
  private readonly _backend = inject(BackendProvider);

  send(dossierId: string, to: string, message: string): Observable<{ status: DossierStatus }> {
    return this._backend.call('propositions-envoyer', { dossierId, to, message });
  }

  recordAnswer(dossierId: string, answer: ProposalAnswer): Observable<{ status: DossierStatus }> {
    return this._backend.call('propositions-enregistrerReponse', { dossierId, ...answer });
  }
}
