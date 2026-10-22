import { inject, Injectable } from '@angular/core';
import { map, Observable, of, switchMap, tap } from 'rxjs';
import { AuthenticationProvider, AuthUser } from '../../../../core/providers/authentication.provider';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { CommonRouteContainerModel } from '../../../../core/routing/common-routes/common-route-container.model';
import { CredentialsModel } from '../models/credentials.model';
import { SignupModel } from '../models/signup.model';

const PENDING_CABINET_KEY = 'ci.pendingCabinetName';

function savePendingCabinetName(name: string | null): void {
  try {
    if (name) localStorage.setItem(PENDING_CABINET_KEY, name);
    else localStorage.removeItem(PENDING_CABINET_KEY);
  } catch {
    // Stockage indisponible (navigation privée) : l'utilisateur ressaisira le nom.
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _authProvider = inject(AuthenticationProvider);
  private readonly _backend = inject(BackendProvider);

  readonly user$: Observable<AuthUser | null> = this._authProvider.user$;

  signIn({ email, password }: CredentialsModel): Observable<void> {
    return this._authProvider.signIn(email.trim(), password);
  }

  /** Crée le compte et envoie le lien de vérification. */
  signUp({ displayName, email, password, cabinetName }: SignupModel): Observable<void> {
    // Gardé pour pré-remplir la page « Créer votre cabinet » si l'onglet est fermé avant le clic.
    savePendingCabinetName(cabinetName?.trim() || null);
    return this._authProvider.signUp(displayName.trim(), email.trim(), password);
  }

  /**
   * Attend le clic sur le lien de vérification, puis crée le cabinet dont l'utilisateur devient l'admin
   * (sauf s'il s'inscrit pour rejoindre un cabinet par invitation).
   */
  completeSignUp(cabinetName?: string): Observable<void> {
    return this._authProvider
      .waitForEmailVerification()
      .pipe(switchMap(() => (cabinetName?.trim() ? this.createCabinet(cabinetName) : of(undefined))));
  }

  /** Crée le cabinet de l'utilisateur connecté (adresse vérifiée), qui en devient l'admin. */
  createCabinet(cabinetName: string): Observable<void> {
    // Token rechargé avant l'appel : celui en cache peut dater d'avant le clic sur le lien de vérification
    // (page rouverte ou rechargée) et le serveur refuserait alors une adresse pourtant vérifiée.
    return this._authProvider.refreshToken().pipe(
      switchMap(() => this._backend.call('cabinets-creerMonCabinet', { name: cabinetName.trim() })),
      // Le cabinet et le rôle viennent d'être posés côté serveur : on recharge le token.
      switchMap(() => this._authProvider.refreshToken()),
      tap(() => savePendingCabinetName(null)),
      map(() => undefined),
    );
  }

  waitForEmailVerification(): Observable<void> {
    return this._authProvider.waitForEmailVerification();
  }

  resendEmailVerification(): Observable<void> {
    return this._authProvider.resendEmailVerification();
  }

  /** Nom saisi à l'inscription, si le cabinet n'a pas encore été créé. */
  pendingCabinetName(): string {
    try {
      return localStorage.getItem(PENDING_CABINET_KEY) ?? '';
    } catch {
      return '';
    }
  }

  signOut(): Observable<void> {
    return this._authProvider.signOut();
  }

  refreshToken(): Observable<void> {
    return this._authProvider.refreshToken();
  }

  sendPasswordReset(email: string): Observable<void> {
    const continueUrl = `${location.origin}${CommonRouteContainerModel.SIGNIN_ROUTE.url}`;
    return this._authProvider.sendPasswordReset(email.trim(), continueUrl);
  }
}
