import { inject, Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { FIREBASE_STORAGE } from './firebase';

/** Port stockage de fichiers. */
export abstract class StorageProvider {
  /** Envoie le fichier et retourne son URL de téléchargement. */
  abstract upload(path: string, file: Blob): Observable<string>;
  abstract getUrl(path: string): Observable<string>;
  abstract delete(path: string): Observable<void>;
}

/** Le SDK Storage est chargé à la première utilisation (hors du bundle initial). */
@Injectable()
export class FirestorageProvider extends StorageProvider {
  private readonly _storage = inject(FIREBASE_STORAGE);

  private async _sdk() {
    const [sdk, storage] = await Promise.all([import('firebase/storage'), this._storage()]);
    return { sdk, storage };
  }

  upload(path: string, file: Blob): Observable<string> {
    return defer(async () => {
      const { sdk, storage } = await this._sdk();
      const fileRef = sdk.ref(storage, path);
      await sdk.uploadBytes(fileRef, file);
      return sdk.getDownloadURL(fileRef);
    });
  }

  getUrl(path: string): Observable<string> {
    return defer(async () => {
      const { sdk, storage } = await this._sdk();
      return sdk.getDownloadURL(sdk.ref(storage, path));
    });
  }

  delete(path: string): Observable<void> {
    return defer(async () => {
      const { sdk, storage } = await this._sdk();
      await sdk.deleteObject(sdk.ref(storage, path));
    });
  }
}
