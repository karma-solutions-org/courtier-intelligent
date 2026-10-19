import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AuditLogEntry, Member } from '@shared';
import { InfiniteScrollDirective } from '../../../../../core/directives/infinite-scroll.directive';
import { SETTINGS_STRUCTURE } from '../settings.structure';

/** Journal des connexions et des appareils du cabinet (lecture seule, réservé aux admins). */
@Component({
  selector: 'app-audit-log-panel',
  imports: [DatePipe, InfiniteScrollDirective],
  template: `
    <section class="card">
      <h2>{{ structure.title }}</h2>
      <p class="hint">{{ structure.hint }}</p>
      @if (rows().length) {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ structure.columns.date }}</th>
                <th>{{ structure.columns.member }}</th>
                <th>{{ structure.columns.event }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.entry.id) {
                <tr [class.refused]="row.refused">
                  <td>{{ row.entry.at?.toMillis() | date: 'd MMM y HH:mm' }}</td>
                  <td>{{ row.member }}</td>
                  <td>
                    {{ row.label }}
                    @if (row.device) {
                      <span class="sub">{{ structure.device }} : {{ row.device }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (!hasMore()) {
        <p class="hint">{{ structure.empty }}</p>
      }
      <div
        class="more"
        appInfiniteScroll
        [appInfiniteScrollDisabled]="!hasMore() || loadingMore()"
        [appInfiniteScrollCount]="entries().length"
        (reached)="loadMore.emit()"
      >
        @if (hasMore()) {
          <span>Chargement de la suite…</span>
        }
      </div>
    </section>
  `,
  styleUrl: '../settings.scss',
  styles: `
    .table-scroll {
      overflow-x: auto;
    }

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
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ci-text-muted);
    }

    .sub {
      display: block;
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .more {
      min-height: 1px;
      padding: 8px;
      text-align: center;
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .refused td:last-child {
      color: var(--mat-sys-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogPanelComponent {
  readonly entries = input<AuditLogEntry[]>([]);
  readonly members = input<Member[]>([]);
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  readonly loadMore = output<void>();

  protected readonly structure = SETTINGS_STRUCTURE.audit;

  protected readonly rows = computed(() => {
    const names = new Map(this.members().map(m => [m.id, m.displayName || m.email || m.id]));
    return this.entries().map(entry => ({
      entry,
      member: names.get(entry.uid) ?? this.structure.unknownMember,
      label: this.structure.events[entry.type] ?? entry.type,
      device: typeof entry.data?.['appareil'] === 'string' ? (entry.data['appareil'] as string) : null,
      refused:
        entry.type === 'connexion_refusee_appareil' ||
        entry.type === 'connexion_refusee_session_active' ||
        entry.type === 'reinitialisation_refusee_quota',
    }));
  });
}
