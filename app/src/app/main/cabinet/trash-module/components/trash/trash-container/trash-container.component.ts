import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TrashStore } from '../../../store/trash.store';
import { TrashPresentationComponent } from '../trash-presentation/trash-presentation.component';

/** Corbeille (admin) : clients et dossiers supprimés, à restaurer ou à supprimer définitivement. */
@Component({
  selector: 'app-trash-container',
  imports: [TrashPresentationComponent],
  providers: [TrashStore],
  templateUrl: './trash-container.component.html',
  styleUrl: './trash-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashContainerComponent {
  protected readonly store = inject(TrashStore);
  private readonly _snackBar = inject(MatSnackBar);

  constructor() {
    // Messages ponctuels du store (restauration, suppression définitive).
    effect(() => {
      const notice = this.store.notice();
      if (notice) {
        this._snackBar.open(notice.text, undefined, { duration: notice.duration });
        untracked(() => this.store.clearNotice());
      }
    });
  }
}
