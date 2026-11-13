import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { Assure, AssureDocument, Dossier } from '@shared';
import { TabQueryParamDirective } from '../../../../../../core/directives/tab-query-param.directive';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { StatusChipComponent } from '../../../../dossiers-module/components/status-chip/status-chip.component';
import { AssureFormModel } from '../../../models/assure-form.model';
import { DuplicateCandidate, DuplicateMatch, displayName } from '../../../util/assures.utils';
import { AssureFormPresentationComponent } from '../../assure-form/assure-form-presentation/assure-form-presentation.component';
import { ASSURES_STRUCTURE } from '../../assures.structure';

/** Statuts où le dossier n'avance plus. */
const CLOSED_STATUSES: Dossier['status'][] = ['souscrit', 'refuse'];

/**
 * Espace client : carte d'identité et actions à gauche (nouveau dossier, modifier, supprimer), onglets à droite
 * (informations en lecture, dossiers, pièces). La fiche ne se modifie que sur « Modifier la fiche ».
 */
@Component({
  selector: 'app-assure-detail-presentation',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatTabsModule, TabQueryParamDirective, AssureFormPresentationComponent, StatusChipComponent],
  templateUrl: './assure-detail-presentation.component.html',
  styleUrl: './assure-detail-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDetailPresentationComponent {
  /** Client affiché ; null tant qu'il n'est pas chargé ou s'il n'existe pas (voir `loaded`). */
  readonly assure = input<Assure | null>(null);
  readonly loaded = input(false);
  readonly dossiers = input<Dossier[]>([]);
  /** Pièces rangées avec le client (CIN, Kbis importés à sa création). */
  readonly documents = input<AssureDocument[]>([]);
  readonly isAdmin = input(false);
  /** La fiche se lit ; elle ne passe en saisie que sur « Modifier la fiche ». */
  readonly editing = input(false);
  readonly confirmingDelete = input(false);
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  readonly duplicates = input<DuplicateMatch[]>([]);

  readonly editStarted = output<void>();
  readonly editCancelled = output<void>();
  readonly confirmingDeleteChanged = output<boolean>();
  readonly deleteRequested = output<string>();
  readonly updateRequested = output<{ id: string; form: AssureFormModel }>();
  readonly candidateChanged = output<DuplicateCandidate>();
  readonly documentOpened = output<AssureDocument>();

  private readonly _form = viewChild(AssureFormPresentationComponent);

  protected readonly structure = ASSURES_STRUCTURE.detail;
  protected readonly typeLabels = ASSURES_STRUCTURE.typeLabels;
  protected readonly pieceText = ASSURES_STRUCTURE.piece;
  protected readonly listUrl = CabinetRouteContainerModel.CLIENTS_ROUTE.url;
  protected readonly newDossierUrl = CabinetRouteContainerModel.DOSSIER_NEW_ROUTE.url;
  protected readonly nameOf = displayName;

  protected readonly inProgress = computed(() => this.dossiers().filter((dossier) => !CLOSED_STATUSES.includes(dossier.status)).length);
  protected readonly won = computed(() => this.dossiers().filter((dossier) => dossier.status === 'souscrit').length);

  /** Formulaire de modification ouvert et modifié, pas encore enregistré (garde de sortie du container). */
  hasUnsavedChanges(): boolean {
    return this.editing() && !!this._form()?.hasUnsavedChanges();
  }

  /** Un brouillon se reprend dans son questionnaire, les autres s'ouvrent sur leur fiche. */
  protected dossierLink(dossier: Dossier): string[] {
    const base = [CabinetRouteContainerModel.DOSSIERS_ROUTE.url, dossier.id];
    return dossier.status === 'brouillon' ? [...base, 'brouillon'] : base;
  }

  protected initials(assure: Assure): string {
    const words = displayName(assure).trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /** Détails affichés en lecture : la société d'abord pour un professionnel. */
  protected detailsOf(assure: Assure): { label: string; value: string | null | undefined }[] {
    const fields = this.structure.fields;
    const company =
      assure.type === 'pro'
        ? [
            { label: fields.companyName, value: assure.companyName },
            { label: fields.siret, value: assure.siret },
          ]
        : [];
    return [
      ...company,
      { label: fields.civilite, value: assure.civilite },
      { label: fields.lastName, value: assure.lastName },
      { label: fields.firstName, value: assure.firstName },
      { label: fields.birthDate, value: formatDate(assure.birthDate) },
      { label: fields.email, value: assure.email },
      { label: fields.phone, value: assure.phone },
      { label: fields.street, value: assure.address?.street },
      { label: fields.postalCode, value: assure.address?.postalCode },
      { label: fields.city, value: assure.address?.city },
    ];
  }
}

/** « 1985-04-12 » → « 12/04/1985 ». */
function formatDate(iso: string | null | undefined): string | null {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (iso ?? null);
}
