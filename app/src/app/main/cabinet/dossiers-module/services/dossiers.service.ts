import { inject, Injectable } from '@angular/core';
import { Assure, CanonicalPath, NeedInput, CanonicalValue, Dossier, DossierEvent, DossierStatus, Insurer, Member, Product } from '@shared';
import { Observable } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';

/** Réponse de `dossiers-sauvegarder` : statut (peut repasser en brouillon) et complétude recalculée par le serveur. */
export interface SaveResult {
  status: DossierStatus;
  completeness: { ok: boolean; missing: CanonicalPath[] };
}

/** Modifications du questionnaire : chemin canonique → nouvelle valeur (`null` efface). */
export type AnswerPatch = Partial<Record<CanonicalPath, CanonicalValue>>;

@Injectable({ providedIn: 'root' })
export class DossiersService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _backend = inject(BackendProvider);

  /** Tous les dossiers du cabinet, du plus récent au plus ancien : filtres et pagination se font côté app. */
  watchDossiers(cabinetId: string): Observable<Dossier[]> {
    return this._database.watchCollection<Dossier>(`cabinets/${cabinetId}/dossiers`, {
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  }

  watchDossier(cabinetId: string, dossierId: string): Observable<Dossier | null> {
    return this._database.watchDocument<Dossier>(`cabinets/${cabinetId}/dossiers/${dossierId}`);
  }

  watchAssure(cabinetId: string, assureId: string): Observable<Assure | null> {
    return this._database.watchDocument<Assure>(`cabinets/${cabinetId}/assures/${assureId}`);
  }

  /** Historique du dossier, du plus récent au plus ancien. */
  watchEvents(cabinetId: string, dossierId: string): Observable<DossierEvent[]> {
    return this._database.watchCollection<DossierEvent>(`cabinets/${cabinetId}/dossiers/${dossierId}/events`, {
      orderBy: [{ field: 'at', direction: 'desc' }],
    });
  }

  /** Catalogue des produits (questionnaire compris). */
  watchProducts(): Observable<Product[]> {
    return this._database.watchCollection<Product>('products');
  }

  /** Catalogue des assureurs (tarification, historique). */
  watchInsurers(): Observable<Insurer[]> {
    return this._database.watchCollection<Insurer>('insurers');
  }

  watchMembers(cabinetId: string): Observable<Member[]> {
    return this._database.watchCollection<Member>(`cabinets/${cabinetId}/members`);
  }

  /** Crée le dossier en brouillon : la référence est attribuée par le serveur. */
  create(assureId: string, productId: string): Observable<{ dossierId: string; reference: string }> {
    return this._backend.call('dossiers-creer', { assureId, productId });
  }

  save(dossierId: string, patch: AnswerPatch, options: { sectionIndex?: number; event?: boolean } = {}): Observable<SaveResult> {
    return this._backend.call('dossiers-sauvegarder', { dossierId, patch, ...options });
  }

  changeStatus(dossierId: string, status: DossierStatus): Observable<{ status: DossierStatus }> {
    return this._backend.call('dossiers-changerStatut', { dossierId, status });
  }

  /** Enregistre l'analyse du besoin (chaque modification est tracée côté serveur). */
  saveNeed(dossierId: string, need: NeedInput): Observable<{ status: DossierStatus; changed: string[] }> {
    return this._backend.call('dossiers-enregistrerBesoin', { dossierId, need });
  }

  /** Valide le besoin : le dossier passe en « besoin validé ». */
  validateNeed(dossierId: string): Observable<{ status: DossierStatus }> {
    return this._backend.call('dossiers-validerBesoin', { dossierId });
  }

  assign(dossierId: string, uid: string): Observable<{ success: boolean }> {
    return this._backend.call('dossiers-assigner', { dossierId, uid });
  }
}
