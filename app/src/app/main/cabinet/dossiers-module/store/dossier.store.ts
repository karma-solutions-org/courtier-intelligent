import { signalStore, withState } from '@ngrx/signals';
import { withNotice } from '../../../../core/store-features/with-notice';
import { DossierState, initialDossierState } from './dossier/dossier.state';
import { withClientPieces } from './dossier/with-client-pieces.feature';
import { withDossierClosing } from './dossier/with-dossier-closing.feature';
import { withDossierDerived } from './dossier/with-dossier-derived.feature';
import { withDossierEvents } from './dossier/with-dossier-events.feature';
import { withDossierSync } from './dossier/with-dossier-sync.feature';
import { withDossierWrites } from './dossier/with-dossier-writes.feature';

export type { SaveStatus } from './dossier/dossier.state';
export type { AddInsurersInput } from './dossier/with-dossier-writes.feature';

/**
 * Store d'un dossier (fourni par la route), composé d'une feature par responsabilité (voir `store/dossier/`) :
 *
 * | Feature              | Rôle                                                                              |
 * |----------------------|-----------------------------------------------------------------------------------|
 * | `withDossierDerived` | valeurs calculées : produit, questionnaire, complétude, besoin, droits d'édition |
 * | `withDossierWrites`  | saisie, file d'écritures (une à la fois, vers le dossier figé), sauvegarde auto  |
 * | `withDossierSync`    | lecture en temps réel du dossier et de ses référentiels                           |
 * | `withDossierEvents`  | historique, par tranches                                                          |
 * | `withDossierClosing` | classement sans suite, mise à la corbeille                                        |
 * | `withClientPieces`   | reprise des pièces du client dans un brouillon                                    |
 *
 * Chaque feature ne parle qu'aux services (`DossiersService`, `DocumentsService`) : aucun accès direct à Firestore.
 */
export const DossierStore = signalStore(
  withState<DossierState>(initialDossierState),
  withNotice(),
  withDossierDerived(),
  withDossierWrites(),
  withDossierSync(),
  withDossierEvents(),
  withDossierClosing(),
  withClientPieces(),
);
