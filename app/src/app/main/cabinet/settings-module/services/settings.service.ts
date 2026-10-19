import { inject, Injectable } from '@angular/core';
import { AuditLogEntry, Cabinet, CabinetRole, Insurer, Invitation, Member, MemberStatus, mergeInsurers, mergeProducts, Product } from '@shared';
import { combineLatest, map, Observable, switchMap } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { StorageProvider } from '../../../../core/providers/storage.provider';
import { CabinetInfoModel } from '../models/cabinet-info.model';
import { CatalogChoicesModel } from '../models/catalog-choices.model';

/** Saisie d'un produit propre au cabinet (éditeur). */
export interface CabinetProductInput {
  id: string;
  name: string;
  questionnaireSchema: Product['questionnaireSchema'];
  guaranteeCatalog: Product['guaranteeCatalog'];
}

/** Saisie d'un assureur propre au cabinet. */
export interface CabinetInsurerInput {
  name: string;
  extranetUrl: string;
  productsSupported: string[];
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _storage = inject(StorageProvider);
  private readonly _backend = inject(BackendProvider);

  watchCabinet(cabinetId: string): Observable<Cabinet | null> {
    return this._database.watchDocument<Cabinet>(`ci_cabinets/${cabinetId}`);
  }

  updateCabinet(cabinetId: string, info: CabinetInfoModel): Observable<void> {
    return this._database.update(`ci_cabinets/${cabinetId}`, { ...info });
  }

  uploadLogo(cabinetId: string, file: File): Observable<void> {
    return this._storage
      .upload(`cabinets/${cabinetId}/logo/logo`, file)
      .pipe(switchMap(logoPath => this._database.update(`ci_cabinets/${cabinetId}`, { logoPath })));
  }

  watchMembers(cabinetId: string): Observable<Member[]> {
    return this._database.watchCollection<Member>(`ci_cabinets/${cabinetId}/ci_members`, {
      orderBy: [{ field: 'createdAt' }],
    });
  }

  watchPendingInvitations(cabinetId: string): Observable<Invitation[]> {
    return this._database.watchCollection<Invitation>(`ci_cabinets/${cabinetId}/ci_invitations`, {
      filters: [{ field: 'status', operator: '==', value: 'pending' }],
    });
  }

  invite(email: string, role: CabinetRole): Observable<{ invitationId: string }> {
    return this._backend.call('equipe-inviter', { email, role, appUrl: location.origin });
  }

  setRole(uid: string, role: CabinetRole): Observable<{ success: boolean }> {
    return this._backend.call('equipe-changerRole', { uid, role });
  }

  cancelInvitation(invitationId: string): Observable<{ success: boolean }> {
    return this._backend.call('equipe-annulerInvitation', { invitationId });
  }

  /** Journal des connexions et des appareils : les `limit` dernières entrées, défilement infini (lecture réservée aux admins). */
  watchAuditLog(cabinetId: string, limit: number): Observable<{ entries: AuditLogEntry[]; hasMore: boolean }> {
    return this._database
      .watchCollection<AuditLogEntry>(`ci_cabinets/${cabinetId}/ci_auditLog`, {
        orderBy: [{ field: 'at', direction: 'desc' }],
        limit,
      })
      .pipe(map((entries) => ({ entries, hasMore: entries.length >= limit })));
  }

  resetDevice(uid: string): Observable<{ success: boolean; remaining: number }> {
    return this._backend.call('equipe-reinitialiserAppareil', { uid });
  }

  /** Produits proposés au cabinet : catalogue global et produits créés par le cabinet (hors archivés). */
  watchProducts(cabinetId: string): Observable<Product[]> {
    return combineLatest([
      this._database.watchCollection<Product>('ci_products'),
      this._database.watchCollection<Product>(`ci_cabinets/${cabinetId}/ci_products`),
    ]).pipe(map(([global, cabinet]) => mergeProducts(global, cabinet)));
  }

  /** Produit propre au cabinet : création (copie d'un produit ou vierge), modification, retrait (functions produits-*). */
  createProduct(name: string, baseProductId: string | null): Observable<{ id: string }> {
    return this._backend.call('produits-creer', { name, baseProductId });
  }

  /** Un produit du catalogue global est copié dans le cabinet : l'identifiant renvoyé est celui de la copie. */
  updateProduct(product: CabinetProductInput): Observable<{ ok: boolean; id: string }> {
    return this._backend.call('produits-modifier', product);
  }

  archiveProduct(id: string): Observable<{ ok: boolean }> {
    return this._backend.call('produits-archiver', { id });
  }

  /** Assureurs proposés au cabinet : catalogue global et assureurs ajoutés par le cabinet (hors archivés). */
  watchInsurers(cabinetId: string): Observable<Insurer[]> {
    return combineLatest([
      this._database.watchCollection<Insurer>('ci_insurers'),
      this._database.watchCollection<Insurer>(`ci_cabinets/${cabinetId}/ci_insurers`),
    ]).pipe(map(([global, cabinet]) => mergeInsurers(global, cabinet)));
  }

  /** Assureur propre au cabinet : ajout, modification, retrait (functions assureurs-*, admin). */
  addInsurer(insurer: CabinetInsurerInput): Observable<{ id: string }> {
    return this._backend.call('assureurs-ajouter', insurer);
  }

  /** Un assureur du catalogue global est copié dans le cabinet : l'identifiant renvoyé est celui de la copie. */
  updateInsurer(id: string, insurer: CabinetInsurerInput): Observable<{ ok: boolean; id: string }> {
    return this._backend.call('assureurs-modifier', { id, ...insurer });
  }

  archiveInsurer(id: string): Observable<{ ok: boolean }> {
    return this._backend.call('assureurs-archiver', { id });
  }

  /** Assureurs et produits que le cabinet utilise : seuls ceux-ci sont ensuite proposés. */
  saveCatalogChoices(cabinetId: string, choices: CatalogChoicesModel): Observable<void> {
    return this._database.update(`ci_cabinets/${cabinetId}`, { ...choices });
  }

  setStatus(uid: string, status: MemberStatus): Observable<{ success: boolean }> {
    return this._backend.call('equipe-activerMembre', { uid, status });
  }
}
