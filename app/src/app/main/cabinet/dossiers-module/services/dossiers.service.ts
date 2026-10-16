import { inject, Injectable } from '@angular/core';
import { Assure, CanonicalPath, NeedInput, CanonicalValue, Dossier, DossierEvent, DossierStatus, Insurer, Member, Product, VehicleInfo } from '@shared';
import { combineLatest, map, Observable, of } from 'rxjs';
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

  /** Tous les dossiers du cabinet, corbeille comprise, du plus récent au plus ancien (statistiques). */
  watchAllDossiers(cabinetId: string): Observable<Dossier[]> {
    return this._database.watchCollection<Dossier>(`ci_cabinets/${cabinetId}/ci_dossiers`, {
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  }

  /** Une tranche de la liste : les `limit` dossiers les plus récents (défilement infini). */
  watchDossiersPage(cabinetId: string, limit: number): Observable<{ dossiers: Dossier[]; hasMore: boolean }> {
    return this._database
      .watchCollection<Dossier>(`ci_cabinets/${cabinetId}/ci_dossiers`, {
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit,
      })
      .pipe(map((dossiers) => ({ dossiers: dossiers.filter((dossier) => !dossier.deletedAt), hasMore: dossiers.length >= limit })));
  }

  /**
   * Recherche Elasticsearch (function recherche-dossiers) : identifiants des dossiers du cabinet hors corbeille,
   * par pertinence (ou du plus récent au plus ancien sans texte), filtres appliqués par le serveur.
   */
  search(params: { q: string; size: number; from?: number; status?: string; productId?: string; assignedTo?: string; assureId?: string }): Observable<string[]> {
    const data = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined));
    return this._backend.call<typeof data, { ids: string[] }>('recherche-dossiers', data).pipe(map((result) => result.ids));
  }

  /** Dossiers trouvés, en direct et dans l'ordre donné (dossiers dans la corbeille ou disparus écartés). */
  watchDossiersByIds(cabinetId: string, ids: string[]): Observable<Dossier[]> {
    return this._database
      .watchByIds<Dossier>(`ci_cabinets/${cabinetId}/ci_dossiers`, ids)
      .pipe(map((dossiers) => dossiers.filter((dossier) => !dossier.deletedAt)));
  }

  /** Classe le dossier sans suite (motif obligatoire) : les tarifications en cours sont annulées. */
  classerSansSuite(dossierId: string, motif: string): Observable<{ status: DossierStatus; cancelledJobs: number }> {
    return this._backend.call('dossiers-classerSansSuite', { dossierId, motif });
  }

  /** Met le dossier dans la corbeille (admin). */
  remove(dossierId: string): Observable<{ ok: boolean }> {
    return this._backend.call('corbeille-supprimer', { kind: 'dossier', id: dossierId });
  }

  watchDossier(cabinetId: string, dossierId: string): Observable<Dossier | null> {
    return this._database.watchDocument<Dossier>(`ci_cabinets/${cabinetId}/ci_dossiers/${dossierId}`);
  }

  watchAssure(cabinetId: string, assureId: string): Observable<Assure | null> {
    return this._database.watchDocument<Assure>(`ci_cabinets/${cabinetId}/ci_assures/${assureId}`);
  }

  /** Historique du dossier, du plus récent au plus ancien : les `limit` derniers événements (défilement infini). */
  watchEvents(cabinetId: string, dossierId: string, limit: number): Observable<{ events: DossierEvent[]; hasMore: boolean }> {
    return this._database
      .watchCollection<DossierEvent>(`ci_cabinets/${cabinetId}/ci_dossiers/${dossierId}/ci_events`, {
        orderBy: [{ field: 'at', direction: 'desc' }],
        limit,
      })
      .pipe(map((events) => ({ events, hasMore: events.length >= limit })));
  }

  /**
   * Produits vus par le cabinet (questionnaire compris) : catalogue global et produits du cabinet,
   * archivés compris pour que leurs dossiers restent lisibles (un nouveau dossier les écarte).
   */
  watchProducts(cabinetId: string): Observable<Product[]> {
    return combineLatest([
      this._database.watchCollection<Product>('ci_products'),
      this._database.watchCollection<Product>(`ci_cabinets/${cabinetId}/ci_products`),
    ]).pipe(map(([global, cabinet]) => [...global, ...cabinet]));
  }

  /**
   * Assureurs vus par le cabinet (tarification, historique) : catalogue global et assureurs du cabinet,
   * archivés compris pour que l'historique garde leur nom (la tarification les écarte).
   */
  watchInsurers(cabinetId: string): Observable<Insurer[]> {
    return combineLatest([
      this._database.watchCollection<Insurer>('ci_insurers'),
      this._database.watchCollection<Insurer>(`ci_cabinets/${cabinetId}/ci_insurers`),
    ]).pipe(map(([global, cabinet]) => [...global, ...cabinet]));
  }

  watchMembers(cabinetId: string): Observable<Member[]> {
    return this._database.watchCollection<Member>(`ci_cabinets/${cabinetId}/ci_members`);
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

  /** Véhicule correspondant à une plaque (SIV ou FNI) : rien n'est enregistré, l'app pré-remplit le questionnaire. */
  lookupVehicle(plate: string): Observable<VehicleInfo> {
    return this._backend
      .call<{ plate: string }, { vehicle: VehicleInfo }>('vehicules-rechercher', { plate })
      .pipe(map((result) => result.vehicle));
  }

  assign(dossierId: string, uid: string): Observable<{ success: boolean }> {
    return this._backend.call('dossiers-assigner', { dossierId, uid });
  }
}
