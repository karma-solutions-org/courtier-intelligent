import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DOSSIER_STATUS_LABELS, DossierStatus } from '@shared';

/** Pastille de statut d'un dossier. */
@Component({
  selector: 'app-status-chip',
  templateUrl: './status-chip-presentation.component.html',
  styleUrl: './status-chip-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipPresentationComponent {
  readonly status = input.required<DossierStatus>();
  protected readonly label = computed(() => DOSSIER_STATUS_LABELS[this.status()]);
}
