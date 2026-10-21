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
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CanonicalPath, isAnalyzableDocumentType, OcrField } from '@shared';
import { catchError, concatMap, EMPTY, finalize, from, map, of, switchMap, take, tap } from 'rxjs';
import { HasUnsavedChanges } from '../../../../../core/routing/guards/unsaved-changes.guard';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { DocumentsService } from '../../services/documents.service';
import { DossierStore } from '../../store/dossier.store';
import { mergeOcrFields, needsConfirmation } from '../../util/documents.utils';
import { sectionIndexOf } from '../../util/dossiers.utils';
import { DocumentImportContainerComponent } from '../document-import/document-import-container.component';
import { DossierStepperHeaderComponent } from '../dossier-stepper-header/dossier-stepper-header.component';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';
import {
  AnswerChange,
  QuestionnaireFormComponent,
} from '../questionnaire-form/questionnaire-form.component';

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
    MatCheckboxModule,
    MatIconModule,
    DocumentImportContainerComponent,
    DossierStepperHeaderComponent,
    QuestionnaireFormComponent,
  ],
  template: `
    @if (readingPieces()) {
      <!-- Lecture des pièces du client : écran bloqué jusqu'au remplissage des champs. -->
      <div class="reading-overlay" role="alertdialog" aria-modal="true" aria-live="assertive">
        <div class="reading-card">
          <div class="scan" aria-hidden="true">
            <mat-icon class="scan-doc">description</mat-icon>
            <span class="scan-line"></span>
          </div>
          <p>{{ structure.clientPiecesReading }}</p>
        </div>
      </div>
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
        @if (store.availableInsurers().length) {
          <ul class="extranets">
            @for (insurer of store.availableInsurers(); track insurer.id) {
              <li>
                <mat-checkbox [checked]="checkedInsurers().includes(insurer.id)" (change)="toggleInsurer(insurer.id, $event.checked)">
                  {{ insurer.name }}
                  @if (insurer.extranetDomains[0]; as domain) {
                    <span class="domain">{{ domain }}</span>
                  }
                </mat-checkbox>
              </li>
            }
          </ul>
        } @else {
          <p class="progress">{{ structure.noExtranet }}</p>
        }
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

    .extranets {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        padding: 6px 8px;
        border: 1px solid var(--ci-border);
        border-radius: 8px;
        background: var(--ci-surface);
      }

      .domain {
        display: block;
        font-size: 12px;
        color: var(--ci-text-muted);
      }
    }

    .reading-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgb(15 23 42 / 55%);
    }

    .reading-card {
      display: flex;
      flex-direction: column;
      gap: 20px;
      align-items: center;
      max-width: 360px;
      padding: 32px 40px;
      border-radius: 12px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
      text-align: center;

      p {
        margin: 0;
        font-weight: 500;
      }
    }

    /* Document lu : une ligne de scan passe de haut en bas sur l'icône. */
    .scan {
      position: relative;
      width: 72px;
      height: 72px;
      overflow: hidden;
    }

    .scan-doc {
      width: 72px;
      height: 72px;
      font-size: 72px;
      color: var(--mat-sys-primary, #0b5cff);
    }

    .scan-line {
      position: absolute;
      left: 8px;
      right: 8px;
      top: 6px;
      height: 3px;
      border-radius: 2px;
      background: var(--mat-sys-primary, #0b5cff);
      box-shadow: 0 0 10px 2px var(--mat-sys-primary, #0b5cff);
      animation: scan 1.4s ease-in-out infinite alternate;
    }

    @keyframes scan {
      to {
        top: 62px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .scan-line {
        animation: none;
        top: 34px;
      }
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
  private readonly _router = inject(Router);
  private readonly _documents = inject(DocumentsService);
  private readonly _authStore = inject(AuthStore);
  private readonly _snackBar = inject(MatSnackBar);
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
  /** Pièces du client en cours de lecture : un spinner couvre le formulaire jusqu'au remplissage. */
  protected readonly readingPieces = signal(false);

  /** Section affichée, bornée au questionnaire (la reprise peut venir d'un ancien enregistrement). */
  protected readonly sectionIndex = computed(() =>
    Math.min(this.store.sectionIndex(), Math.max(0, this.store.schema().length - 1)),
  );
  protected readonly currentSection = computed(() =>
    this.store.schema().slice(this.sectionIndex(), this.sectionIndex() + 1),
  );
  protected readonly isLastSection = computed(
    () => this.sectionIndex() >= this.store.schema().length - 1,
  );
  /** Champs obligatoires encore vides de la section affichée : « Suivant » reste bloqué tant qu'il y en a. */
  protected readonly sectionMissing = computed(() => {
    const paths = new Set(this.currentSection().flatMap(section => section.questions).map(q => q.canonicalPath));
    return this.store.missing().filter(path => paths.has(path));
  });

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
      // Pas pendant le choix des extranets : la lecture commence une fois ce choix validé.
      const dossier = this.store.dossier();
      if (!dossier || !this.store.editable() || !this.store.product() || this._clientPiecesTakenFor === dossier.id) return;
      if (this.view() === 'extranets') return;
      this._clientPiecesTakenFor = dossier.id;
      untracked(() => this.takeClientPieces(dossier.id));
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

  /**
   * Reprend les pièces du client (une seule fois chacune, côté serveur), lit celles qui ne l'ont pas encore été, puis
   * écrit les valeurs sûres (confiance suffisante) dans les champs encore VIDES : rien de ce que le courtier a saisi
   * n'est écrasé. Une lecture coupée (page rechargée) reprend à l'ouverture suivante : les pièces non lues sont lues
   * et toutes les valeurs du client sont appliquées. Rien à lire : rien n'est réappliqué (un champ vidé reste vide).
   */
  private takeClientPieces(dossierId: string): void {
    const cabinetId = this._authStore.cabinetId();
    if (!cabinetId) return;
    const fields: OcrField[] = [];
    this._documents
      .takeClientPieces(dossierId)
      .pipe(
        switchMap(() => this._documents.watchDocuments(cabinetId, dossierId).pipe(take(1))),
        map(documents => documents.filter(document => !!document.sourceAssureDocumentId && isAnalyzableDocumentType(document.type))),
        switchMap(documents => {
          const toRead = documents.filter(document => document.status === 'uploaded');
          if (!toRead.length) return EMPTY;
          for (const document of documents) if (document.status === 'analyzed') fields.push(...document.ocrFields);
          this.readingPieces.set(true);
          return from(toRead).pipe(
            concatMap(document =>
              this._documents.analyze(dossierId, document.id).pipe(
                tap(({ status, ocrFields }) => {
                  if (status === 'analyzed') fields.push(...ocrFields);
                }),
                catchError(() => of(null)),
              ),
            ),
          );
        }),
        catchError(() => EMPTY),
        finalize(() => {
          this.readingPieces.set(false);
          if (this.store.selectedId() !== dossierId || !fields.length) return;
          const answers = this.store.answers();
          const isEmpty = (path: CanonicalPath) => answers[path] === undefined || answers[path] === null || answers[path] === '';
          const toFill = mergeOcrFields(fields).filter(field => !needsConfirmation(field) && isEmpty(field.canonicalPath));
          if (!toFill.length) return;
          for (const field of toFill) this.store.edit(field.canonicalPath, field.value);
          this.store.saveNow({ event: true, sectionIndex: this.sectionIndex() });
          this._snackBar.open(`${toFill.length} ${this.structure.clientPiecesApplied}`, undefined, { duration: 6000 });
        }),
      )
      .subscribe();
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
