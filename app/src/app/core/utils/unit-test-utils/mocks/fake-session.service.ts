import { Provider } from '@angular/core';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { Session } from '@shared';
import { SessionService } from '../../../../main/commons/authentication-module/services/session.service';

/**
 * Remplace la session « un seul appareil » : l'ouverture réussit, sauf si [refuseWith]
 * est renseigné (compte lié à un autre appareil). Aucun signal de vie n'est envoyé.
 */
export class FakeSessionService implements Pick<SessionService, 'deviceId' | 'open' | 'close' | 'heartbeat' | 'watchActiveSession'> {
  refuseWith: string | null = null;
  /** Raison métier de l'erreur de refus (ex. « device_not_authorized »). */
  refuseReason: string | null = null;

  readonly open = vi.fn((): Observable<unknown> =>
    this.refuseWith ? throwError(() => ({
          code: 'functions/permission-denied',
          message: this.refuseWith,
          details: this.refuseReason ? { reason: this.refuseReason } : undefined,
        })) : of({}),
  );
  readonly close = vi.fn(() => of(undefined));
  readonly heartbeat = vi.fn((_cabinetId: string, _uid: string) => of(undefined));
  readonly watchActiveSession = vi.fn((_cabinetId: string, _uid: string): Observable<Session | null> => NEVER);

  deviceId(): Promise<string> {
    return Promise.resolve('appareil-de-test');
  }
}

export function provideFakeSession(fake: FakeSessionService): Provider {
  return { provide: SessionService, useValue: fake };
}
