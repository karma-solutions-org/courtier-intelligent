import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CardPresentationComponent } from '../../../../../../core/components/card/card-presentation/card-presentation.component';
import { TableCellDirective } from '../../../../../../core/components/table/directives/table-cell.directive';
import { TableColumn } from '../../../../../../core/components/table/models/table-column.model';
import { TablePresentationComponent } from '../../../../../../core/components/table/table-presentation/table-presentation.component';
import { StatusChipPresentationComponent } from '../../../../dossiers-module/components/status-chip/status-chip-presentation/status-chip-presentation.component';
import { DashboardDossierRow } from '../../../models/dashboard-row.model';
import { dossierLinkOf } from '../../../util/dashboard.utils';
import { DASHBOARD_STRUCTURE } from '../../dashboard/dashboard.structure';

/** Page « Mes dossiers à traiter » : la liste complète, chaque ligne ouvre le dossier. */
@Component({
  selector: 'app-dossiers-to-process-presentation',
  imports: [DatePipe, CardPresentationComponent, TablePresentationComponent, TableCellDirective, StatusChipPresentationComponent],
  templateUrl: './dossiers-to-process-presentation.component.html',
  styleUrl: './dossiers-to-process-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossiersToProcessPresentationComponent {
  readonly rows = input<DashboardDossierRow[]>([]);
  readonly loaded = input(false);
  readonly error = input<string | null>(null);
  readonly dossiersUrl = input('');

  protected readonly structure = DASHBOARD_STRUCTURE.toProcessPage;
  protected readonly emptyText = DASHBOARD_STRUCTURE.toProcess.empty;
  protected readonly columns: TableColumn[] = [
    { key: 'reference', label: this.structure.columns.reference },
    { key: 'assureName', label: this.structure.columns.assure },
    { key: 'productName', label: this.structure.columns.product },
    { key: 'status', label: this.structure.columns.status },
    { key: 'updatedAt', label: this.structure.columns.updatedAt },
  ];
  protected readonly byId = (row: DashboardDossierRow) => row.dossier.id;
  protected readonly rowLink = (row: DashboardDossierRow) => dossierLinkOf(this.dossiersUrl(), row.dossier);
}
