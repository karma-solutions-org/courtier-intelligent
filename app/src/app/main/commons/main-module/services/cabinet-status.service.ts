import { inject, Injectable } from '@angular/core';
import { Cabinet } from '@shared';
import { Observable } from 'rxjs';
import { DatabaseProvider } from '../../../../core/providers/database.provider';

@Injectable({ providedIn: 'root' })
export class CabinetStatusService {
  private readonly _database = inject(DatabaseProvider);

  watchCabinet(cabinetId: string): Observable<Cabinet | null> {
    return this._database.watchDocument<Cabinet>(`cabinets/${cabinetId}`);
  }
}
