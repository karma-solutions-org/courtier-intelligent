import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Insurer } from '@shared';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';

/** Extranets proposés pour le dossier, à cocher : seules leurs questions seront posées. */
@Component({
  selector: 'app-extranet-picker',
  imports: [MatCheckboxModule],
  template: `
    @if (insurers().length) {
      <ul class="extranets">
        @for (insurer of insurers(); track insurer.id) {
          <li>
            <mat-checkbox [checked]="checked().includes(insurer.id)" (change)="toggled.emit({ insurerId: insurer.id, checked: $event.checked })">
              <span class="insurer">
                @if (insurer.logo) {
                  <img class="logo" [src]="insurer.logo" alt="" loading="lazy" />
                } @else {
                  <span class="logo initial" aria-hidden="true">{{ insurer.name.charAt(0) }}</span>
                }
                {{ insurer.name }}
              </span>
            </mat-checkbox>
          </li>
        }
      </ul>
    } @else {
      <p class="progress">{{ structure.noExtranet }}</p>
    }
  `,
  styles: `
    .progress {
      margin: 0 0 12px;
      color: var(--ci-text-muted);
    }

    .extranets {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        padding: 6px 8px;
        border: 1px solid var(--ci-border);
        border-radius: 8px;
        background: var(--ci-surface);
      }

      .insurer {
        display: inline-flex;
        gap: 10px;
        align-items: center;
      }

      .logo {
        flex-shrink: 0;
        width: 56px;
        height: 28px;
        border-radius: 4px;
        object-fit: contain;
        background: #fff;
      }

      .initial {
        display: inline-grid;
        place-items: center;
        font-weight: 700;
        color: var(--ci-accent-ink);
        background: var(--ci-accent-soft);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtranetPickerComponent {
  readonly insurers = input.required<Insurer[]>();
  /** Identifiants des extranets cochés. */
  readonly checked = input.required<string[]>();
  readonly toggled = output<{ insurerId: string; checked: boolean }>();
  protected readonly structure = DOSSIERS_STRUCTURE.draft;
}
