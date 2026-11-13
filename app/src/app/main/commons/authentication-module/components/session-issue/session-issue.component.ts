import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonRouteContainerModel } from '../../../../../core/routing/common-routes/common-route-container.model';
import { AuthStore } from '../../store/auth.store';
import { SESSION_ISSUE_ACTIONS, SESSION_ISSUE_PAGE_STRUCTURE, SessionIssueKind } from './session-issue-page.structure';

/**
 * Écran affiché après une déconnexion automatique : « Appareil non autorisé » ou « Session ouverte ailleurs »
 * (le type vient de `data.issue` de la route).
 */
@Component({
  selector: 'app-session-issue',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './session-issue.component.html',
  styleUrl: './session-issue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionIssueComponent {
  protected readonly authStore = inject(AuthStore);
  private readonly _kind: SessionIssueKind = inject(ActivatedRoute).snapshot.data['issue'];

  protected readonly content = computed(() => SESSION_ISSUE_PAGE_STRUCTURE[this._kind]);
  protected readonly actions = SESSION_ISSUE_ACTIONS;
  protected readonly signinUrl = CommonRouteContainerModel.SIGNIN_ROUTE.url;
}
