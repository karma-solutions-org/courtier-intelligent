import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Cabinet } from '@shared';
import { CABINETS_MANAGEMENT_STRUCTURE } from '../cabinets-management.structure';

@Component({
  selector: 'app-cabinets-list',
  imports: [DatePipe, MatButtonModule],
  template: `
    <div class="card">
      @if (cabinets().length) {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ structure.columns.name }}</th>
                <th>{{ structure.columns.orias }}</th>
                <th>{{ structure.columns.createdAt }}</th>
                <th>{{ structure.columns.status }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (cabinet of cabinets(); track cabinet.id) {
                <tr [class.inactive]="!cabinet.active">
                  <td><strong>{{ cabinet.name }}</strong></td>
                  <td>{{ cabinet.orias || '—' }}</td>
                  <td>{{ cabinet.createdAt ? (cabinet.createdAt.toMillis() | date: 'd MMM y') : '—' }}</td>
                  <td>
                    <span class="status" [class.off]="!cabinet.active">
                      {{ cabinet.active ? structure.active : structure.inactive }}
                    </span>
                  </td>
                  <td class="right">
                    <button mat-button [disabled]="isPending()" (click)="toggle(cabinet)">
                      {{ cabinet.active ? structure.deactivate : structure.activate }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="empty">{{ structure.empty }}</p>
      }
    </div>
  `,
  styles: `
    .card {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
      overflow: hidden;
    }

    .table-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 14px 16px;
      text-align: left;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    tr:last-child td {
      border-bottom: none;
    }

    th {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mat-sys-on-surface-variant);
      background: var(--mat-sys-surface-container-low);
    }

    .status {
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 500;
      color: #1e7d50;
      background: #e3f5ec;

      &.off {
        color: var(--mat-sys-on-error-container);
        background: var(--mat-sys-error-container);
      }
    }

    .inactive td:not(:last-child) {
      opacity: 0.6;
    }

    .right {
      text-align: right;
    }

    .empty {
      margin: 0;
      padding: 32px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CabinetsListComponent {
  readonly cabinets = input<Cabinet[]>([]);
  readonly isPending = input(false);
  readonly activeChanged = output<{ cabinetId: string; active: boolean }>();

  protected readonly structure = CABINETS_MANAGEMENT_STRUCTURE.list;

  protected toggle(cabinet: Cabinet): void {
    if (cabinet.active && !confirm(this.structure.confirmDeactivate)) return;
    this.activeChanged.emit({ cabinetId: cabinet.id, active: !cabinet.active });
  }
}
