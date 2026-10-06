import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { AuthStore } from '../../../authentication-module/store/auth.store';

/** Accueil provisoire : sera remplacé par le layout et le tableau de bord. */
@Component({
  selector: 'app-home-container',
  imports: [MatButtonModule],
  template: `
    <main class="home">
      <h1>Bienvenue {{ authStore.user()?.email }}</h1>
      <p>Cabinet : {{ authStore.tenantId() ?? 'aucun' }} · Rôle : {{ authStore.role() ?? 'aucun' }}</p>
      <button mat-stroked-button (click)="authStore.signOut()">Se déconnecter</button>
    </main>
  `,
  styles: `
    .home {
      padding: 32px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeContainerComponent {
  protected readonly authStore = inject(AuthStore);
}
