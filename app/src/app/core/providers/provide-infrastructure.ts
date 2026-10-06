import { AuthenticationProvider, FireauthProvider } from './authentication.provider';
import { BackendProvider, FirebaseFunctionsProvider } from './backend.provider';
import { DatabaseProvider, FirestoreProvider } from './database.provider';
import { provideFirebase } from './firebase';
import { FirestorageProvider, StorageProvider } from './storage.provider';

/** Lie chaque port à son implémentation Firebase. Pour changer de backend, seul ce fichier change. */
export function provideInfrastructure() {
  return [
    ...provideFirebase(),
    { provide: AuthenticationProvider, useClass: FireauthProvider },
    { provide: DatabaseProvider, useClass: FirestoreProvider },
    { provide: BackendProvider, useClass: FirebaseFunctionsProvider },
    { provide: StorageProvider, useClass: FirestorageProvider },
  ];
}
