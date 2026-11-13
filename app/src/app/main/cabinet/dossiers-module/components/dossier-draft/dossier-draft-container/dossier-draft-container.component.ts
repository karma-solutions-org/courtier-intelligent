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
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CanonicalPath, Question } from '@shared';
import { HasUnsavedChanges } from '../../../../../../core/routing/guards/unsaved-changes.guard';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { DossierStore } from '../../../store/dossier.store';
import { sectionIndexOf } from '../../../util/dossiers.utils';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';
import { DraftView } from '../../../models/dossier-draft.model';
import { AnswerChange } from '../../questionnaire-form/questionnaire-form-presentation/questionnaire-form-presentation.component';
import { DossierDraftPresentationComponent } from '../dossier-draft-presentation/dossier-draft-presentation.component';

/**
 * « Nouveau dossier », étapes 3 et 4 : questionnaire section par section (enregistré automatiquement, reprise exacte
 * là où le courtier s'était arrêté), puis récapitulatif avec les champs manquants. Le dossier passe en « complet »
 * d'ici seulement quand rien ne manque.
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

  protected readonly view = signal<DraftView>('documents');
  protected readonly showMissing = signal(false);
  protected readonly validating = signal(false);
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
