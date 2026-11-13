import { inject, Injectable } from '@angular/core';
import { Assure, CanonicalPath, NeedInput, CanonicalValue, Dossier, DossierEvent, DossierStatus, Insurer, Member, Product } from '@shared';
import { combineLatest, map, Observable, of } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseQueryBuilder, OrderByDirection } from '../../../../core/providers/database-query.builder';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { AssureModel } from '../../../../core/entities/assure.model';
import { InsurerModel } from '../../../../core/entities/insurer.model';
import { MemberModel } from '../../../../core/entities/member.model';
import { ProductModel } from '../../../../core/entities/product.model';
import { DossierEventModel } from '../models/entities/dossier-event.model';
import { DossierModel } from '../../../../core/entities/dossier.model';

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
    return this._database.list(
      DossierModel.entity(cabinetId),
      new DatabaseQueryBuilder().orderBy('createdAt', OrderByDirection.desc).build(),
    );
  }

  /** Une tranche de la liste : les `limit` dossiers les plus récents (défilement infini). */
  watchDossiersPage(cabinetId: string, limit: number): Observable<{ dossiers: Dossier[]; hasMore: boolean }> {
    return this._database
      .list(DossierModel.entity(cabinetId), new DatabaseQueryBuilder().orderBy('createdAt', OrderByDirection.desc).limit(limit).build())
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
      .listByIds(DossierModel.entity(cabinetId), ids)
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
    return this._database.watchById(DossierModel.entity(cabinetId), dossierId);
  }

  watchAssure(cabinetId: string, assureId: string): Observable<Assure | null> {
    return this._database.watchById(AssureModel.entity(cabinetId), assureId);
  }

  /** Historique du dossier, du plus récent au plus ancien : les `limit` derniers événements (défilement infini). */
  watchEvents(cabinetId: string, dossierId: string, limit: number): Observable<{ events: DossierEvent[]; hasMore: boolean }> {
    return this._database
      .list(DossierEventModel.entity(cabinetId, dossierId), new DatabaseQueryBuilder().orderBy('at', OrderByDirection.desc).limit(limit).build())
      .pipe(map((events) => ({ events, hasMore: events.length >= limit })));
  }

  /**
   * Produits vus par le cabinet (questionnaire compris) : catalogue global et produits du cabinet,
   * archivés compris pour que leurs dossiers restent lisibles (un nouveau dossier les écarte).
   */
  watchProducts(cabinetId: string): Observable<Product[]> {
    return combineLatest([
      this._database.list(ProductModel.entity),
      this._database.list(ProductModel.cabinetEntity(cabinetId)),
    ]).pipe(map(([global, cabinet]) => [...global, ...cabinet]));
  }

  /**
   * Assureurs vus par le cabinet (tarification, historique) : catalogue global et assureurs du cabinet,
   * archivés compris pour que l'historique garde leur nom (la tarification les écarte).
   */
  watchInsurers(cabinetId: string): Observable<Insurer[]> {
    return combineLatest([
      this._database.list(InsurerModel.entity),
      this._database.list(InsurerModel.cabinetEntity(cabinetId)),
    ]).pipe(map(([global, cabinet]) => [...global, ...cabinet]));
  }

  watchMembers(cabinetId: string): Observable<Member[]> {
    return this._database.list(MemberModel.entity(cabinetId));
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
