import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, of } from 'rxjs';
import { AuthenticationProvider } from '../../../../core/providers/authentication.provider';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { AuthService } from './auth.service';

describe('AuthService.createCabinet', () => {
  it("recharge le token avant l'appel : une adresse vérifiée depuis l'ouverture de la page est acceptée", async () => {
    const calls: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthenticationProvider, useValue: { user$: of(null), refreshToken: () => record(calls, 'refreshToken') } },
        { provide: BackendProvider, useValue: { call: (name: string) => record(calls, name) } },
      ],
    });

    await firstValueFrom(TestBed.inject(AuthService).createCabinet(' Cabinet Test '));

    // Avant : token à jour (email_verified) ; après : claims du cabinet tout juste posés.
    expect(calls).toEqual(['refreshToken', 'cabinets-creerMonCabinet', 'refreshToken']);
  });
});

function record(calls: string[], name: string): Observable<void> {
  return new Observable(subscriber => {
    calls.push(name);
    subscriber.next();
    subscriber.complete();
  });
}
