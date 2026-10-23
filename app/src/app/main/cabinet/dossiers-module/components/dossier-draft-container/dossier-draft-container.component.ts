import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { HasUnsavedChanges } from '../../../../../core/routing/guards/unsaved-changes.guard';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { ClientPiecesStore } from '../../store/client-pieces.store';
import { DossierStore } from '../../store/dossier.store';
import { boundedSectionIndex, missingInSection } from '../../util/draft.utils';
import { sectionIndexOf } from '../../util/dossiers.utils';
import { DocumentImportContainerComponent } from '../document-import/document-import-container.component';
import { DossierStepperHeaderComponent } from '../dossier-stepper-header/dossier-stepper-header.component';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';
import { AnswerChange, QuestionnaireFormComponent } from '../questionnaire-form/questionnaire-form.component';
import { ExtranetPickerComponent } from './extranet-picker.component';
import { ReadingOverlayComponent } from './reading-overlay.component';

/**
 * « Nouveau dossier », étapes 3 à 5 : extranets à utiliser, documents, puis questionnaire section par section
 * (enregistré automatiquement, reprise exacte là où le courtier s'était arrêté). Le questionnaire ne pose que les
 * questions des extranets choisis. Une section ne se quitte qu'une fois ses champs obligatoires remplis ; la dernière
 * fait passer le dossier en « complet ».
 */
@Component({
  selector: 'app-dossier-draft-container',
  imports: [
    MatButtonModule,
    MatIconModule,
    DocumentImportContainerComponent,
    DossierStepperHeaderComponent,
    ExtranetPickerComponent,
    QuestionnaireFormComponent,
    ReadingOverlayComponent,
  ],
  providers: [ClientPiecesStore],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    @if (pieces.reading()) {
      <!-- Lecture des pièces du client : écran bloqué jusqu'au remplissage des champs. -->
      <app-reading-overlay [message]="structure.clientPiecesReading" />
    }
    @if (store.dossier(); as dossier) {
      <header>
        <h1>{{ dossier.reference }}</h1>
        <span class="save" [class.error]="store.saveStatus() === 'error'" role="status">{{
          saveLabel()
        }}</span>
      </header>
      <app-dossier-stepper-header [current]="stepOf[view()]" />

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }

      @if (view() === 'extranets') {
        <section class="intro">
          <h2>{{ structure.extranetsTitle }}</h2>
          <p>{{ structure.extranetsHint }}</p>
        </section>
        <app-extranet-picker
          [insurers]="store.availableInsurers()"
          [checked]="checkedInsurers()"
          (toggled)="toggleInsurer($event.insurerId, $event.checked)"
        />
        @if (showMissing() && !checkedInsurers().length) {
          <p class="blocked" role="alert">{{ structure.extranetsRequired }}</p>
        }
        <div class="actions">
          <span class="spacer"></span>
          <button mat-button type="button" (click)="saveAndQuit()">
            {{ structure.saveAndQuit }}
          </button>
          <button mat-flat-button type="button" (click)="validateInsurers()">
            {{ structure.validateExtranets }}
          </button>
        </div>
      } @else if (view() === 'documents') {
        <section class="intro">
          <h2>{{ structure.documentsTitle }}</h2>
          <p>{{ structure.documentsHint }}</p>
        </section>
        <app-document-import-container class="documents" />
        <div class="actions">
          <button mat-button type="button" (click)="view.set('extranets')">
            {{ structure.toExtranets }}
          </button>
          <span class="spacer"></span>
          <button mat-button type="button" (click)="saveAndQuit()">
            {{ structure.saveAndQuit }}
          </button>
          <button mat-flat-button type="button" (click)="view.set('questionnaire')">
            {{ structure.toQuestionnaire }}
          </button>
        </div>
      } @else if (view() === 'questionnaire') {
        <div class="progress-row">
          <p class="progress">
            {{ structure.section }} {{ sectionIndex() + 1 }} {{ structure.of }}
            {{ store.schema().length }}
          </p>
          <!-- Toujours visible : on peut importer un document à tout moment du questionnaire. -->
          <button mat-stroked-button type="button" (click)="view.set('documents')">
            <mat-icon>upload_file</mat-icon>{{ structure.importDocument }}
          </button>
        </div>
        <app-questionnaire-form
          [sections]="currentSection()"
          [data]="store.answers()"
          [showMissing]="showMissing()"
          (answerChanged)="onAnswer($event)"
        />
        @if (showMissing() && sectionMissing().length) {
          <p class="blocked" role="alert">{{ structure.sectionIncomplete }}</p>
        }
        <div class="actions">
          <button
            mat-button
            type="button"
            (click)="sectionIndex() === 0 ? view.set('documents') : goTo(sectionIndex() - 1)"
          >
            {{ sectionIndex() === 0 ? structure.toDocuments : structure.previous }}
          </button>
          <span class="spacer"></span>
          <button mat-button type="button" (click)="saveAndQuit()">
            {{ structure.saveAndQuit }}
          </button>
          <button mat-flat-button type="button" [disabled]="validating()" (click)="next()">
            {{ isLastSection() ? structure.finish : structure.next }}
          </button>
        </div>
      }
    } @else if (store.error()) {
      <p class="error" role="alert">{{ store.error() }}</p>
    } @else if (store.loaded()) {
      <p>{{ structure.notFound }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 20px;
    }

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    h2 {
      margin: 0 0 16px;
      font-size: 17px;
      font-weight: 600;
    }

    .save {
      font-size: 13px;
      color: var(--ci-text-muted);

      &.error {
        color: var(--mat-sys-error);
      }
    }

    .intro {
      margin: 0 0 16px;

      h2 {
        margin: 0 0 4px;
        font-size: 18px;
        font-weight: 600;
      }

      p {
        margin: 0;
        color: var(--ci-text-muted);
      }
    }

    .progress-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;

      .progress {
        margin: 0;
      }
    }

    .progress {
      margin: 0 0 12px;
      color: var(--ci-text-muted);
    }

    .documents {
      margin-bottom: 16px;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 20px;
    }

    .spacer {
      flex: 1;
    }

    .blocked {
      margin: 16px 0 0;
      color: var(--mat-sys-error);
    }

    .error {
      margin: 0 0 16px;
      padding: 12px 14px;
      border-radius: 8px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDraftContainerComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(DossierStore);
  protected readonly pieces = inject(ClientPiecesStore);
  private readonly _router = inject(Router);
  /** Dossier dont les pièces du client ont déjà été reprises pendant cette visite. */
  private _clientPiecesTakenFor: string | null = null;
  protected readonly structure = DOSSIERS_STRUCTURE.draft;

  protected readonly view = signal<'extranets' | 'documents' | 'questionnaire'>('extranets');
  /** Position de chaque vue dans les étapes de « Nouveau dossier ». */
  protected readonly stepOf = { extranets: 3, documents: 4, questionnaire: 5 } as const;
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
      // courtier s'était arrêté ; un dossier neuf commence par les documents.
      if (!this._initialViewSet) {
        this._initialViewSet = true;
        this._prefilled = Object.keys(dossier.data ?? {}).length > 0;
        // Un brouillon pas encore commencé passe d'abord par le choix des extranets, même pré-rempli (infos du client).
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
      untracked(() => this.pieces.take(dossier.id));
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
    this.checkedInsurers.update(ids => (checked ? [...ids, insurerId] : ids.filter(id => id !== insurerId)));
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

  protected validate(): void {
    this.validating.set(true);
    this.store.changeStatus('complet');
  }
}
