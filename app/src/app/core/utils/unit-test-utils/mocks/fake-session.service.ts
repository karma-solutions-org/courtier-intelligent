import { Provider } from '@angular/core';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { MemberSession } from '@shared';
import { SessionService } from '../../../../main/commons/authentication-module/services/session.service';

/**
 * Remplace la session « un seul appareil » : l'ouverture réussit, sauf si [refuseWith]
 * est renseigné (compte déjà connecté ailleurs). Aucun signal de vie n'est envoyé.
 */
export class FakeSessionService implements Pick<SessionService, 'sessionId' | 'open' | 'close' | 'heartbeat' | 'watchActiveSession'> {
  refuseWith: string | null = null;

  readonly open = vi.fn((): Observable<unknown> =>
    this.refuseWith ? throwError(() => ({ code: 'functions/already-exists', message: this.refuseWith })) : of({}),
  );
  readonly close = vi.fn(() => of(undefined));
  readonly heartbeat = vi.fn((_cabinetId: string, _uid: string) => of(undefined));
  readonly watchActiveSession = vi.fn((_cabinetId: string, _uid: string): Observable<MemberSession | null> => NEVER);

  sessionId(): string {
    return 'session-de-test';
  }
}

export function provideFakeSession(fake: FakeSessionService): Provider {
  return { provide: SessionService, useValue: fake };
}
