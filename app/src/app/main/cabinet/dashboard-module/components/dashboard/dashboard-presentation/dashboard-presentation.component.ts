import { DatePipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Dossier, DOSSIER_STATUS_LABELS, DossierStatus } from '@shared';
import { StatusChipPresentationComponent } from '../../../../dossiers-module/components/status-chip/status-chip-presentation/status-chip-presentation.component';
import { STATUS_ORDER } from '../../../../dossiers-module/util/dossiers.utils';
import { ConversionRate } from '../../../util/dashboard.utils';
import { DASHBOARD_STRUCTURE } from '../dashboard.structure';

/** Une ligne de dossier du tableau de bord, noms déjà résolus. */
export interface DashboardDossierRow {
  dossier: Dossier;
  assureName: string;
  productName: string;
}

/** Une ligne de taux de conversion, nom déjà résolu. */
export interface ConversionRow extends ConversionRate {
  name: string;
}

/** Tableau de bord : compteurs par statut, dossiers à traiter, relances et (admin) taux de conversion. */
@Component({
  selector: 'app-dashboard-presentation',
  imports: [DatePipe, PercentPipe, RouterLink, MatIconModule, StatusChipPresentationComponent],
  templateUrl: './dashboard-presentation.component.html',
  styleUrl: './dashboard-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPresentationComponent {
  readonly loaded = input(false);
  readonly isAdmin = input(false);
  readonly counts = input.required<Record<DossierStatus, number>>();
  readonly toProcess = input<DashboardDossierRow[]>([]);
  readonly toFollowUp = input<DashboardDossierRow[]>([]);
  readonly conversionByCourtier = input<ConversionRow[]>([]);
  readonly conversionByProduct = input<ConversionRow[]>([]);
  readonly dossiersUrl = input('');

  protected readonly structure = DASHBOARD_STRUCTURE;
  protected readonly statuses = STATUS_ORDER;
  protected readonly statusLabels = DOSSIER_STATUS_LABELS;

  /** Couleur de la barre selon le taux de conversion. */
  protected rateClass(rate: number): string {
    return rate >= 0.5 ? 'fill fill--high' : rate >= 0.25 ? 'fill fill--mid' : 'fill fill--low';
  }

  protected conversionTables(): { title: string; rows: ConversionRow[] }[] {
    return [
      { title: this.structure.conversion.byCourtier, rows: this.conversionByCourtier() },
      { title: this.structure.conversion.byProduct, rows: this.conversionByProduct() },
    ];
  }

  /** Un brouillon se reprend dans le questionnaire, les autres dossiers s'ouvrent sur leur fiche. */
  protected dossierLink(dossier: Dossier): string[] {
    return dossier.status === 'brouillon' ? [this.dossiersUrl(), dossier.id, 'brouillon'] : [this.dossiersUrl(), dossier.id];
  }
}
