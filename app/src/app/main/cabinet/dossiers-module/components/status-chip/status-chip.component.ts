import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DOSSIER_STATUS_LABELS, DossierStatus } from '@shared';

/** Pastille de statut d'un dossier. */
@Component({
  selector: 'app-status-chip',
  template: `<span class="chip" [attr.data-status]="status()">{{ label() }}</span>`,
  styles: `
    .chip {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      color: var(--mat-sys-on-surface-variant);
      background: var(--mat-sys-surface-container);
    }

    [data-status='complet'],
    [data-status='besoin_valide'] {
      color: #1b5e8c;
      background: #e1f0fa;
    }

    [data-status='souscrit'] {
      color: #1e7d50;
      background: #e3f5ec;
    }

    [data-status='refuse'],
    [data-status='sans_suite'] {
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  readonly status = input.required<DossierStatus>();
  protected readonly label = computed(() => DOSSIER_STATUS_LABELS[this.status()]);
}
