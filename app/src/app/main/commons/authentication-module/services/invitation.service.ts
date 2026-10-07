import { inject, Injectable } from '@angular/core';
import { TenantRole } from '@shared';
import { Observable } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';

@Injectable({ providedIn: 'root' })
export class InvitationService {
  private readonly _backend = inject(BackendProvider);

  accept(tenantId: string, invitationId: string): Observable<{ tenantId: string; role: TenantRole }> {
    return this._backend.call('members-acceptInvitation', { tenantId, invitationId });
  }
}
