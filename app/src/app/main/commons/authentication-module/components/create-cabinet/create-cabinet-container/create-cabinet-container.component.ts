import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { AuthStore } from '../../../store/auth.store';
import { CreateCabinetPresentationComponent } from '../create-cabinet-presentation/create-cabinet-presentation.component';

/** Termine une inscription interrompue (onglet fermé avant le clic sur le lien de vérification). */
@Component({
  selector: 'app-create-cabinet-container',
  imports: [CreateCabinetPresentationComponent],
  template: `
    <app-create-cabinet-presentation
      [isPending]="authStore.isPending()"
      [error]="authStore.error()"
      [email]="authStore.user()?.email ?? ''"
      [emailVerified]="emailVerified()"
      [verificationEmailSent]="authStore.verificationEmailSent()"
      [initialCabinetName]="initialCabinetName"
      (submitted)="authStore.createCabinet($event)"
      (resend)="authStore.resendEmailVerification()"
      (signOut)="authStore.signOut()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCabinetContainerComponent implements OnInit {
  protected readonly authStore = inject(AuthStore);
  protected readonly emailVerified = computed(() => this.authStore.user()?.emailVerified === true);
  protected readonly initialCabinetName = inject(AuthService).pendingCabinetName();

  ngOnInit(): void {
    this.authStore.resetStatus();
    // Le formulaire s'affiche tout seul dès que le lien est cliqué.
    if (!this.emailVerified()) this.authStore.watchEmailVerification();
  }
}
