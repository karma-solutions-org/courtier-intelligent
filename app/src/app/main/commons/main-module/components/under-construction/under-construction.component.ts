import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Page provisoire des sections du menu pas encore développées (titre fourni par la route). */
@Component({
  selector: 'app-under-construction',
  imports: [MatIconModule],
  template: `
    <h1>{{ pageTitle() }}</h1>
    <div class="empty">
      <mat-icon>construction</mat-icon>
      <p>Cette section arrive bientôt.</p>
    </div>
  `,
  styles: `
    h1 {
      margin: 0 0 24px;
      font-size: 26px;
      font-weight: 600;
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 64px 24px;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 12px;
      color: var(--mat-sys-on-surface-variant);
      background: #fff;

      mat-icon {
        width: 40px;
        height: 40px;
        font-size: 40px;
      }

      p {
        margin: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnderConstructionComponent {
  /** Lié à `data.pageTitle` de la route (withComponentInputBinding). */
  readonly pageTitle = input('');
}
