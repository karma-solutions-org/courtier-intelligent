import { inject, Injectable } from '@angular/core';
import { catchError, from, Observable, of, switchMap } from 'rxjs';
import { ExtensionPing, ExtensionProvider } from '../../../../core/providers/extension.provider';
import { SessionService } from '../../authentication-module/services/session.service';

@Injectable({ providedIn: 'root' })
export class ExtensionService {
  private readonly _extension = inject(ExtensionProvider);
  private readonly _session = inject(SessionService);

  /**
   * Demande à l'extension si elle est là (message `PING`) et quelle est sa version.
   * Le message porte l'identifiant de cet appareil : l'extension le présente à `sessions-ouvrirExtension`.
   */
  ping(): Observable<ExtensionPing> {
    return from(this._session.deviceId()).pipe(
      catchError(() => of(undefined)),
      switchMap(deviceId => this._extension.ping(deviceId)),
    );
  }
}
