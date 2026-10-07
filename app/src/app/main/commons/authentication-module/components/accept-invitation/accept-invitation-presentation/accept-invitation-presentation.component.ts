import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../../../../core/components/logo/logo.component';
import { ACCEPT_INVITATION_PAGE_STRUCTURE } from './accept-invitation-page.structure';

@Component({
  selector: 'app-accept-invitation-presentation',
  imports: [RouterLink, MatButtonModule, MatProgressSpinnerModule, LogoComponent],
  template: `
    <div class="auth-card">
      <app-logo class="auth-logo" [size]="44" />
      <h1 class="auth-brand">{{ structure.title }}</h1>
      <p class="auth-subtitle">{{ structure.text }}</p>

      @if (!isValidLink()) {
        <p class="auth-error" role="alert">{{ structure.invalidLink }}</p>
      } @else if (!userEmail()) {
        <p class="auth-subtitle">{{ structure.needAccount }}</p>
        <div class="actions">
          <a mat-flat-button class="auth-submit" [routerLink]="signupUrl()">{{ structure.signup }}</a>
          <a mat-stroked-button class="auth-submit" [routerLink]="signinUrl()">{{ structure.signin }}</a>
        </div>
      } @else {
        <p class="auth-subtitle">
          {{ structure.connectedAs }} <strong>{{ userEmail() }}</strong>
        </p>
        @if (error()) {
          <p class="auth-error" role="alert">{{ error() }}</p>
        }
        <button mat-flat-button class="auth-submit full" [disabled]="isPending()" (click)="accepted.emit()">
          @if (isPending()) {
            <mat-spinner diameter="20" />
          } @else {
            {{ structure.accept }}
          }
        </button>
      }
    </div>
  `,
  styleUrl: '../../auth-layout.scss',
  styles: `
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .full {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcceptInvitationPresentationComponent {
  readonly isValidLink = input(true);
  readonly userEmail = input<string | null>(null);
  readonly isPending = input(false);
  readonly error = input<string | null>(null);
  readonly signinUrl = input.required<string>();
  readonly signupUrl = input.required<string>();
  readonly accepted = output<void>();

  protected readonly structure = ACCEPT_INVITATION_PAGE_STRUCTURE;
}
