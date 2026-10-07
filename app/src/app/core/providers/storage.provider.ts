import { inject, Injectable } from '@angular/core';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { from, Observable, switchMap } from 'rxjs';
import { FIREBASE_STORAGE } from './firebase';

/** Port stockage de fichiers. */
export abstract class StorageProvider {
  /** Envoie le fichier et retourne son URL de téléchargement. */
  abstract upload(path: string, file: Blob): Observable<string>;
  abstract getUrl(path: string): Observable<string>;
  abstract delete(path: string): Observable<void>;
}

@Injectable()
export class FirestorageProvider extends StorageProvider {
  private readonly _storage = inject(FIREBASE_STORAGE);

  upload(path: string, file: Blob): Observable<string> {
    const fileRef = ref(this._storage, path);
    return from(uploadBytes(fileRef, file)).pipe(switchMap(() => getDownloadURL(fileRef)));
  }

  getUrl(path: string): Observable<string> {
    return from(getDownloadURL(ref(this._storage, path)));
  }

  delete(path: string): Observable<void> {
    return from(deleteObject(ref(this._storage, path)));
  }
}
