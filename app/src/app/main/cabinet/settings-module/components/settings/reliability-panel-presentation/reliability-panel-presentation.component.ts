import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import {
  EXTENSION_REPORT_ISSUE_LABELS,
  EXTENSION_REPORT_STEP_LABELS,
  ExtranetReliabilityReport,
  Insurer,
  InsurerReliability,
  RELIABILITY_PERIODS,
  ReliabilityPeriod,
} from '@shared';
import { CardPresentationComponent } from '../../../../../../core/components/card/card-presentation/card-presentation.component';
import { ReliabilityLevel, ReliabilityRowModel } from '../../../models/reliability-row.model';
import { SETTINGS_STRUCTURE } from '../settings.structure';

/** Tarifications terminées en dessous desquelles un taux faible n'est pas signalé (trop peu d'essais). */
const MIN_FINISHED_FOR_WARNING = 3;

const oneDecimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/**
 * Fiabilité des extranets : pour chaque assureur, les tarifications du cabinet et les incidents signalés par
 * l'extension (tous cabinets). Lecture seule ; la période et l'actualisation sont émises au container.
 */
@Component({
  selector: 'app-reliability-panel',
  imports: [CardPresentationComponent, DatePipe, MatButtonModule, MatButtonToggleModule, MatIconModule],
  templateUrl: './reliability-panel-presentation.component.html',
  styleUrls: ['../settings.scss', './reliability-panel-presentation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReliabilityPanelPresentationComponent {
  readonly report = input<ExtranetReliabilityReport | null>(null);
  /** Catalogue des assureurs : nom et logo de chaque ligne (à défaut, l'identifiant). */
  readonly insurers = input<Insurer[]>([]);
  readonly period = input<ReliabilityPeriod>(30);
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  readonly periodChanged = output<ReliabilityPeriod>();
  readonly refresh = output<void>();

  protected readonly structure = SETTINGS_STRUCTURE.reliability;
  protected readonly periods = RELIABILITY_PERIODS;

  /** Assureurs dont le détail est déplié. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly rows = computed<ReliabilityRowModel[]>(() => {
    const catalog = new Map(this.insurers().map((insurer) => [insurer.id, insurer]));
    return (this.report()?.insurers ?? []).map((item) => this._toRow(item, catalog.get(item.insurerId)));
  });

  protected toggle(insurerId: string): void {
    this.expanded.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(insurerId)) next.add(insurerId);
      return next;
    });
  }

  protected onPeriodChange(value: unknown): void {
    const period = RELIABILITY_PERIODS.find((p) => p === Number(value));
    if (period && period !== this.period()) this.periodChanged.emit(period);
  }

  private _toRow(item: InsurerReliability, insurer: Insurer | undefined): ReliabilityRowModel {
    const name = insurer?.name || item.insurerId;
    const missing = item.topMissingFields.map(({ key, count }) => ({ label: key, count }));
    const issues = item.platformIssues.map(({ step, issue, count }) => ({
      label: `${EXTENSION_REPORT_STEP_LABELS[step] ?? step} — ${EXTENSION_REPORT_ISSUE_LABELS[issue] ?? issue}`,
      count,
    }));
    return {
      insurerId: item.insurerId,
      name,
      logo: insurer?.logo ?? null,
      initial: name.charAt(0).toUpperCase(),
      launched: item.launched,
      captured: item.captured,
      rate: item.successRate === null ? null : `${Math.round(item.successRate * 100)} %`,
      level: levelOf(item),
      manual:
        item.capturedManual > 0
          ? `${this.structure.manualPrefix} ${item.capturedManual} ${item.capturedManual > 1 ? this.structure.manualMany : this.structure.manualOne}`
          : null,
      failed: item.failed,
      needsInfo: item.needsInfo,
      inProgress: item.inProgress,
      median:
        item.medianMinutesToPrice === null
          ? '—'
          : `${oneDecimal.format(item.medianMinutesToPrice)} ${this.structure.minutes}`,
      attempts: item.averageAttempts === null ? '—' : oneDecimal.format(item.averageAttempts),
      missing,
      issues,
      issuesTotal: item.platformIssuesTotal,
      hasDetail: missing.length > 0 || issues.length > 0,
    };
  }
}

/** Fragile : moins d'un tarif sur deux sur au moins 3 tarifications terminées ; fiable : 80 % ou plus. */
function levelOf(item: InsurerReliability): ReliabilityLevel {
  if (item.successRate === null) return null;
  if (item.successRate < 0.5 && item.captured + item.failed >= MIN_FINISHED_FOR_WARNING) return 'weak';
  if (item.successRate >= 0.8) return 'strong';
  return null;
}
