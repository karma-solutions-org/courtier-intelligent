import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AuditLogEntry, Member } from '@shared';
import { InfiniteScrollDirective } from '../../../../../core/directives/infinite-scroll.directive';
import { SETTINGS_STRUCTURE } from '../settings.structure';

/** Journal des connexions et des appareils du cabinet (lecture seule, réservé aux admins). */
@Component({
  selector: 'app-audit-log-panel',
  imports: [DatePipe, InfiniteScrollDirective],
  templateUrl: './audit-log-panel.component.html',
  styleUrls: ['../settings.scss', './audit-log-panel.component.scss'],
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
