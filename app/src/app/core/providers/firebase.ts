import { InjectionToken } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, initializeFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, Functions, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, FirebaseStorage, getStorage } from 'firebase/storage';
import { environment } from '../../../environments/environment';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');
export const FIREBASE_FUNCTIONS = new InjectionToken<Functions>('FIREBASE_FUNCTIONS');
export const FIREBASE_STORAGE = new InjectionToken<FirebaseStorage>('FIREBASE_STORAGE');

/** Initialise le SDK Firebase une seule fois et expose chaque service via un token. */
export function provideFirebase() {
  const app = initializeApp(environment.firebaseConfig);
  const auth = getAuth(app);
  const firestore = initializeFirestore(app, { ignoreUndefinedProperties: true });
  // Même région que les Cloud Functions de courtier-intelligent-back.
  const functions = getFunctions(app, 'europe-west3');
  const storage = getStorage(app);

  if (environment.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }

  return [
    { provide: FIREBASE_APP, useValue: app },
    { provide: FIREBASE_AUTH, useValue: auth },
    { provide: FIRESTORE, useValue: firestore },
    { provide: FIREBASE_FUNCTIONS, useValue: functions },
    { provide: FIREBASE_STORAGE, useValue: storage },
  ];
}
