export interface SignupModel {
  displayName: string;
  email: string;
  password: string;
  /** Nom du cabinet à créer. Absent quand l'utilisateur s'inscrit pour rejoindre un cabinet (invitation). */
  cabinetName?: string;
}
