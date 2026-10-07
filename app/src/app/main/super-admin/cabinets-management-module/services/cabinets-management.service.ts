import { inject, Injectable } from '@angular/core';
import { Cabinet } from '@shared';
import { Observable } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { NewCabinetModel } from '../models/new-cabinet.model';

@Injectable({ providedIn: 'root' })
export class CabinetsManagementService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _backend = inject(BackendProvider);

  watchCabinets(): Observable<Cabinet[]> {
    return this._database.watchCollection<Cabinet>('cabinets', { orderBy: [{ field: 'createdAt', direction: 'desc' }] });
  }

  create(cabinet: NewCabinetModel): Observable<{ cabinetId: string; isNewAccount: boolean }> {
    return this._backend.call('cabinets-creer', { ...cabinet, appUrl: location.origin });
  }

  setActive(cabinetId: string, active: boolean): Observable<{ success: boolean }> {
    return this._backend.call('cabinets-activer', { cabinetId, active });
  }
}
