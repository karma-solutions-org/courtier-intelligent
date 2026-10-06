import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthenticationProvider, AuthUser } from '../../../../core/providers/authentication.provider';
import { CredentialsModel } from '../models/credentials.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _authProvider = inject(AuthenticationProvider);

  readonly user$: Observable<AuthUser | null> = this._authProvider.user$;

  signIn({ email, password }: CredentialsModel): Observable<void> {
    return this._authProvider.signIn(email.trim(), password);
  }

  signOut(): Observable<void> {
    return this._authProvider.signOut();
  }

  sendPasswordReset(email: string): Observable<void> {
    return this._authProvider.sendPasswordReset(email.trim());
  }
}
