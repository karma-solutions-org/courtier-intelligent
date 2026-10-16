import { inject, Injectable } from '@angular/core';
import { catchError, from, Observable, of, switchMap } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { ExtensionConnectResult, ExtensionPing, ExtensionProvider } from '../../../../core/providers/extension.provider';
import { toBackendErrorMessage } from '../../../../core/utils/backend-error.utils';
import { SessionService } from '../../authentication-module/services/session.service';

@Injectable({ providedIn: 'root' })
export class ExtensionService {
  private readonly _extension = inject(ExtensionProvider);
  private readonly _session = inject(SessionService);
  private readonly _backend = inject(BackendProvider);

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

  /**
   * Connexion automatique de l'extension avec le compte de l'app : le serveur émet un jeton (seulement pour la
   * session de l'app sur cet appareil), transmis tel quel à l'extension. Ne lève jamais : un refus est un résultat.
   */
  connect(): Observable<ExtensionConnectResult> {
    return from(this._session.deviceId()).pipe(
      switchMap(deviceId =>
        this._backend
          .call<{ deviceId: string }, { token: string }>('sessions-emettreJetonExtension', { deviceId })
          .pipe(switchMap(({ token }) => this._extension.connect(token, deviceId))),
      ),
      catchError(error => of<ExtensionConnectResult>({ ok: false, message: toBackendErrorMessage(error) })),
    );
  }
}
