import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Écran bloquant pendant la lecture d'un document : une ligne de scan passe sur l'icône. */
@Component({
  selector: 'app-reading-overlay',
  imports: [MatIconModule],
  template: `
    <div class="reading-overlay" role="alertdialog" aria-modal="true" aria-live="assertive">
      <div class="reading-card">
        <div class="scan" aria-hidden="true">
          <mat-icon class="scan-doc">description</mat-icon>
          <span class="scan-line"></span>
        </div>
        <p>{{ message() }}</p>
      </div>
    </div>
  `,
  styles: `
    .reading-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgb(15 23 42 / 55%);
    }

    .reading-card {
      display: flex;
      flex-direction: column;
      gap: 20px;
      align-items: center;
      max-width: 360px;
      padding: 32px 40px;
      border-radius: 12px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
      text-align: center;

      p {
        margin: 0;
        font-weight: 500;
      }
    }

    .scan {
      position: relative;
      width: 72px;
      height: 72px;
      overflow: hidden;
    }

    .scan-doc {
      width: 72px;
      height: 72px;
      font-size: 72px;
      color: var(--mat-sys-primary, #0b5cff);
    }

    .scan-line {
      position: absolute;
      left: 8px;
      right: 8px;
      top: 6px;
      height: 3px;
      border-radius: 2px;
      background: var(--mat-sys-primary, #0b5cff);
      box-shadow: 0 0 10px 2px var(--mat-sys-primary, #0b5cff);
      animation: scan 1.4s ease-in-out infinite alternate;
    }

    @keyframes scan {
      to {
        top: 62px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .scan-line {
        animation: none;
        top: 34px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadingOverlayComponent {
  readonly message = input.required<string>();
}
