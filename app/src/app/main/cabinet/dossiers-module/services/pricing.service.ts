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
    return this._database.watchCollection<QuoteJob>(
      `ci_cabinets/${cabinetId}/ci_dossiers/${dossierId}/ci_quoteJobs`,
    );
  }

  watchOffers(cabinetId: string, dossierId: string): Observable<Offer[]> {
    return this._database.watchCollection<Offer>(
      `ci_cabinets/${cabinetId}/ci_dossiers/${dossierId}/ci_offers`,
    );
  }

  /** Annule une tarification en cours (bloquée, ou devenue inutile) : elle pourra être relancée. */
  cancel(dossierId: string, insurerId: string): Observable<{ status: 'cancelled' }> {
    return this._backend.call('tarification-annuler', { dossierId, insurerId });
  }

  /** Lance (ou relance après un échec) la tarification chez un assureur. Renvoie l'adresse de son extranet. */
  launch(
    dossierId: string,
    insurerId: string,
  ): Observable<{ dossierStatus: DossierStatus; attempts: number; extranetUrl: string | null }> {
    return this._backend.call('tarification-lancer', { dossierId, insurerId });
  }

  /** Réponses aux champs manquants : enregistrées dans le dossier, l'extension reprend le remplissage. */
  complete(
    dossierId: string,
    insurerId: string,
    answers: CanonicalData,
  ): Observable<{ success: boolean }> {
    return this._backend.call('tarification-completer', { dossierId, insurerId, answers });
  }

  /** Saisie manuelle d'une offre (extension en échec, devis reçu autrement…), avec le devis joint s'il y en a un. */
  saveManualOffer(
    dossierId: string,
    insurerId: string,
    offer: ManualOfferInput,
    document: QuoteDocumentRef | null,
  ): Observable<{ dossierStatus: DossierStatus; documentId: string | null }> {
    return this._backend.call('tarification-saisirOffre', {
      dossierId,
      insurerId,
      offer,
      document,
    });
  }

  /**
   * Le courtier valide le tarif lu par l'extension (« à vérifier »). Seule écriture directe de l'app sur une offre :
   * les règles Firestore n'y autorisent que l'état de vérification, son auteur et sa date.
   */
  validateOffer(cabinetId: string, dossierId: string, insurerId: string, uid: string): Observable<void> {
    return this._database.update(`ci_cabinets/${cabinetId}/ci_dossiers/${dossierId}/ci_offers/${insurerId}`, {
      review: 'validated',
      reviewedBy: uid,
      reviewedAt: this._database.serverTimestamp(),
    });
  }

  uploadQuoteDocument(path: string, file: Blob): Observable<string> {
    return this._storage.upload(path, file);
  }
}
