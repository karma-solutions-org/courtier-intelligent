import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { CanonicalPath } from '@shared';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { displayName } from '../../../assures-module/util/assures.utils';
import { DossierStore } from '../../store/dossier.store';
import { sectionIndexOf } from '../../util/dossiers.utils';
import { DossierStepperHeaderComponent } from '../dossier-stepper-header/dossier-stepper-header.component';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';
import { AnswerChange, QuestionnaireFormComponent } from '../questionnaire-form/questionnaire-form.component';

/**
 * « Nouveau dossier », étapes 3 et 4 : questionnaire section par section (enregistré automatiquement, reprise exacte
 * là où le courtier s'était arrêté), puis récapitulatif avec les champs manquants. Le dossier passe en « complet »
 * d'ici seulement quand rien ne manque.
 */
@Component({
  selector: 'app-dossier-draft-container',
  imports: [MatButtonModule, MatIconModule, DossierStepperHeaderComponent, QuestionnaireFormComponent],
  template: `
    @if (store.dossier(); as dossier) {
      <header>
        <h1>{{ dossier.reference }}</h1>
        <span class="save" [class.error]="store.saveStatus() === 'error'" role="status">{{ saveLabel() }}</span>
      </header>
      <app-dossier-stepper-header [current]="view() === 'questionnaire' ? 3 : 4" />

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }

      @if (view() === 'questionnaire') {
        <p class="progress">
          {{ structure.section }} {{ sectionIndex() + 1 }} {{ structure.of }} {{ store.schema().length }}
        </p>
        <app-questionnaire-form
          [sections]="currentSection()"
          [data]="store.answers()"
          [showMissing]="showMissing()"
          (answerChanged)="onAnswer($event)"
        />
        <div class="actions">
          <button mat-button type="button" [disabled]="sectionIndex() === 0" (click)="goTo(sectionIndex() - 1)">
            {{ structure.previous }}
          </button>
          <span class="spacer"></span>
          <button mat-button type="button" (click)="saveAndQuit()">{{ structure.saveAndQuit }}</button>
          <button mat-flat-button type="button" (click)="next()">
            {{ isLastSection() ? structure.toSummary : structure.next }}
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
                    {{ store.labels().get(path) ?? path }}
                    <button mat-button type="button" (click)="fill(path)">{{ structure.goTo }}</button>
                  </li>
                }
              </ul>
            </div>
          } @else {
            <p class="complete"><mat-icon>check_circle</mat-icon>{{ structure.complete }}</p>
          }
        </section>
        <div class="actions">
          <button mat-button type="button" (click)="backToQuestionnaire()">{{ structure.backToQuestionnaire }}</button>
          <span class="spacer"></span>
          <button mat-button type="button" (click)="saveAndQuit()">{{ structure.saveAndQuit }}</button>
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
      font-size: 26px;
      font-weight: 600;
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
      color: var(--mat-sys-on-surface-variant);

      &.error {
        color: var(--mat-sys-error);
      }
    }

    .progress {
      margin: 0 0 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .card {
      padding: 24px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
    }

    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 16px;
      margin: 0 0 16px;
    }

    dt {
      color: var(--mat-sys-on-surface-variant);
    }

    dd {
      margin: 0;
      font-weight: 500;
    }

    .missing {
      padding: 14px 16px;
      border-radius: 10px;
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

    .complete {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: #1e7d50;
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
      border-radius: 10px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDraftContainerComponent implements OnInit {
  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(DossierStore);
  private readonly _router = inject(Router);
  protected readonly structure = DOSSIERS_STRUCTURE.draft;
  protected readonly nameOf = displayName;

  protected readonly view = signal<'questionnaire' | 'summary'>('questionnaire');
  protected readonly showMissing = signal(false);
  protected readonly validating = signal(false);

  /** Section affichée, bornée au questionnaire (la reprise peut venir d'un ancien enregistrement). */
  protected readonly sectionIndex = computed(() => Math.min(this.store.sectionIndex(), Math.max(0, this.store.schema().length - 1)));
  protected readonly currentSection = computed(() => this.store.schema().slice(this.sectionIndex(), this.sectionIndex() + 1));
  protected readonly isLastSection = computed(() => this.sectionIndex() >= this.store.schema().length - 1);

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
      }
      // La validation a abouti : le dossier est complet, on ouvre sa fiche.
      if (this.validating() && dossier.status === 'complet') {
        this._router.navigate([CabinetRouteContainerModel.DOSSIERS_ROUTE.url, dossier.id]);
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

  protected saveAndQuit(): void {
    this.store.saveNow({ sectionIndex: this.sectionIndex() });
    this._router.navigateByUrl(CabinetRouteContainerModel.DOSSIERS_ROUTE.url);
  }

  protected validate(): void {
    this.validating.set(true);
    this.store.changeStatus('complet');
  }
}
