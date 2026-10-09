import { TestBed } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';
import { ExtensionPing, ExtensionProvider } from '../../../../core/providers/extension.provider';
import { ExtensionStore } from './extension.store';

describe('ExtensionStore', () => {
  let answer: ExtensionPing;
  let ping: ReturnType<typeof vi.fn>;

  const create = () => {
    TestBed.configureTestingModule({ providers: [{ provide: ExtensionProvider, useValue: { ping } }] });
    const store = TestBed.inject(ExtensionStore);
    TestBed.tick();
    return store;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    answer = { status: 'installed', version: '0.1.0' };
    ping = vi.fn(() => of(answer));
  });

  afterEach(() => vi.useRealTimers());

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

    answer = { status: 'installed', version: '0.1.0' };
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
});
