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
  template: `
    <div class="card" role="alert">
      <mat-icon class="icon">{{ content().icon }}</mat-icon>
      <h1>{{ content().title }}</h1>
      <p>{{ content().explanation }}</p>
      <ul>
        @for (step of content().steps; track step) {
          <li>{{ step }}</li>
        }
      </ul>
      @if (authStore.sessionNotice(); as notice) {
        <p class="detail">{{ notice }}</p>
      }
      <a mat-flat-button [routerLink]="signinUrl">{{ actions.backToSignin }}</a>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      min-height: 100vh;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: var(--mat-sys-surface-container-low);
    }

    .card {
      width: 100%;
      max-width: 460px;
      padding: 32px;
      border-radius: 16px;
      background: var(--mat-sys-surface);
      box-shadow: var(--mat-sys-level2);
    }

    .icon {
      width: 40px;
      height: 40px;
      font-size: 40px;
      color: var(--mat-sys-error);
    }

    h1 {
      margin: 12px 0 8px;
      font: var(--mat-sys-headline-small);
    }

    ul {
      padding-left: 20px;
      color: var(--mat-sys-on-surface-variant);
    }

    .detail {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    a {
      margin-top: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionIssueComponent {
  protected readonly authStore = inject(AuthStore);
  private readonly _kind: SessionIssueKind = inject(ActivatedRoute).snapshot.data['issue'];

  protected readonly content = computed(() => SESSION_ISSUE_PAGE_STRUCTURE[this._kind]);
  protected readonly actions = SESSION_ISSUE_ACTIONS;
  protected readonly signinUrl = CommonRouteContainerModel.SIGNIN_ROUTE.url;
}
