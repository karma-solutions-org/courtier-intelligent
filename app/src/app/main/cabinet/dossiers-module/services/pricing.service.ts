import { inject, Injectable } from '@angular/core';
import { CanonicalData, DossierStatus, ManualOfferInput, Offer, QuoteJob } from '@shared';
import { Observable } from 'rxjs';
import { BackendProvider } from '../../../../core/providers/backend.provider';
import { DatabaseProvider } from '../../../../core/providers/database.provider';
import { StorageProvider } from '../../../../core/providers/storage.provider';

/** Devis joint à une offre saisie à la main (déjà envoyé dans Storage). */
export interface QuoteDocumentRef {
  storagePath: string;
  fileName: string;
}

/** Tarification d'un dossier : jobs suivis en temps réel, écritures via les functions `tarification-*`. */
@Injectable({ providedIn: 'root' })
export class PricingService {
  private readonly _database = inject(DatabaseProvider);
  private readonly _backend = inject(BackendProvider);
  private readonly _storage = inject(StorageProvider);

  /** Jobs du dossier, un par assureur (statut écrit par l'extension, en temps réel). */
  watchJobs(cabinetId: string, dossierId: string): Observable<QuoteJob[]> {
    return this._database.watchCollection<QuoteJob>(`cabinets/${cabinetId}/dossiers/${dossierId}/quoteJobs`);
  }

  watchOffers(cabinetId: string, dossierId: string): Observable<Offer[]> {
    return this._database.watchCollection<Offer>(`cabinets/${cabinetId}/dossiers/${dossierId}/offers`);
  }

  /** Lance (ou relance après un échec) la tarification chez un assureur. Renvoie l'adresse de son extranet. */
  launch(dossierId: string, insurerId: string): Observable<{ dossierStatus: DossierStatus; attempts: number; extranetUrl: string | null }> {
    return this._backend.call('tarification-lancer', { dossierId, insurerId });
  }

  /** Réponses aux champs manquants : enregistrées dans le dossier, l'extension reprend le remplissage. */
  complete(dossierId: string, insurerId: string, answers: CanonicalData): Observable<{ success: boolean }> {
    return this._backend.call('tarification-completer', { dossierId, insurerId, answers });
  }

  saveManualOffer(
    dossierId: string,
    insurerId: string,
    offer: ManualOfferInput,
    document: QuoteDocumentRef | null,
  ): Observable<{ dossierStatus: DossierStatus; documentId: string | null }> {
    return this._backend.call('tarification-saisirOffre', { dossierId, insurerId, offer, document });
  }

  uploadQuoteDocument(path: string, file: Blob): Observable<string> {
    return this._storage.upload(path, file);
  }
}
