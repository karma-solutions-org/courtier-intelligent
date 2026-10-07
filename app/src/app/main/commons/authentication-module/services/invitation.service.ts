import { inject, Injectable } from '@angular/core';
import { CabinetRole } from '@shared';
import { Observable } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';

@Injectable({ providedIn: 'root' })
export class InvitationService {
  private readonly _backend = inject(BackendProvider);

  accept(cabinetId: string, invitationId: string): Observable<{ cabinetId: string; role: CabinetRole }> {
    return this._backend.call('equipe-accepterInvitation', { cabinetId, invitationId });
  }
}
