import { inject, Injectable } from '@angular/core';
import { Invitation, Member, MemberStatus, Cabinet, CabinetRole } from '@shared';
import { Observable, switchMap } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { StorageProvider } from '../../../../core/providers/storage.provider';
import { CabinetInfoModel } from '../models/cabinet-info.model';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _storage = inject(StorageProvider);
  private readonly _backend = inject(BackendProvider);

  watchCabinet(cabinetId: string): Observable<Cabinet | null> {
    return this._database.watchDocument<Cabinet>(`cabinets/${cabinetId}`);
  }

  updateCabinet(cabinetId: string, info: CabinetInfoModel): Observable<void> {
    return this._database.update(`cabinets/${cabinetId}`, { ...info });
  }

  uploadLogo(cabinetId: string, file: File): Observable<void> {
    return this._storage
      .upload(`cabinets/${cabinetId}/logo/logo`, file)
      .pipe(switchMap(logoPath => this._database.update(`cabinets/${cabinetId}`, { logoPath })));
  }

  watchMembers(cabinetId: string): Observable<Member[]> {
    return this._database.watchCollection<Member>(`cabinets/${cabinetId}/members`, {
      orderBy: [{ field: 'createdAt' }],
    });
  }

  watchPendingInvitations(cabinetId: string): Observable<Invitation[]> {
    return this._database.watchCollection<Invitation>(`cabinets/${cabinetId}/invitations`, {
      filters: [{ field: 'status', operator: '==', value: 'pending' }],
    });
  }

  invite(email: string, role: CabinetRole): Observable<{ invitationId: string }> {
    return this._backend.call('equipe-inviter', { email, role, appUrl: location.origin });
  }

  setRole(uid: string, role: CabinetRole): Observable<{ success: boolean }> {
    return this._backend.call('equipe-changerRole', { uid, role });
  }

  cancelInvitation(invitationId: string): Observable<{ success: boolean }> {
    return this._backend.call('equipe-annulerInvitation', { invitationId });
  }

  setStatus(uid: string, status: MemberStatus): Observable<{ success: boolean }> {
    return this._backend.call('equipe-activerMembre', { uid, status });
  }
}
