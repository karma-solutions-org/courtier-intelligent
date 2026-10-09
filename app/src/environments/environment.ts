// Base de test : projet Firebase aibs-partenaire-testing (partagé avec aibs-partenaire).
export const environment = {
  production: true,
  useEmulators: false,
  /**
   * Identifiant de l'extension Chrome « Courtier Intelligent » (chrome://extensions, mode développeur) : l'app s'en sert
   * pour détecter l'extension. Vide : la détection est désactivée.
   */
  extensionId: '',
  firebaseConfig: {
    apiKey: 'AIzaSyDq9ewLvlEluB0AMN_PRHG-a1G7nRTxYOw',
    authDomain: 'aibs-partenaire-testing.firebaseapp.com',
    projectId: 'aibs-partenaire-testing',
    storageBucket: 'aibs-partenaire-testing.appspot.com',
    messagingSenderId: '244765868255',
    appId: '1:244765868255:web:45560f8ebd1b4b8787296a',
    measurementId: 'G-M7FV2122CW',
  },
};
