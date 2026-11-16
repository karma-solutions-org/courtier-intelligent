import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, input, OnInit, signal, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { HasUnsavedChanges } from '../../../../../../core/routing/guards/unsaved-changes.guard';
import { AuthStore } from '../../../../../commons/authentication-module/store/auth.store';
import { DossierStore } from '../../../store/dossier.store';
import { currentStageOf, DossierDetailView } from '../../../util/dossier-stages.utils';
import { AnswerChange } from '../../questionnaire-form/questionnaire-form-presentation/questionnaire-form-presentation.component';
import {
  SansSuiteDialogData,
  SansSuiteDialogPresentationComponent,
} from '../../sans-suite-dialog/sans-suite-dialog-presentation/sans-suite-dialog-presentation.component';
import { DossierDetailPresentationComponent } from '../dossier-detail-presentation/dossier-detail-presentation.component';

/** Détail d'un dossier : sélection, étape affichée, actions (assignation, sans suite, corbeille) et sauvegardes. */
@Component({
  selector: 'app-dossier-detail-container',
  imports: [DossierDetailPresentationComponent],
  templateUrl: './dossier-detail-container.component.html',
  styleUrl: './dossier-detail-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierDetailContainerComponent implements OnInit, HasUnsavedChanges {
  /** Lié au paramètre « :id » de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(DossierStore);
  private readonly _snackBar = inject(MatSnackBar);
  private readonly _router = inject(Router);
  private readonly _auth = inject(AuthStore);
  protected readonly isAdmin = computed(() => this._auth.role() === 'admin');
  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = computed(() => this.store.removeStatus() === 'pending');
  protected readonly closing = this.store.closing;
  private readonly _dialog = inject(MatDialog);

  /** Demande le motif, puis classe le dossier sans suite (les tarifications en cours sont annulées par le serveur). */
  protected async classerSansSuite(dossierId: string, reference: string | null): Promise<void> {
    const dialog = this._dialog.open<SansSuiteDialogPresentationComponent, SansSuiteDialogData, string>(SansSuiteDialogPresentationComponent, {
      data: { reference },
    });
    const motif = await firstValueFrom(dialog.afterClosed());
    if (motif) this.store.classerSansSuite({ dossierId, motif });
  }

  /** Met le dossier dans la corbeille ; la fiche revient ensuite à l'espace du client (voir le constructeur). */
  protected remove(dossierId: string): void {
    this._backAfterRemove = this.backUrl();
    this.store.remove(dossierId);
  }

  /** Espace du client, mémorisé au moment de la suppression. */
  private _backAfterRemove = '';

  /** Le dossier se gère depuis l'espace de son client. */
  protected backUrl(): string {
    const assureId = this.store.dossier()?.assureId;
    return assureId ? CabinetRouteContainerModel.clientUrl(assureId) : CabinetRouteContainerModel.CLIENTS_ROUTE.url;
  }
  /** Étape où se trouve le dossier, d'après son statut (sans suite : la dernière étape atteinte). */
  protected readonly currentStage = computed(() => currentStageOf(this.store.dossier()));

  /** Étape affichée (ou l'historique) : suit l'avancement du dossier, le courtier peut revenir sur une étape passée. */
  protected readonly selected = signal<DossierDetailView>('infos');

  protected readonly missingLabels = computed(() =>
    this.store
      .missing()
      .map((path) => this.store.labels().get(path) ?? 'Champ sans libellé')
      .join(', '),
  );

  constructor() {
    // Messages ponctuels du store (sans suite, corbeille).
    effect(() => {
      const notice = this.store.notice();
      if (notice) {
        this._snackBar.open(notice.text, undefined, { duration: notice.duration });
        untracked(() => this.store.clearNotice());
      }
    });
    // Corbeille : retour à l'espace du client ; échec : la confirmation se referme.
    effect(() => {
      const status = this.store.removeStatus();
      if (status !== 'done' && status !== 'failed') return;
      untracked(() => {
        if (status === 'done') this._router.navigateByUrl(this._backAfterRemove);
        else this.confirmingDelete.set(false);
        this.store.resetRemoveStatus();
      });
    });
    effect(() => this.store.select(this.id()));
    effect(() => this.selected.set(this.currentStage()));
    effect(() => {
      const message = this.store.successMessage();
      if (message) {
        this._snackBar.open(message, undefined, { duration: 3000 });
        this.store.clearSuccess();
      }
    });
  }

  ngOnInit(): void {
    // Sur la fiche, les modifications sont enregistrées avec le bouton (et tracées dans l'historique), pas à la frappe.
    this.store.setAutosave(false);
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

  protected onAnswer({ path, value }: AnswerChange): void {
    this.store.edit(path, value);
  }

}
