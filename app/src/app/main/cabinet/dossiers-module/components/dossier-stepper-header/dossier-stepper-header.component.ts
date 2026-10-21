import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';

/** Les 5 étapes de « Nouveau dossier » : client → produit → extranets → documents → questionnaire. */
@Component({
  selector: 'app-dossier-stepper-header',
  imports: [MatIconModule],
  template: `
    <ol aria-label="Étapes de création du dossier">
      @for (label of steps; track label; let index = $index) {
        <li [class.done]="index + 1 < current()" [class.current]="index + 1 === current()" [attr.aria-current]="index + 1 === current() ? 'step' : null">
          <span class="bullet">
            @if (index + 1 < current()) {
              <mat-icon>check</mat-icon>
            } @else {
              {{ index + 1 }}
            }
          </span>
          <span class="label">{{ label }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    ol {
      display: flex;
      gap: 10px;
      margin: 0 0 24px;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      flex: 1;
      min-width: 0;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid var(--ci-border);
      color: var(--ci-text-muted);
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
      font-weight: 500;
    }

    .bullet {
      display: grid;
      flex: none;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      font-size: 13px;
      font-weight: 600;
      color: var(--ci-text-muted);
      background: var(--ci-surface-2);

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    }

    .current {
      color: var(--ci-navy-900);
      border-color: var(--ci-navy-900);
      font-weight: 600;

      .bullet {
        color: #fff;
        background: var(--ci-navy-900);
      }
    }

    .done {
      color: var(--ci-text);

      .bullet {
        color: var(--ci-success);
        background: var(--ci-success-soft);
      }
    }

    @media (max-width: 700px) {
      .label {
        display: none;
      }

      .current .label {
        display: inline;
      }

      li:not(.current) {
        flex: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierStepperHeaderComponent {
  /** Étape courante, de 1 à 5. */
  readonly current = input.required<number>();
  protected readonly steps = DOSSIERS_STRUCTURE.stepper.steps;
}
