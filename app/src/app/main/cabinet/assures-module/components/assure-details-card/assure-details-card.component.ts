import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Assure } from '@shared';
import { assureDetails } from '../../util/assure-detail.utils';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Fiche du client en lecture (elle ne se modifie que sur « Modifier la fiche »). */
@Component({
  selector: 'app-assure-details-card',
  template: `
    <h2 class="section-title">{{ structure.detailsTitle }}</h2>
    <dl class="details">
      @for (field of details(); track field.label) {
        <div>
          <dt>{{ field.label }}</dt>
          <dd>{{ field.value || '—' }}</dd>
        </div>
      }
    </dl>
  `,
  styles: `
    :host {
      display: block;
      padding: 20px 24px;
      border: 1px solid var(--ci-border);
      border-radius: 12px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    .section-title {
      margin: 0 0 16px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ci-text-muted);
    }

    .details {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 20px 24px;
      margin: 0;

      dt {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--ci-text-muted);
      }

      dd {
        margin: 4px 0 0;
        font-weight: 500;
        overflow-wrap: anywhere;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDetailsCardComponent {
  readonly assure = input.required<Assure>();
  protected readonly structure = ASSURES_STRUCTURE.detail;
  protected readonly details = computed(() => assureDetails(this.assure()));
}
