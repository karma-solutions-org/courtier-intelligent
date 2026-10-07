import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthenticationProvider, AuthUser } from '../../../../core/providers/authentication.provider';
import { CommonRouteContainerModel } from '../../../../core/routing/common-routes/common-route-container.model';
import { CredentialsModel } from '../models/credentials.model';
import { SignupModel } from '../models/signup.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _authProvider = inject(AuthenticationProvider);

  readonly user$: Observable<AuthUser | null> = this._authProvider.user$;

  signIn({ email, password }: CredentialsModel): Observable<void> {
    return this._authProvider.signIn(email.trim(), password);
  }

  signUp({ displayName, email, password }: SignupModel): Observable<void> {
    return this._authProvider.signUp(displayName.trim(), email.trim(), password);
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
