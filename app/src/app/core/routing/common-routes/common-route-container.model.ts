/** Chemins de la zone commune (page d'accueil publique, authentification, espace connecté). */
export class CommonRouteContainerModel {
  static readonly LANDING_ROUTE = { path: '', url: '/' };
  static readonly SIGNIN_ROUTE = { path: 'connexion', url: '/connexion' };
  static readonly SIGNUP_ROUTE = { path: 'inscription', url: '/inscription' };
  static readonly INVITATION_ROUTE = { path: 'invitation', url: '/invitation' };
  static readonly FORGOT_PASSWORD_ROUTE = { path: 'mot-de-passe-oublie', url: '/mot-de-passe-oublie' };
  static readonly DEVICE_NOT_AUTHORIZED_ROUTE = { path: 'appareil-non-autorise', url: '/appareil-non-autorise' };
  static readonly SESSION_REPLACED_ROUTE = { path: 'session-ouverte-ailleurs', url: '/session-ouverte-ailleurs' };
  static readonly HOME_ROUTE = { path: 'espace', url: '/espace' };
}
