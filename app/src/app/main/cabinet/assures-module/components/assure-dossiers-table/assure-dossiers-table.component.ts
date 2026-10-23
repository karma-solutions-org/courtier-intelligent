import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Dossier } from '@shared';
import { StatusChipComponent } from '../../../dossiers-module/components/status-chip/status-chip.component';
import { dossierLink } from '../../util/assure-detail.utils';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Dossiers du client : un clic ouvre la fiche (ou reprend le brouillon). */
@Component({
  selector: 'app-assure-dossiers-table',
  imports: [DatePipe, RouterLink, MatButtonModule, StatusChipComponent],
  template: `
    @if (dossiers().length) {
      <table>
        <thead>
          <tr>
            <th>{{ structure.columns.reference }}</th>
            <th>{{ structure.columns.product }}</th>
            <th>{{ structure.columns.status }}</th>
            <th>{{ structure.columns.createdAt }}</th>
            <th>{{ structure.columns.action }}</th>
          </tr>
        </thead>
        <tbody>
          @for (dossier of dossiers(); track dossier.id) {
            <tr class="row" [routerLink]="linkOf(dossier)">
              <td>{{ dossier.reference || structure.draftReference }}</td>
              <td>{{ dossier.productId }}</td>
              <td><app-status-chip [status]="dossier.status" /></td>
              <td>{{ dossier.createdAt?.toMillis() | date: 'd MMM y' }}</td>
              <td class="action">
                <a mat-button [routerLink]="linkOf(dossier)" (click)="$event.stopPropagation()">
                  {{ dossier.status === 'brouillon' ? structure.resume : structure.open }}
                </a>
              </td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="empty">{{ structure.noDossiers }}</p>
    }
  `,
  styles: `
    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 10px 8px;
      text-align: left;
      border-bottom: 1px solid var(--ci-border);
    }

    th {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ci-text-muted);
    }

    .row {
      cursor: pointer;

      &:hover {
        background: var(--ci-surface-2);
      }
    }

    .action {
      text-align: right;
    }

    .empty {
      margin: 0;
      color: var(--ci-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureDossiersTableComponent {
  readonly dossiers = input.required<Dossier[]>();
  protected readonly structure = ASSURES_STRUCTURE.detail;
  protected readonly linkOf = dossierLink;
}
