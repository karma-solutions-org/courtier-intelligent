import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CanonicalPath, isAnalyzableDocumentType, OcrField, Question } from '@shared';
import { catchError, concatMap, EMPTY, finalize, from, map, of, switchMap, take, tap } from 'rxjs';
import { HasUnsavedChanges } from '../../../../../core/routing/guards/unsaved-changes.guard';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../assures-module/util/assures.utils';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { DocumentsService } from '../../services/documents.service';
import { DossierStore } from '../../store/dossier.store';
import { mergeOcrFields, needsConfirmation } from '../../util/documents.utils';
import { sectionIndexOf } from '../../util/dossiers.utils';
import { DocumentImportContainerComponent } from '../document-import/document-import-container.component';
import { QuestionFieldComponent } from '../question-field/question-field.component';
import { DossierStepperHeaderComponent } from '../dossier-stepper-header/dossier-stepper-header.component';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';
import {
  AnswerChange,
  QuestionnaireFormComponent,
} from '../questionnaire-form/questionnaire-form.component';

/**
 * « Nouveau dossier », étapes 3 et 4 : questionnaire section par section (enregistré automatiquement, reprise exacte
 * là où le courtier s'était arrêté), puis récapitulatif avec les champs manquants. Le dossier passe en « complet »
 * d'ici seulement quand rien ne manque.
 */
