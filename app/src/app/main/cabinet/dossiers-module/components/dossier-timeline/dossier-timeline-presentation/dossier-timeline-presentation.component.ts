import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  DOSSIER_STATUS_LABELS,
  DossierEvent,
  DossierStatus,
  NEED_FIELD_LABELS,
  NeedInput,
} from '@shared';
import { InfiniteScrollDirective } from '../../../../../../core/directives/infinite-scroll.directive';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';

interface TimelineItem {
  id: string;
  icon: string;
  title: string;
  detail: string | null;
  author: string;
  at: number | null;
}

const ICONS: Record<string, string> = {
  created: 'add_circle',
  data_updated: 'edit',
  status_changed: 'swap_horiz',
  assigned: 'person',
  need_updated: 'fact_check',
  note: 'sticky_note_2',
  proposal_sent: 'outgoing_mail',
  outcome_recorded: 'task_alt',
};

/** Historique d'un dossier (frise chronologique), du plus récent au plus ancien. */
@Component({
  selector: 'app-dossier-timeline',
  imports: [DatePipe, MatIconModule, InfiniteScrollDirective],
  templateUrl: './dossier-timeline-presentation.component.html',
  styleUrl: './dossier-timeline-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierTimelinePresentationComponent {
  readonly events = input<DossierEvent[]>([]);
  /** Nom affiché des membres, par uid. */
  readonly memberNames = input<Map<string, string>>(new Map());
  /** Nom des assureurs, par identifiant (événements de tarification). */
  readonly insurerNames = input<Map<string, string>>(new Map());
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  readonly loadMore = output<void>();

  protected readonly structure = DOSSIERS_STRUCTURE.timeline;

  protected readonly items = computed<TimelineItem[]>(() =>
    this.events().map((event) => ({
      id: event.id,
      icon: ICONS[event.type] ?? 'history',
      ...this.describe(event),
      author: this.nameOf(event.by),
      at: event.at?.toMillis() ?? null,
    })),
  );

  private nameOf(uid: string | undefined): string {
    return (uid && this.memberNames().get(uid)) || this.structure.unknownMember;
  }

  private insurerOf(data: Record<string, unknown>): string | null {
    const id = data['insurerId'];
    return typeof id === 'string' ? (this.insurerNames().get(id) ?? id) : null;
  }

  private describe(event: DossierEvent): Pick<TimelineItem, 'title' | 'detail'> {
    const data = event.data ?? {};
    switch (event.type) {
      case 'created':
        return {
          title: this.structure.created,
          detail: typeof data['reference'] === 'string' ? data['reference'] : null,
        };
      case 'data_updated': {
        const count = Array.isArray(data['fields']) ? data['fields'].length : 0;
        return { title: this.structure.dataUpdated, detail: count ? `${count} champ(s)` : null };
      }
      case 'status_changed': {
        const label = (status: unknown) =>
          DOSSIER_STATUS_LABELS[status as DossierStatus] ?? (status === 'sans_suite' ? 'Sans suite' : String(status));
        return {
          title: `${this.structure.statusChanged} : ${label(data['from'])} → ${label(data['to'])}`,
          detail: data['automatic'] === true ? this.structure.automatic : null,
        };
      }
      case 'assigned':
        return {
          title: `${this.structure.assigned} ${this.nameOf(data['to'] as string)}`,
          detail: null,
        };
      case 'need_updated': {
        const changes = (data['changes'] ?? {}) as Record<string, unknown>;
        const fields = Object.keys(changes).map(
          (key) => NEED_FIELD_LABELS[key as keyof NeedInput] ?? key,
        );
        return { title: this.structure.needUpdated, detail: fields.join(', ') || null };
      }
      case 'pricing_requested': {
        const attempt = typeof data['attempt'] === 'number' ? data['attempt'] : 1;
        return {
          title: attempt > 1 ? this.structure.pricingRetried : this.structure.pricingRequested,
          detail: this.insurerOf(data),
        };
      }
      case 'pricing_completed':
        return { title: this.structure.pricingCompleted, detail: this.insurerOf(data) };
      case 'offer_entered':
        return { title: this.structure.offerEntered, detail: this.insurerOf(data) };
      case 'decision_made':
        return {
          title: `${this.structure.decisionMade} : ${this.insurerOf(data) ?? ''}`,
          detail: typeof data['justification'] === 'string' ? data['justification'] : null,
        };
      case 'proposal_sent':
        return {
          title:
            data['resend'] === true ? this.structure.proposalResent : this.structure.proposalSent,
          detail: typeof data['to'] === 'string' ? data['to'] : null,
        };
      case 'outcome_recorded': {
        const result = data['result'] as string;
        const detail = [data['contractNumber'], data['effectiveDate']]
          .filter((v) => typeof v === 'string' && v)
          .join(' · ');
        return { title: this.structure.outcome[result] ?? result, detail: detail || null };
      }
      case 'note':
        return {
          title: this.structure.note,
          detail: typeof data['text'] === 'string' ? data['text'] : null,
        };
      default:
        return { title: event.type, detail: null };
    }
  }
}
