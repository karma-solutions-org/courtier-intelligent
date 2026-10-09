import { inject, Injectable } from '@angular/core';
import { Member, Session } from '@shared';
import { catchError, from, map, Observable, of, switchMap } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';

const DEVICE_DB = 'courtier-intelligent';
const DEVICE_STORE = 'device';
const DEVICE_KEY = 'deviceId';

/**
 * Un seul appareil par utilisateur : le compte est lié à l'appareil de sa première connexion.
 * L'identifiant d'appareil est généré une fois et conservé dans l'IndexedDB du navigateur :
 * recharger la page ou se reconnecter garde le même appareil, un autre navigateur ou poste en a un autre.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly _backend = inject(BackendProvider);
  private readonly _database = inject(DatabaseProvider);
  private _deviceId: Promise<string> | null = null;

  /** Identifiant de cet appareil, créé à la première utilisation. */
  deviceId(): Promise<string> {
    return (this._deviceId ??= readOrCreateDeviceId());
  }

  /** Ouvre la session de cet appareil ; refusée (`device_not_authorized`) si le compte est lié à un autre. */
  open(): Observable<unknown> {
    return from(this.deviceId()).pipe(
      switchMap(deviceId => this._backend.call('sessions-ouvrir', { deviceId, appareil: describeDevice() })),
    );
  }

  /** Ferme la session de cet appareil. Une erreur n'empêche pas la déconnexion. */
  close(): Observable<void> {
    return this._backend.call('sessions-fermer', {}).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  /** Signal de vie : dernière activité de l'appareil, visible dans le suivi des membres. */
  heartbeat(cabinetId: string, uid: string): Observable<void> {
    return this._database.update(`cabinets/${cabinetId}/members/${uid}`, {
      'session.lastSeen': this._database.serverTimestamp(),
    });
  }

  /** Session actuellement autorisée pour ce membre (null si aucune). */
  watchActiveSession(cabinetId: string, uid: string): Observable<Session | null> {
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

/** Lit l'identifiant d'appareil dans l'IndexedDB, ou le crée. Sans IndexedDB : identifiant limité à cette visite. */
async function readOrCreateDeviceId(): Promise<string> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DEVICE_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(DEVICE_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const existing = await idbRequest<string | undefined>(db.transaction(DEVICE_STORE).objectStore(DEVICE_STORE).get(DEVICE_KEY));
    if (existing) {
      return existing;
    }
    const created = crypto.randomUUID();
    await idbRequest(db.transaction(DEVICE_STORE, 'readwrite').objectStore(DEVICE_STORE).put(created, DEVICE_KEY));
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