@Component({
  selector: 'app-dossier-draft-container',
  imports: [
    MatButtonModule,
    MatIconModule,
    DocumentImportContainerComponent,
    DossierStepperHeaderComponent,
    QuestionnaireFormComponent,
    QuestionFieldComponent,
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

      @if (view() === 'documents') {
        <section class="intro">
          <h2>{{ structure.documentsTitle }}</h2>
          <p>{{ structure.documentsHint }}</p>
        </section>
        <app-document-import-container class="documents" />
        <div class="actions">
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
          <button mat-flat-button type="button" (click)="next()">
            {{ isLastSection() ? structure.toSummary : structure.next }}
          </button>
        </div>
      } @else if (view() === 'missing') {
        <section class="card">
          <h2>{{ structure.fillMissingTitle }}</h2>
          <p class="hint">{{ structure.fillMissingHint }}</p>
          <div class="fields">
            @for (question of missingQuestions(); track question.canonicalPath) {
              <app-question-field
                [question]="question"
                [value]="store.answers()[question.canonicalPath]"
                [showMissing]="true"
                (changed)="onAnswer({ path: question.canonicalPath, value: $event })"
              />
            }
          </div>
        </section>
        <div class="actions">
          <button mat-button type="button" (click)="view.set('summary')">
            {{ structure.cancel }}
          </button>
          <span class="spacer"></span>
          <button mat-flat-button type="button" (click)="saveMissing()">
            {{ structure.saveMissing }}
          </button>
        </div>
      } @else {
        <section class="card">
          <h2>{{ structure.summaryTitle }}</h2>
          <dl>
            <dt>{{ structure.assure }}</dt>
            <dd>{{ store.assure() ? nameOf(store.assure()!) : '—' }}</dd>
            <dt>{{ structure.product }}</dt>
            <dd>{{ store.product()?.name ?? dossier.productId }}</dd>
          </dl>

          @if (store.missing().length) {
            <div class="missing" role="alert">
              <h3>{{ structure.missingTitle }} ({{ store.missing().length }})</h3>
              <p>{{ structure.missingHint }}</p>
              <ul>
                @for (path of store.missing(); track path) {
                  <li>
                    {{ store.labels().get(path) ?? 'Champ sans libellé' }}
                    <button mat-button type="button" (click)="fill(path)">
                      {{ structure.goTo }}
                    </button>
                  </li>
                }
              </ul>
              <button mat-flat-button type="button" class="fill-all" (click)="openMissing()">
                {{ structure.fillMissing }}
              </button>
            </div>
          } @else {
            <p class="complete"><mat-icon>check_circle</mat-icon>{{ structure.complete }}</p>
          }
        </section>
        <div class="actions">
          <button mat-button type="button" (click)="backToQuestionnaire()">
            {{ structure.backToQuestionnaire }}
          </button>
          <span class="spacer"></span>
          <button mat-button type="button" (click)="saveAndQuit()">
            {{ structure.saveAndQuit }}
          </button>
          <button
            mat-flat-button
            type="button"
            [disabled]="store.missing().length > 0 || validating()"
            (click)="validate()"
          >
            {{ structure.validate }}
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

    h3 {
      margin: 0 0 4px;
      font-size: 15px;
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

    .card {
      padding: 24px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 16px;
      margin: 0 0 16px;
    }

    dt {
      color: var(--ci-text-muted);
    }

    dd {
      margin: 0;
      font-weight: 500;
    }

    .missing {
      padding: 14px 16px;
      border-radius: 8px;
      color: var(--mat-sys-on-tertiary-container);
      background: var(--mat-sys-tertiary-container);

      p {
        margin: 0 0 8px;
      }

      ul {
        margin: 0;
        padding-left: 20px;
      }
    }

    .fill-all {
      margin-top: 12px;
    }

    .hint {
      margin: 0 0 16px;
      color: var(--ci-text-muted);
    }

    .fields {
      display: grid;
      gap: 12px;
    }

    .complete {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: var(--ci-success);
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
  protected readonly nameOf = displayName;

  protected readonly view = signal<'documents' | 'questionnaire' | 'summary' | 'missing'>('documents');
  /** Position de chaque vue dans les étapes de « Nouveau dossier ». */
  protected readonly stepOf = { documents: 3, questionnaire: 4, summary: 5, missing: 5 } as const;
  protected readonly showMissing = signal(false);
  protected readonly validating = signal(false);
  /** Pièces du client en cours de lecture : un spinner couvre le formulaire jusqu'au remplissage. */
  protected readonly readingPieces = signal(false);
  /** Champs manquants figés à l'ouverture : une question remplie reste affichée pendant la saisie. */
  private readonly _missingPaths = signal<CanonicalPath[]>([]);
  protected readonly missingQuestions = computed<Question[]>(() => {
    const questions = new Map(
      this.store.schema().flatMap(section => section.questions).map(q => [q.canonicalPath, q]),
    );
    return this._missingPaths()
      .map(path => questions.get(path))
      .filter((q): q is Question => !!q);
  });

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
      // Reprise : un dossier déjà complet rouvre au récapitulatif, un brouillon à la section où le courtier s'était arrêté.
      if (!this._initialViewSet) {
        this._initialViewSet = true;
        if (dossier.status !== 'brouillon') this.view.set('summary');
        // Brouillon déjà commencé : on reprend au questionnaire ; dossier neuf : on commence par les documents.
        else if (this.store.sectionIndex() > 0 || Object.keys(dossier.data ?? {}).length) this.view.set('questionnaire');
      }
      // La validation a abouti : le dossier est complet, on ouvre sa fiche.
      if (this.validating() && dossier.status === 'complet') {
        this._router.navigate([CabinetRouteContainerModel.DOSSIERS_ROUTE.url, dossier.id]);
      }
    });
    effect(() => {
      // Pièces importées à la création du client (carte grise, permis…) : reprises dans le dossier, lues, et rangées
      // dans les champs vides. Ici et non dans l'étape Documents : un dossier pré-rempli s'ouvre au questionnaire.
      const dossier = this.store.dossier();
      if (!dossier || !this.store.editable() || !this.store.product() || this._clientPiecesTakenFor === dossier.id) return;
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

  protected onAnswer({ path, value }: AnswerChange): void {
    this.store.edit(path, value);
  }

  protected goTo(index: number): void {
    this.showMissing.set(false);
    this.store.goToSection(index);
  }

  protected next(): void {
    if (this.isLastSection()) {
      this.store.saveNow({ sectionIndex: this.sectionIndex() });
      this.view.set('summary');
      return;
    }
    this.goTo(this.sectionIndex() + 1);
  }

  protected backToQuestionnaire(): void {
    this.view.set('questionnaire');
  }

  /** Depuis le récapitulatif : retourne à la section du champ manquant, en le signalant. */
  protected fill(path: CanonicalPath): void {
    this.store.goToSection(sectionIndexOf(this.store.schema(), path));
    this.view.set('questionnaire');
    this.showMissing.set(true);
  }

  /** Depuis le récapitulatif : n'affiche que les questions obligatoires encore vides. */
  protected openMissing(): void {
    this._missingPaths.set([...this.store.missing()]);
    this.view.set('missing');
  }

  protected saveMissing(): void {
    this.store.saveNow({ sectionIndex: this.sectionIndex() });
    this.view.set('summary');
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
