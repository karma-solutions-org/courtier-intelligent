import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanMatchFn, PartialMatchRouteSnapshot, provideRouter, Route, UrlSegment, UrlTree } from '@angular/router';
import { UserRole } from '@shared';
import { firstValueFrom, isObservable, Observable } from 'rxjs';
import { mockAuthUser } from '../../utils/unit-test-utils/mocks/cabinet.mock';
import {
  FakeAuthenticationProvider,
  provideFakeAuthentication,
} from '../../utils/unit-test-utils/mocks/fake-authentication.provider';
import { authGuard, guestGuard, roleGuard } from './auth.guards';

/** Le résultat d'un guard : `true`, ou l'URL vers laquelle il redirige. */
async function evaluate(guard: CanMatchFn): Promise<true | string> {
  const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
    guard({} as Route, [] as UrlSegment[], {} as PartialMatchRouteSnapshot),
  );
  const value = isObservable(result) ? await firstValueFrom(result as Observable<boolean | UrlTree>) : await result;
  return value === true ? true : (value as UrlTree).toString();
}

describe('Guards', () => {
  let auth: FakeAuthenticationProvider;

  const signInAs = (role: UserRole | null) => auth.signInAs(mockAuthUser({ role, cabinetId: role ? 'cabinet' : null }));

  beforeEach(() => {
    auth = new FakeAuthenticationProvider();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideFakeAuthentication(auth)] });
  });

  describe('authGuard', () => {
    it('laisse passer un utilisateur connecté', async () => {
      signInAs('courtier');
      expect(await evaluate(authGuard)).toBe(true);
    });

    it('renvoie un visiteur vers la connexion', async () => {
      auth.signOutUser();
      expect(await evaluate(authGuard)).toBe('/connexion');
    });

    it("attend que Firebase ait donné l'état de connexion avant de décider", async () => {
      const decision = evaluate(authGuard);
      signInAs('courtier');
      expect(await decision).toBe(true);
    });
  });

  describe('guestGuard', () => {
    it("renvoie un utilisateur déjà connecté vers son espace", async () => {
      signInAs('admin');
      expect(await evaluate(guestGuard)).toBe('/espace');
    });

    it('laisse un visiteur accéder aux pages de connexion', async () => {
      auth.signOutUser();
      expect(await evaluate(guestGuard)).toBe(true);
    });
  });

  describe('roleGuard', () => {
    it("n'ouvre pas les paramètres du cabinet à un courtier", async () => {
      signInAs('courtier');
      expect(await evaluate(roleGuard('admin'))).toBe('/espace');
    });

    it("n'ouvre pas la console super-admin à un admin de cabinet", async () => {
      signInAs('admin');
      expect(await evaluate(roleGuard('superadmin'))).toBe('/espace');
    });

    it('laisse passer un rôle autorisé', async () => {
      signInAs('courtier');
      expect(await evaluate(roleGuard('admin', 'courtier'))).toBe(true);
    });

    it("refuse un compte qui n'a pas encore de rôle", async () => {
      signInAs(null);
      expect(await evaluate(roleGuard('admin', 'courtier'))).toBe('/espace');
    });
  });
});
