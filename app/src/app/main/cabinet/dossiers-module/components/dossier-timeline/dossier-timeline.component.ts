import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DOSSIER_STATUS_LABELS, DossierEvent, DossierStatus, NEED_FIELD_LABELS, NeedInput } from '@shared';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';

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
  proposal_reminder: 'notifications',
  outcome_recorded: 'task_alt',
};

/** Historique d'un dossier (frise chronologique), du plus récent au plus ancien. */
@Component({
  selector: 'app-dossier-timeline',
  imports: [DatePipe, MatIconModule],
  template: `
    <section class="card">
      <h2>{{ structure.title }}</h2>
      @if (items().length) {
        <ol>
          @for (item of items(); track item.id) {
            <li [attr.data-kind]="item.icon">
              <span class="icon" aria-hidden="true"><mat-icon>{{ item.icon }}</mat-icon></span>
              <div>
                <strong>{{ item.title }}</strong>
                @if (item.detail) {
                  <span class="detail">{{ item.detail }}</span>
                }
                <span class="meta">{{ item.author }} · {{ item.at | date: 'd MMM y, HH:mm' }}</span>
              </div>
            </li>
          }
        </ol>
      } @else {
        <div class="empty-wrap"><svg class="empty-art" viewBox="0 0 120 80" aria-hidden="true"><rect x="30" y="14" width="60" height="50" rx="8" fill="#fff" stroke="#d1d5db" stroke-width="2"/><rect x="40" y="26" width="30" height="5" rx="2.5" fill="#d1d5db"/><rect x="40" y="37" width="40" height="4" rx="2" fill="#e5e7eb"/><rect x="40" y="46" width="24" height="4" rx="2" fill="#e5e7eb"/></svg><p class="empty">{{ structure.empty }}</p></div>
      }
    </section>
  `,
  styles: `
    .card {
      padding: 24px;
      border: 1px solid var(--ci-border);
      border-radius: 8px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
    }

    h2 {
      margin: 0 0 16px;
      font-size: 16px;
      font-weight: 600;
    }

    ol {
      position: relative;
      margin: 0;
      padding: 0;
      list-style: none;

      &::before {
        content: '';
        position: absolute;
        left: 17px;
        top: 8px;
        bottom: 8px;
        width: 2px;
        border-radius: 2px;
        background: var(--ci-border);
      }
    }

    li {
      position: relative;
      display: flex;
      gap: 14px;
      padding: 10px 0;
    }


    .icon {
      position: relative;
      z-index: 1;
      display: grid;
      flex: none;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      color: var(--ci-text-muted);
      background: var(--ci-surface);
      border: 1px solid var(--ci-border);
      box-sizing: border-box;

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    }

    li > div {
      flex: 1;
      min-width: 0;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--ci-surface-2);
      overflow-wrap: anywhere;
    }

    .detail,
    .meta {
      display: block;
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .meta {
      margin-top: 2px;
      font-size: 12px;
    }

    .empty-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .empty-art {
      width: 120px;
      height: 80px;
    }

    .empty {
      color: var(--ci-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierTimelineComponent {
  readonly events = input<DossierEvent[]>([]);
  /** Nom affiché des membres, par uid. */
  readonly memberNames = input<Map<string, string>>(new Map());
  /** Nom des assureurs, par identifiant (événements de tarification). */
  readonly insurerNames = input<Map<string, string>>(new Map());

  protected readonly structure = DOSSIERS_STRUCTURE.timeline;

  protected readonly items = computed<TimelineItem[]>(() =>
    this.events().map(event => ({
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
        return { title: this.structure.created, detail: typeof data['reference'] === 'string' ? data['reference'] : null };
      case 'data_updated': {
        const count = Array.isArray(data['fields']) ? data['fields'].length : 0;
        return { title: this.structure.dataUpdated, detail: count ? `${count} champ(s)` : null };
      }
      case 'status_changed': {
        const label = (status: unknown) => DOSSIER_STATUS_LABELS[status as DossierStatus] ?? String(status);
        return {
          title: `${this.structure.statusChanged} : ${label(data['from'])} → ${label(data['to'])}`,
          detail: data['automatic'] === true ? this.structure.automatic : null,
        };
      }
      case 'assigned':
        return { title: `${this.structure.assigned} ${this.nameOf(data['to'] as string)}`, detail: null };
      case 'need_updated': {
        const changes = (data['changes'] ?? {}) as Record<string, unknown>;
        const fields = Object.keys(changes).map(key => NEED_FIELD_LABELS[key as keyof NeedInput] ?? key);
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
          title: data['resend'] === true ? this.structure.proposalResent : this.structure.proposalSent,
          detail: typeof data['to'] === 'string' ? data['to'] : null,
        };
      case 'proposal_reminder':
        return { title: this.structure.proposalReminder, detail: this.nameOf(data['to'] as string) };
      case 'outcome_recorded': {
        const result = data['result'] as string;
        const detail = [data['contractNumber'], data['effectiveDate']].filter(v => typeof v === 'string' && v).join(' · ');
        return { title: this.structure.outcome[result] ?? result, detail: detail || null };
      }
      case 'note':
        return { title: this.structure.note, detail: typeof data['text'] === 'string' ? data['text'] : null };
      default:
        return { title: event.type, detail: null };
    }
  }
}
