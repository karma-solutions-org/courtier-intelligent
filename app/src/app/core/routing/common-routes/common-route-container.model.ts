/** Chemins de la zone commune (authentification, accueil). */
export class CommonRouteContainerModel {
  static readonly HOME_ROUTE = { path: '', url: '/' };
  static readonly SIGNIN_ROUTE = { path: 'connexion', url: '/connexion' };
  static readonly FORGOT_PASSWORD_ROUTE = { path: 'mot-de-passe-oublie', url: '/mot-de-passe-oublie' };
}
