import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DOSSIER_STATUS_LABELS, DossierStatus } from '@shared';

/** Pastille de statut d'un dossier. */
@Component({
  selector: 'app-status-chip',
  template: `<span class="chip" [attr.data-status]="status()">{{ label() }}</span>`,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.5;
      white-space: nowrap;
      color: var(--st-color, var(--ci-text-muted));
      background: var(--st-bg, var(--ci-surface-2));

      &::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  readonly status = input.required<DossierStatus>();
  protected readonly label = computed(() => DOSSIER_STATUS_LABELS[this.status()]);
}
