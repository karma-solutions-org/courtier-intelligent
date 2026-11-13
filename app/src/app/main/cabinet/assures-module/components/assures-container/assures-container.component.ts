import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AssuresStore } from '../../store/assures.store';
import { AssuresListComponent } from '../assures-list/assures-list.component';

/** Page « Assurés » : liste avec recherche et défilement infini. */
@Component({
  selector: 'app-assures-container',
  imports: [AssuresListComponent],
  templateUrl: './assures-container.component.html',
  styleUrl: './assures-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssuresContainerComponent {
  protected readonly store = inject(AssuresStore);
  protected readonly createUrl = CabinetRouteContainerModel.CLIENT_NEW_ROUTE.url;
  protected readonly detailBaseUrl = CabinetRouteContainerModel.CLIENTS_ROUTE.url;
}
