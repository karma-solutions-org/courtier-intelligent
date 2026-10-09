import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ExtensionPing, ExtensionProvider } from '../../../../core/providers/extension.provider';

@Injectable({ providedIn: 'root' })
export class ExtensionService {
  private readonly _extension = inject(ExtensionProvider);

  /** Demande à l'extension si elle est là (message `PING`) et quelle est sa version. */
  ping(): Observable<ExtensionPing> {
    return this._extension.ping();
  }
}
