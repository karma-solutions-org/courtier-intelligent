import { inject, Injectable } from '@angular/core';
import { Member, MemberSession } from '@shared';
import { catchError, map, Observable, of } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';

const SESSION_STORAGE_KEY = 'ci_session_id';

/**
 * Un seul appareil connecté par utilisateur.
 * L'identifiant de session est propre au navigateur (conservé dans le localStorage) :
 * recharger la page garde la même session, un autre appareil en a une autre.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly _backend = inject(BackendProvider);
  private readonly _database = inject(DatabaseProvider);
  private _fallbackId: string | null = null;

  /** Identifiant de session de ce navigateur, créé à la première connexion. */
  sessionId(): string {
    try {
      let id = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(SESSION_STORAGE_KEY, id);
      }
      return id;
    } catch {
      // Stockage indisponible (navigation privée stricte) : session limitée à cet onglet.
      return (this._fallbackId ??= crypto.randomUUID());
    }
  }

  /** Ouvre la session de cet appareil ; refusée si l'utilisateur est connecté ailleurs. */
  open(): Observable<unknown> {
    return this._backend.call('sessions-ouvrir', { sessionId: this.sessionId(), appareil: describeDevice() });
  }

  /** Ferme la session de cet appareil. Une erreur n'empêche pas la déconnexion. */
  close(): Observable<void> {
    return this._backend.call('sessions-fermer', { sessionId: this.sessionId() }).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  /** Signal de vie : tant qu'il arrive, aucun autre appareil ne peut se connecter. */
  heartbeat(cabinetId: string, uid: string): Observable<void> {
    return this._database.update(`cabinets/${cabinetId}/members/${uid}`, {
      'session.lastSeen': this._database.serverTimestamp(),
    });
  }

  /** Session actuellement autorisée pour ce membre (null si aucune). */
  watchActiveSession(cabinetId: string, uid: string): Observable<MemberSession | null> {
    return this._database
      .watchDocument<Member>(`cabinets/${cabinetId}/members/${uid}`)
      .pipe(map(member => member?.session ?? null));
  }
}

/** Description lisible de l'appareil, affichée à l'admin (ex. « Chrome · Windows »). */
function describeDevice(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Système inconnu';
  return `${browser} · ${os}`;
}
