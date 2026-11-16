import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { SESSION_ISSUE_ACTIONS, SessionIssueContent } from '../session-issue-page.structure';

/**
 * Écran affiché après une déconnexion automatique : « Appareil non autorisé » ou « Session ouverte ailleurs ».
 */
@Component({
  selector: 'app-session-issue-presentation',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './session-issue-presentation.component.html',
  styleUrl: './session-issue-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionIssuePresentationComponent {
  readonly content = input.required<SessionIssueContent>();
  /** Précision donnée par le serveur au moment de la déconnexion, s'il y en a une. */
  readonly notice = input<string | null>(null);
  readonly signinUrl = input.required<string>();

  protected readonly actions = SESSION_ISSUE_ACTIONS;
}
