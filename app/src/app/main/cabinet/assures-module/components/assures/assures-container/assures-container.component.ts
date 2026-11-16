import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CabinetRouteContainerModel } from '../../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { AssuresStore } from '../../../store/assures.store';
import { AssuresPresentationComponent } from '../assures-presentation/assures-presentation.component';

/** Page « Assurés » : liste avec recherche et défilement infini. */
@Component({
  selector: 'app-assures-container',
  imports: [AssuresPresentationComponent],
  templateUrl: './assures-container.component.html',
  styleUrl: './assures-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssuresContainerComponent {
  protected readonly store = inject(AssuresStore);
  protected readonly createUrl = CabinetRouteContainerModel.CLIENT_NEW_ROUTE.url;
  protected readonly detailBaseUrl = CabinetRouteContainerModel.CLIENTS_ROUTE.url;
}
