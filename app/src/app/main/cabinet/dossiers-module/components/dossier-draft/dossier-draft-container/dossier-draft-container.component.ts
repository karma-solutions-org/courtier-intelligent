import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  input,
  linkedSignal,
  OnDestroy,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { HasUnsavedChanges } from '../../../../../../core/routing/guards/unsaved-changes.guard';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { DraftView } from '../../../models/dossier-draft.model';
import { DossierStore } from '../../../store/dossier.store';
import { sectionIndexOf } from '../../../util/dossiers.utils';
import { boundedSectionIndex, missingInSection } from '../../../util/draft.utils';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';
import { AnswerChange } from '../../questionnaire-form/questionnaire-form-presentation/questionnaire-form-presentation.component';
import { DossierDraftPresentationComponent } from '../dossier-draft-presentation/dossier-draft-presentation.component';

/**
 * « Nouveau dossier », étapes 3 à 5 : extranets à utiliser, documents, puis questionnaire section par section
 * (enregistré automatiquement, reprise exacte là où le courtier s'était arrêté). Le questionnaire ne pose que les
 * questions des extranets choisis. Une section ne se quitte qu'une fois ses champs obligatoires remplis ; la dernière
 * fait passer le dossier en « complet ».
 */
@Component({
  selector: 'app-dossier-draft-container',
  imports: [DossierDraftPresentationComponent],
  templateUrl: './dossier-draft-container.component.html',
  styleUrl: './dossier-draft-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDraftContainerComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(DossierStore);
  private readonly _router = inject(Router);
  private readonly _snackBar = inject(MatSnackBar);
  /** Dossier dont les pièces du client ont déjà été reprises pendant cette visite. */
  private _clientPiecesTakenFor: string | null = null;
  protected readonly structure = DOSSIERS_STRUCTURE.draft;

  protected readonly view = signal<DraftView>('extranets');
  /** Extranets cochés à l'écran : appliqués au questionnaire seulement au clic sur « Valider mon choix ». */
  protected readonly checkedInsurers = linkedSignal(() => this.store.selectedInsurers());
  protected readonly showMissing = signal(false);
  protected readonly validating = signal(false);

  /** Section affichée, bornée au questionnaire (la reprise peut venir d'un ancien enregistrement). */
  protected readonly sectionIndex = computed(() => boundedSectionIndex(this.store.sectionIndex(), this.store.schema().length));
  protected readonly currentSection = computed(() =>
    this.store.schema().slice(this.sectionIndex(), this.sectionIndex() + 1),
  );
  protected readonly isLastSection = computed(
    () => this.sectionIndex() >= this.store.schema().length - 1,
  );
  /** Champs obligatoires encore vides de la section affichée : « Suivant » reste bloqué tant qu'il y en a. */
  protected readonly sectionMissing = computed(() => missingInSection(this.currentSection(), this.store.missing()));

  protected readonly saveLabel = computed(() => {
    switch (this.store.saveStatus()) {
      case 'saving':
        return this.structure.saving;
      case 'saved':
        return this.structure.saved;
      case 'dirty':
        return this.structure.dirty;
      case 'error':
        return this.structure.error;
      default:
        return '';
    }
  });

  private _initialViewSet = false;
  /** Dossier déjà pré-rempli à l'ouverture : après les extranets, on va droit au questionnaire. */
  private _prefilled = false;

  constructor() {
    effect(() => this.store.select(this.id()));
    effect(() => {
      const dossier = this.store.dossier();
      if (!dossier) return;
      // Un dossier qui n'est plus modifiable n'a plus de brouillon à reprendre.
      if (!this.store.editable()) {
        this._router.navigate([CabinetRouteContainerModel.DOSSIERS_ROUTE.url, dossier.id]);
        return;
      }
      // Reprise : un dossier déjà complet ou un brouillon commencé rouvre au questionnaire, à la section où le
      // courtier s'était arrêté ; un brouillon pas encore commencé passe d'abord par le choix des extranets, même
      // pré-rempli (infos du client).
      if (!this._initialViewSet) {
        this._initialViewSet = true;
        this._prefilled = Object.keys(dossier.data ?? {}).length > 0;
        if (dossier.status !== 'brouillon' || this.store.sectionIndex() > 0) {
          this.view.set('questionnaire');
        }
      }
      // La validation a abouti : le dossier est complet, on ouvre sa fiche.
      if (this.validating() && dossier.status === 'complet') {
        this._router.navigate([CabinetRouteContainerModel.DOSSIERS_ROUTE.url, dossier.id]);
      }
    });
    effect(() => {
      // Pièces importées à la création du client (carte grise, permis…) : reprises dans le dossier, lues, et rangées
      // dans les champs vides. Ici et non dans l'étape Documents : un dossier pré-rempli s'ouvre au questionnaire.
      // La lecture commence à l'arrivée sur le questionnaire (pas pendant les extranets ni les documents).
      const dossier = this.store.dossier();
      if (!dossier || !this.store.editable() || !this.store.product() || this._clientPiecesTakenFor === dossier.id) return;
      if (this.view() !== 'questionnaire') return;
      this._clientPiecesTakenFor = dossier.id;
      untracked(() => this.store.takeClientPieces(dossier.id));
    });
    // Messages ponctuels du store (reprise des pièces du client).
    effect(() => {
      const notice = this.store.notice();
      if (notice) {
        this._snackBar.open(notice.text, undefined, { duration: notice.duration });
        untracked(() => this.store.clearNotice());
      }
    });
    effect(() => {
      // Une erreur de validation rend la main au courtier.
      if (this.store.error()) this.validating.set(false);
    });
  }

  ngOnInit(): void {
    this.store.setAutosave(true);
    this.store.clearMessages();
  }

  /** Garde de sortie de route : des modifications ne sont pas enregistrées. */
  hasUnsavedChanges(): boolean {
    return this.store.hasPendingEdits();
  }

  /** Fermeture ou rechargement de l'onglet pendant une saisie ou un enregistrement. */
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.hasPendingEdits() || this.store.saveStatus() === 'saving') {
      event.preventDefault();
    }
  }

  ngOnDestroy(): void {
    // Le store (fourni par la route) survit à la page : on envoie tout de suite la saisie encore en attente
    // plutôt que d'attendre le délai de sauvegarde automatique.
    if (this.store.saveStatus() === 'dirty') {
      this.store.saveNow({ sectionIndex: this.sectionIndex() });
    }
  }

  protected toggleInsurer(insurerId: string, checked: boolean): void {
    this.checkedInsurers.update((ids) => (checked ? [...ids, insurerId] : ids.filter((id) => id !== insurerId)));
  }

  /** Retient les extranets cochés (au moins un, s'il y en a) puis passe aux documents (au questionnaire si pré-rempli). */
  protected validateInsurers(): void {
    if (this.store.availableInsurers().length && !this.checkedInsurers().length) {
      this.showMissing.set(true);
      return;
    }
    this.showMissing.set(false);
    this.store.selectInsurers(this.checkedInsurers());
    this.store.goToSection(0);
    this.view.set(this._prefilled ? 'questionnaire' : 'documents');
  }

  protected onAnswer({ path, value }: AnswerChange): void {
    this.store.edit(path, value);
  }

  protected goTo(index: number): void {
    this.showMissing.set(false);
    this.store.goToSection(index);
  }

  /**
   * Passe à la section suivante seulement si la section affichée est remplie ; sinon les champs manquants sont
   * signalés. À la dernière section, le dossier passe en « complet » (ou renvoie à la première section incomplète).
   */
  protected next(): void {
    if (this.sectionMissing().length) {
      this.showMissing.set(true);
      return;
    }
    if (!this.isLastSection()) {
      this.goTo(this.sectionIndex() + 1);
      return;
    }
    const missing = this.store.missing();
    if (missing.length) {
      this.goTo(sectionIndexOf(this.store.schema(), missing[0]));
      this.showMissing.set(true);
      return;
    }
    this.store.saveNow({ sectionIndex: this.sectionIndex() });
    const dossier = this.store.dossier();
    if (dossier && dossier.status !== 'brouillon') {
      this._router.navigate([CabinetRouteContainerModel.DOSSIERS_ROUTE.url, dossier.id]);
      return;
    }
    this.validate();
  }

  protected saveAndQuit(): void {
    this.store.saveNow({ sectionIndex: this.sectionIndex() });
    const assureId = this.store.dossier()?.assureId;
    this._router.navigateByUrl(
      assureId ? CabinetRouteContainerModel.clientUrl(assureId) : CabinetRouteContainerModel.CLIENTS_ROUTE.url,
    );
  }

  private validate(): void {
    this.validating.set(true);
    this.store.changeStatus('complet');
  }
}
