/** Informations du cabinet modifiables par son admin (mêmes champs que les règles Firestore). */
export interface CabinetInfoModel {
  name: string;
  orias: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}
