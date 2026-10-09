import { inject, Injectable } from '@angular/core';
import { map, Observable, of, switchMap } from 'rxjs';
import { AuthenticationProvider, AuthUser } from '../../../../core/providers/authentication.provider';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { CommonRouteContainerModel } from '../../../../core/routing/common-routes/common-route-container.model';
import { CredentialsModel } from '../models/credentials.model';
import { SignupModel } from '../models/signup.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _authProvider = inject(AuthenticationProvider);
  private readonly _backend = inject(BackendProvider);

  readonly user$: Observable<AuthUser | null> = this._authProvider.user$;

  signIn({ email, password }: CredentialsModel): Observable<void> {
    return this._authProvider.signIn(email.trim(), password);
  }

  /**
   * Crée le compte, puis le cabinet dont l'utilisateur devient l'admin
   * (sauf s'il s'inscrit pour rejoindre un cabinet par invitation).
   */
  signUp({ displayName, email, password, cabinetName }: SignupModel): Observable<void> {
    return this._authProvider.signUp(displayName.trim(), email.trim(), password).pipe(
      switchMap(() =>
        cabinetName?.trim()
          ? this._backend.call('cabinets-creerMonCabinet', { name: cabinetName.trim() }).pipe(
              // Le cabinet et le rôle viennent d'être posés côté serveur : on recharge le token.
              switchMap(() => this._authProvider.refreshToken()),
            )
          : of(undefined),
      ),
      map(() => undefined),
    );
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
