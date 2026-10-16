import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChromeExtensionProvider } from './extension.provider';

type Callback = (response?: { type?: string; version?: string; signedIn?: boolean; uid?: string | null; message?: string }) => void;

/** Remplace `chrome.runtime` : l'extension répond (ou non) au message `PING` de l'app. */
function stubChrome(onMessage: (extensionId: string, message: unknown, callback: Callback, runtime: { lastError?: unknown }) => void) {
  const runtime: { lastError?: unknown; sendMessage: (id: string, message: unknown, callback: Callback) => void } = {
    sendMessage: (id, message, callback) => onMessage(id, message, callback, runtime),
  };
  vi.stubGlobal('chrome', { runtime });
}

describe('ChromeExtensionProvider', () => {
  const provider = new ChromeExtensionProvider();
  const originalId = environment.extensionId;

  beforeEach(() => {
    environment.extensionId = 'abcdefghijklmnopabcdefghijklmnop';
  });

  afterEach(() => {
    environment.extensionId = originalId;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("envoie PING à l'extension et lit sa version dans la réponse PONG", async () => {
    const sent: unknown[] = [];
    stubChrome((id, message, callback) => {
      sent.push([id, message]);
      callback({ type: 'PONG', version: '0.2.0' });
    });

    expect(await firstValueFrom(provider.ping())).toEqual({ status: 'installed', version: '0.2.0', signedIn: false, uid: null });
    expect(sent).toEqual([['abcdefghijklmnopabcdefghijklmnop', { type: 'PING' }]]);
  });

  it("lit dans le PONG si l'extension est connectée, et à quel compte", async () => {
    stubChrome((_id, _message, callback) => callback({ type: 'PONG', version: '0.2.0', signedIn: true, uid: 'u1' }));

    expect(await firstValueFrom(provider.ping())).toEqual({ status: 'installed', version: '0.2.0', signedIn: true, uid: 'u1' });
  });

  describe('connect', () => {
    it("transmet le jeton et l'appareil à l'extension (CONNECT) et lit la réussite", async () => {
      const sent: unknown[] = [];
      stubChrome((id, message, callback) => {
        sent.push([id, message]);
        callback({ type: 'CONNECTED', uid: 'u1' });
      });

      expect(await firstValueFrom(provider.connect('jeton', 'appareil-1'))).toEqual({ ok: true });
      expect(sent).toEqual([['abcdefghijklmnopabcdefghijklmnop', { type: 'CONNECT', token: 'jeton', deviceId: 'appareil-1' }]]);
    });

    it("rapporte le message de refus de l'extension", async () => {
      stubChrome((_id, _message, callback) => callback({ type: 'CONNECT_FAILED', message: 'Mauvais appareil.' }));

      expect(await firstValueFrom(provider.connect('jeton', 'appareil-1'))).toEqual({ ok: false, message: 'Mauvais appareil.' });
    });

    it("échoue proprement quand l'extension est injoignable", async () => {
      stubChrome((_id, _message, callback, runtime) => {
        runtime.lastError = { message: 'Could not establish connection' };
        callback(undefined);
      });

      expect(await firstValueFrom(provider.connect('jeton', 'appareil-1'))).toMatchObject({ ok: false });
    });

    it("échoue après le délai quand l'extension ne répond jamais", async () => {
      vi.useFakeTimers();
      stubChrome(() => undefined);

      const result = firstValueFrom(provider.connect('jeton', 'appareil-1'));
      await vi.advanceTimersByTimeAsync(20_100);

      expect(await result).toMatchObject({ ok: false });
    });
  });

  it("conclut « absente » quand Chrome signale que l'extension est injoignable (lastError)", async () => {
    stubChrome((_id, _message, callback, runtime) => {
      runtime.lastError = { message: 'Could not establish connection' };
      callback(undefined);
    });

    expect(await firstValueFrom(provider.ping())).toEqual({ status: 'absent' });
  });

  it("conclut « absente » quand la réponse n'est pas un PONG", async () => {
    stubChrome((_id, _message, callback) => callback({ type: 'AUTRE' }));

    expect(await firstValueFrom(provider.ping())).toEqual({ status: 'absent' });
  });

  it("conclut « absente » quand l'envoi lève une erreur", async () => {
    stubChrome(() => {
      throw new Error('Invalid extension id');
    });

    expect(await firstValueFrom(provider.ping())).toEqual({ status: 'absent' });
  });

  it("conclut « absente » quand l'extension ne répond jamais", async () => {
    vi.useFakeTimers();
    stubChrome(() => undefined);

    const result = firstValueFrom(provider.ping());
    await vi.advanceTimersByTimeAsync(2100);

    expect(await result).toEqual({ status: 'absent' });
  });

  it("sans identifiant d'extension configuré, la détection est désactivée", async () => {
    environment.extensionId = '';
    stubChrome(() => {
      throw new Error("ne doit pas être appelé");
    });

    expect(await firstValueFrom(provider.ping())).toEqual({ status: 'unconfigured' });
  });

  it('un navigateur Chromium sans chrome.runtime (extension non installée) : absente', async () => {
    vi.stubGlobal('chrome', undefined);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36');

    expect(await firstValueFrom(provider.ping())).toEqual({ status: 'absent' });
  });

  it('un navigateur sans extensions Chrome (Firefox, Safari) : non supporté', async () => {
    vi.stubGlobal('chrome', undefined);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/130.0');

    expect(await firstValueFrom(provider.ping())).toEqual({ status: 'unsupported' });
  });
});
