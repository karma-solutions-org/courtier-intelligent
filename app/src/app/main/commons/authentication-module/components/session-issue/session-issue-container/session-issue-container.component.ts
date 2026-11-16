import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonRouteContainerModel } from '../../../../../../core/routing/common-routes/common-route-container.model';
import { AuthStore } from '../../../store/auth.store';
import { SessionIssuePresentationComponent } from '../session-issue-presentation/session-issue-presentation.component';
import { SESSION_ISSUE_PAGE_STRUCTURE, SessionIssueKind } from '../session-issue-page.structure';

/** Déconnexion automatique : le type vient de `data.issue` de la route, la précision de `AuthStore`. */
@Component({
  selector: 'app-session-issue-container',
  imports: [SessionIssuePresentationComponent],
  templateUrl: './session-issue-container.component.html',
  styleUrl: './session-issue-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionIssueContainerComponent {
  protected readonly authStore = inject(AuthStore);
  private readonly _kind: SessionIssueKind = inject(ActivatedRoute).snapshot.data['issue'];

  protected readonly content = SESSION_ISSUE_PAGE_STRUCTURE[this._kind];
  protected readonly signinUrl = CommonRouteContainerModel.SIGNIN_ROUTE.url;
}
