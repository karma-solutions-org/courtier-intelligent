import { inject, Injectable } from '@angular/core';
import { Invitation, Member, MemberStatus, Tenant, TenantRole } from '@shared';
import { Observable, switchMap } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { StorageProvider } from '../../../../core/providers/storage.provider';
import { TenantInfoModel } from '../models/tenant-info.model';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _storage = inject(StorageProvider);
  private readonly _backend = inject(BackendProvider);

  watchTenant(tenantId: string): Observable<Tenant | null> {
    return this._database.watchDocument<Tenant>(`tenants/${tenantId}`);
  }

  updateTenant(tenantId: string, info: TenantInfoModel): Observable<void> {
    return this._database.update(`tenants/${tenantId}`, { ...info });
  }

  uploadLogo(tenantId: string, file: File): Observable<void> {
    return this._storage
      .upload(`tenants/${tenantId}/logo/logo`, file)
      .pipe(switchMap(logoPath => this._database.update(`tenants/${tenantId}`, { logoPath })));
  }

  watchMembers(tenantId: string): Observable<Member[]> {
    return this._database.watchCollection<Member>(`tenants/${tenantId}/members`, {
      orderBy: [{ field: 'createdAt' }],
    });
  }

  watchPendingInvitations(tenantId: string): Observable<Invitation[]> {
    return this._database.watchCollection<Invitation>(`tenants/${tenantId}/invitations`, {
      filters: [{ field: 'status', operator: '==', value: 'pending' }],
    });
  }

  invite(email: string, role: TenantRole): Observable<{ invitationId: string }> {
    return this._backend.call('members-inviteMember', { email, role, appUrl: location.origin });
  }

  setRole(uid: string, role: TenantRole): Observable<{ success: boolean }> {
    return this._backend.call('members-setMemberRole', { uid, role });
  }

  setStatus(uid: string, status: MemberStatus): Observable<{ success: boolean }> {
    return this._backend.call('members-setMemberStatus', { uid, status });
  }
}
