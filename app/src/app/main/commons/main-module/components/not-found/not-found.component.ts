import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../../../core/components/logo/logo.component';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule, LogoComponent],
  template: `
    <main class="not-found">
      <app-logo [size]="44" />
      <p class="code">404</p>
      <h1>Cette page n'existe pas</h1>
      <p class="text">Le lien est peut-être erroné, ou la page a été déplacée.</p>
      <a mat-flat-button routerLink="/">Retour à l'accueil</a>
    </main>
  `,
  styles: `
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      text-align: center;
    }

    .code {
      margin: 40px 0 0;
      font-size: 72px;
      font-weight: 700;
      line-height: 1;
      color: #00082b;
    }

    h1 {
      margin: 12px 0 8px;
      font-size: 24px;
    }

    .text {
      margin: 0 0 28px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
