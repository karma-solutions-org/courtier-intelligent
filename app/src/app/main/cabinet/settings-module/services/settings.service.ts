import { inject, Injectable } from '@angular/core';
import { AuditLogEntry, Cabinet, CabinetRole, Insurer, Invitation, Member, MemberStatus, Product } from '@shared';
import { map, Observable, switchMap } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseQueryBuilder, FilterOperator, OrderByDirection } from '../../../../core/providers/database-query.builder';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { CabinetModel } from '../../../../core/entities/cabinet.model';
import { InsurerModel } from '../../../../core/entities/insurer.model';
import { MemberModel } from '../../../../core/entities/member.model';
import { ProductModel } from '../../../../core/entities/product.model';
import { AuditLogEntryModel } from '../models/entities/audit-log-entry.model';
import { InvitationModel } from '../models/entities/invitation.model';
import { StorageProvider } from '../../../../core/providers/storage.provider';
import { CabinetInfoModel } from '../models/cabinet-info.model';
import { CatalogChoicesModel } from '../models/catalog-choices.model';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _storage = inject(StorageProvider);
  private readonly _backend = inject(BackendProvider);

  watchCabinet(cabinetId: string): Observable<Cabinet | null> {
    return this._database.watchById(CabinetModel.entity, cabinetId);
  }

  updateCabinet(cabinetId: string, info: CabinetInfoModel): Observable<void> {
    return this._database.updateById(CabinetModel.entity, cabinetId, { ...info });
  }

  uploadLogo(cabinetId: string, file: File): Observable<void> {
    return this._storage
      .upload(`cabinets/${cabinetId}/logo/logo`, file)
      .pipe(switchMap(logoPath => this._database.updateById(CabinetModel.entity, cabinetId, { logoPath })));
  }

  watchMembers(cabinetId: string): Observable<Member[]> {
    return this._database.list(MemberModel.entity(cabinetId), new DatabaseQueryBuilder().orderBy('createdAt').build());
  }

  watchPendingInvitations(cabinetId: string): Observable<Invitation[]> {
    return this._database.list(
      InvitationModel.entity(cabinetId),
      new DatabaseQueryBuilder().where('status', FilterOperator.isEqualTo, 'pending').build(),
    );
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
      .list(AuditLogEntryModel.entity(cabinetId), new DatabaseQueryBuilder().orderBy('at', OrderByDirection.desc).limit(limit).build())
      .pipe(map((entries) => ({ entries, hasMore: entries.length >= limit })));
  }

  resetDevice(uid: string): Observable<{ success: boolean; remaining: number }> {
    return this._backend.call('equipe-reinitialiserAppareil', { uid });
  }

  /** Produits du catalogue, publiés depuis le dépôt back : le cabinet choisit ceux qu'il utilise, sans les modifier. */
  watchProducts(): Observable<Product[]> {
    return this._database.list(ProductModel.entity).pipe(map(sortByName));
  }

  /** Assureurs et leurs extranets, publiés comme les produits : le cabinet choisit, sans ajouter ni modifier. */
  watchInsurers(): Observable<Insurer[]> {
    return this._database.list(InsurerModel.entity).pipe(map(sortByName));
  }

  /** Assureurs et produits que le cabinet utilise : seuls ceux-ci sont ensuite proposés. */
  saveCatalogChoices(cabinetId: string, choices: CatalogChoicesModel): Observable<void> {
    return this._database.updateById(CabinetModel.entity, cabinetId, { ...choices });
  }

  setStatus(uid: string, status: MemberStatus): Observable<{ success: boolean }> {
    return this._backend.call('equipe-activerMembre', { uid, status });
  }
}

const sortByName = <T extends { name: string }>(items: T[]): T[] => [...items].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
