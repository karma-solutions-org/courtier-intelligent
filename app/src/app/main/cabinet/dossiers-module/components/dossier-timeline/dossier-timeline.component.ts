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
            <li>
              <mat-icon class="icon">{{ item.icon }}</mat-icon>
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
        <p class="empty">{{ structure.empty }}</p>
      }
    </section>
  `,
  styles: `
    .card {
      padding: 24px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 14px;
      background: #fff;
    }

    h2 {
      margin: 0 0 16px;
      font-size: 17px;
      font-weight: 600;
    }

    ol {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      gap: 14px;
      padding: 10px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .icon {
      flex: none;
      color: var(--mat-sys-primary);
    }

    .detail,
    .meta {
      display: block;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty {
      color: var(--mat-sys-on-surface-variant);
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
      case 'note':
        return { title: this.structure.note, detail: typeof data['text'] === 'string' ? data['text'] : null };
      default:
        return { title: event.type, detail: null };
    }
  }
}
