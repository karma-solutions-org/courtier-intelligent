import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PipelineStep, Stage } from '../../util/dossier-stages.utils';

/** Frise des étapes d'un dossier : chaque étape ouverte se sélectionne d'un clic. */
@Component({
  selector: 'app-dossier-pipeline',
  imports: [MatIconModule],
  template: `
    <ol class="pipeline" [class.halted]="halted()" aria-label="Étapes du dossier">
      @for (step of steps(); track step.key; let i = $index) {
        <li class="step" [class.done]="step.state === 'done'" [class.current]="step.state === 'current'" [class.selected]="selected() === step.key">
          <button
            type="button"
            class="step-button"
            [disabled]="!step.enabled"
            [attr.aria-current]="selected() === step.key ? 'step' : null"
            (click)="stageSelected.emit(step.key)"
          >
            <span class="dot" aria-hidden="true">
              @if (step.state === 'done') {
                <mat-icon>check</mat-icon>
              } @else {
                {{ i + 1 }}
              }
            </span>
            <span class="step-label">{{ step.label }}</span>
          </button>
        </li>
      }
    </ol>
  `,
  styles: `
    .pipeline {
      display: flex;
      gap: 0;
      margin: 0 0 18px;
      padding: 4px 0 6px;
      list-style: none;
      overflow-x: auto;
      scrollbar-width: thin;
    }

    .step-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 0 4px 8px;
      border: 0;
      border-bottom: 2px solid transparent;
      font: inherit;
      background: none;
      cursor: pointer;

      &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      &:not(:disabled):hover .step-label {
        color: var(--ci-navy-900);
      }
    }

    .step.selected .step-button {
      border-bottom-color: var(--ci-navy-900);
    }

    .step.selected .step-label {
      font-weight: 600;
      color: var(--ci-navy-900);
    }

    .step {
      position: relative;
      display: flex;
      flex: 1 0 88px;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;

      &:not(:first-child)::before {
        content: '';
        position: absolute;
        top: 13px;
        right: 50%;
        width: 100%;
        height: 2px;
        background: var(--ci-border);
        z-index: 0;
      }

      &.done:not(:first-child)::before,
      &.current:not(:first-child)::before {
        background: var(--ci-navy-900);
      }
    }

    .dot {
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-size: 12px;
      font-weight: 600;
      color: var(--ci-text-muted);
      background: var(--ci-surface);
      border: 2px solid var(--ci-border);

      mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
    }

    .step.done .dot {
      color: #fff;
      border-color: var(--ci-navy-900);
      background: var(--ci-navy-900);
    }

    .step.current .dot {
      color: var(--ci-navy-900);
      border-color: var(--ci-navy-900);
      background: var(--ci-navy-50);
    }

    .step-label {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.25;
      color: var(--ci-text-muted);
    }

    .step.current .step-label {
      font-weight: 600;
    }

    .pipeline.halted {
      opacity: 0.6;
      filter: grayscale(1);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierPipelineComponent {
  readonly steps = input.required<PipelineStep[]>();
  /** Étape affichée (ou l'historique, qui n'est pas dans la frise). */
  readonly selected = input.required<Stage | 'history'>();
  /** Dossier arrêté (refusé, sans suite) : frise grisée. */
  readonly halted = input(false);
  readonly stageSelected = output<Stage>();
}
