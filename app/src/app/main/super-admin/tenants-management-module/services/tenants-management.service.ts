import { inject, Injectable } from '@angular/core';
import { Tenant } from '@shared';
import { Observable } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { NewTenantModel } from '../models/new-tenant.model';

@Injectable({ providedIn: 'root' })
export class TenantsManagementService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _backend = inject(BackendProvider);

  watchTenants(): Observable<Tenant[]> {
    return this._database.watchCollection<Tenant>('tenants', { orderBy: [{ field: 'createdAt', direction: 'desc' }] });
  }

  create(tenant: NewTenantModel): Observable<{ tenantId: string; isNewAccount: boolean }> {
    return this._backend.call('tenants-adminCreateTenant', { ...tenant, appUrl: location.origin });
  }

  setActive(tenantId: string, active: boolean): Observable<{ success: boolean }> {
    return this._backend.call('tenants-setTenantActive', { tenantId, active });
  }
}
