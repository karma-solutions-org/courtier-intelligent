import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AuditLogEntry, Member } from '@shared';
import { TableCellDirective } from '../../../../../../core/components/table/directives/table-cell.directive';
import { TableColumn } from '../../../../../../core/components/table/models/table-column.model';
import { TablePresentationComponent } from '../../../../../../core/components/table/table-presentation/table-presentation.component';
import { InfiniteScrollDirective } from '../../../../../../core/directives/infinite-scroll.directive';
import { SETTINGS_STRUCTURE } from '../settings.structure';

/** Journal des connexions et des appareils du cabinet (lecture seule, réservé aux admins). */
@Component({
  selector: 'app-audit-log-panel',
  imports: [DatePipe, InfiniteScrollDirective, TablePresentationComponent, TableCellDirective],
  templateUrl: './audit-log-panel-presentation.component.html',
  styleUrls: ['../settings.scss', './audit-log-panel-presentation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogPanelPresentationComponent {
  readonly entries = input<AuditLogEntry[]>([]);
  readonly members = input<Member[]>([]);
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  readonly loadMore = output<void>();

  protected readonly structure = SETTINGS_STRUCTURE.audit;
  protected readonly columns: TableColumn[] = [
    { key: 'date', label: this.structure.columns.date },
    { key: 'member', label: this.structure.columns.member },
    { key: 'event', label: this.structure.columns.event },
  ];
  protected readonly byId = (row: { entry: AuditLogEntry }) => row.entry.id;

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
