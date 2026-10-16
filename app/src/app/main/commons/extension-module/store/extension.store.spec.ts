import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { ExtensionConnectResult, ExtensionPing, ExtensionProvider } from '../../../../core/providers/extension.provider';
import { FakeSessionService } from '../../../../core/utils/unit-test-utils/mocks/fake-session.service';
import { SessionService } from '../../authentication-module/services/session.service';
import { AuthStore } from '../../authentication-module/store/auth.store';
import { ExtensionStore } from './extension.store';

describe('ExtensionStore', () => {
  let answer: ExtensionPing;
  let ping: ReturnType<typeof vi.fn>;
  let connect: ReturnType<typeof vi.fn>;
  let call: ReturnType<typeof vi.fn>;
  let connectAnswer: ExtensionConnectResult;
  const user = signal<{ uid: string; cabinetId: string | null; authTime: number | null } | null>(null);
  const sessionStatus = signal<'none' | 'opening' | 'open'>('none');

  const create = () => {
    TestBed.configureTestingModule({ providers: [
        { provide: ExtensionProvider, useValue: { ping, connect } },
        { provide: BackendProvider, useValue: { call } },
        { provide: SessionService, useClass: FakeSessionService },
        { provide: AuthStore, useValue: { user, sessionStatus } },
      ], });
    const store = TestBed.inject(ExtensionStore);
    TestBed.tick();
    return store;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    answer = { status: 'installed', version: '0.1.0', signedIn: false, uid: null };
    ping = vi.fn(() => of(answer));
    connectAnswer = { ok: true };
    connect = vi.fn((): Observable<ExtensionConnectResult> => of(connectAnswer));
    call = vi.fn(() => of({ token: 'jeton-serveur' }));
    user.set(null);
    sessionStatus.set('none');
  });

  afterEach(() => vi.useRealTimers());

  it("transmet l'identifiant de cet appareil à l'extension", async () => {
    create();
    await vi.advanceTimersByTimeAsync(0);

    expect(ping).toHaveBeenCalledWith('appareil-de-test');
  });

  it("détecte l'extension dès le démarrage", async () => {
    const store = create();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.isInstalled()).toBe(true);
    expect(store.version()).toBe('0.1.0');
    expect(store.status()).toBe('installed');
  });

  it("n'affiche rien tant que la première vérification n'a pas répondu", () => {
    ping = vi.fn(() => NEVER);
    const store = create();

    expect(store.status()).toBeNull();
    expect(store.isInstalled()).toBe(false);
  });

  it('une extension absente est signalée', async () => {
    answer = { status: 'absent' };
    const store = create();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.status()).toBe('absent');
    expect(store.isInstalled()).toBe(false);
    expect(store.version()).toBeNull();
  });

  it("revérifie toutes les 30 secondes : une extension installée en cours de route est détectée", async () => {
    answer = { status: 'absent' };
    const store = create();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.isInstalled()).toBe(false);

    answer = { status: 'installed', version: '0.1.0', signedIn: false, uid: null };
    await vi.advanceTimersByTimeAsync(30_000);

    expect(store.isInstalled()).toBe(true);
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("revérifie au retour sur l'onglet", async () => {
    const store = create();
    await vi.advanceTimersByTimeAsync(0);
    ping.mockClear();

    answer = { status: 'absent' };
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);

    expect(ping).toHaveBeenCalledOnce();
    expect(store.status()).toBe('absent');
  });

  describe('connexion automatique', () => {
    beforeEach(() => {
      user.set({ uid: 'u1', cabinetId: 'cabinet-1', authTime: 1000 });
      sessionStatus.set('open');
    });

    it("connecte l'extension avec un jeton émis par le serveur pour cet appareil", async () => {
      const store = create();
      await vi.advanceTimersByTimeAsync(0);

      expect(call).toHaveBeenCalledWith('sessions-emettreJetonExtension', { deviceId: 'appareil-de-test' });
      expect(connect).toHaveBeenCalledWith('jeton-serveur', 'appareil-de-test');
      expect(store.connectError()).toBeNull();
    });

    it('ne fait rien si l’extension est déjà connectée au même compte', async () => {
      answer = { status: 'installed', version: '0.1.0', signedIn: true, uid: 'u1' };
      create();
      await vi.advanceTimersByTimeAsync(0);

      expect(call).not.toHaveBeenCalled();
    });

    it('reconnecte une extension connectée à un autre compte', async () => {
      answer = { status: 'installed', version: '0.1.0', signedIn: true, uid: 'autre' };
      create();
      await vi.advanceTimersByTimeAsync(0);

      expect(connect).toHaveBeenCalledOnce();
    });

    it("n'essaie qu'une fois par connexion de l'app (une déconnexion volontaire de l'extension est respectée)", async () => {
      create();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(call).toHaveBeenCalledOnce();
    });

    it("garde la raison d'un refus sans réessayer en boucle", async () => {
      connectAnswer = { ok: false, message: 'Mauvais appareil.' };
      const store = create();
      await vi.advanceTimersByTimeAsync(30_000);

      expect(store.connectError()).toBe('Mauvais appareil.');
      expect(call).toHaveBeenCalledOnce();
    });

    it("une erreur du serveur devient un message, sans casser la détection", async () => {
      call = vi.fn(() => throwError(() => ({ code: 'functions/permission-denied', message: 'Session expirée.' })));
      const store = create();
      await vi.advanceTimersByTimeAsync(0);

      expect(store.connectError()).toBeTruthy();
      expect(store.isInstalled()).toBe(true);
    });

    it("n'émet aucun jeton sans session ouverte sur cet appareil", async () => {
      sessionStatus.set('opening');
      create();
      await vi.advanceTimersByTimeAsync(0);

      expect(call).not.toHaveBeenCalled();
    });

    it("n'émet aucun jeton si l'extension n'est pas installée", async () => {
      answer = { status: 'absent' };
      create();
      await vi.advanceTimersByTimeAsync(0);

      expect(call).not.toHaveBeenCalled();
    });
  });
});
