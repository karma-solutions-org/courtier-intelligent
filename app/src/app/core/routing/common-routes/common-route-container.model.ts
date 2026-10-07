/** Chemins de la zone commune (page d'accueil publique, authentification, espace connecté). */
export class CommonRouteContainerModel {
  static readonly LANDING_ROUTE = { path: '', url: '/' };
  static readonly SIGNIN_ROUTE = { path: 'connexion', url: '/connexion' };
  static readonly SIGNUP_ROUTE = { path: 'inscription', url: '/inscription' };
  static readonly INVITATION_ROUTE = { path: 'invitation', url: '/invitation' };
  static readonly FORGOT_PASSWORD_ROUTE = { path: 'mot-de-passe-oublie', url: '/mot-de-passe-oublie' };
  static readonly HOME_ROUTE = { path: 'espace', url: '/espace' };
}
