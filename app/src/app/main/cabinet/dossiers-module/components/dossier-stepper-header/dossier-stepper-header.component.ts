import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';

/** Les 4 étapes de « Nouveau dossier » : assuré → produit → questionnaire → récapitulatif. */
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
      gap: 8px;
      margin: 0 0 24px;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 10px;
      color: var(--mat-sys-on-surface-variant);
      background: var(--mat-sys-surface-container-low);
    }

    .bullet {
      display: grid;
      flex: none;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      font-size: 13px;
      font-weight: 600;
      background: var(--mat-sys-surface-container-high);

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    }

    .current {
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);

      .bullet {
        color: var(--mat-sys-on-primary);
        background: var(--mat-sys-primary);
      }
    }

    .done .bullet {
      color: #fff;
      background: #1e7d50;
    }

    @media (max-width: 700px) {
      .label {
        display: none;
      }

      .current .label {
        display: inline;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierStepperHeaderComponent {
  /** Étape courante, de 1 à 4. */
  readonly current = input.required<number>();
  protected readonly steps = DOSSIERS_STRUCTURE.stepper.steps;
}
