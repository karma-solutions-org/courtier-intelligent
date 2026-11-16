import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { BoundDevice, Invitation, Member, MemberStatus, CabinetRole } from '@shared';
import { SETTINGS_STRUCTURE } from '../settings.structure';

@Component({
  selector: 'app-members-panel',
  imports: [DatePipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './members-panel-presentation.component.html',
  styleUrls: ['../settings.scss', './members-panel-presentation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MembersPanelPresentationComponent {
  readonly members = input<Member[]>([]);
  readonly invitations = input<Invitation[]>([]);
  /** Nombre d'utilisateurs autorisés par l'offre du cabinet (admin compris). */
  readonly maxUtilisateurs = input(3);
  /** Réinitialisations d'appareil consommées ce mois-ci et quota mensuel de l'offre. */
  readonly deviceResetsUsed = input(0);
  readonly deviceResetsQuota = input(2);
  /** Appareils qu'un utilisateur peut lier selon l'offre (affiché seulement au-delà de 1). */
  readonly maxAppareilsParUtilisateur = input(1);
  readonly currentUid = input<string | null>(null);
  readonly isPending = input(false);
  readonly invited = output<{ email: string; role: CabinetRole }>();
  readonly roleChanged = output<{ uid: string; role: CabinetRole }>();
  readonly statusChanged = output<{ uid: string; status: MemberStatus }>();
  readonly invitationCancelled = output<string>();
  readonly deviceReset = output<string>();

  protected readonly confirmingResetUid = signal<string | null>(null);
  protected readonly resetsExhausted = computed(() => this.deviceResetsUsed() >= this.deviceResetsQuota());

  /** Membres actifs + invitations en attente : une invitation réserve une place. */
  protected readonly usedSeats = computed(
    () => this.members().filter(m => m.status === 'active').length + this.invitations().length,
  );
  protected readonly isFull = computed(() => this.usedSeats() >= this.maxUtilisateurs());

  protected readonly structure = SETTINGS_STRUCTURE.members;
  protected readonly roles = SETTINGS_STRUCTURE.roles;
  protected readonly inviteForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    role: new FormControl<CabinetRole>('courtier', { nonNullable: true }),
  });

  /**
   * Appareils liés d'un membre : celui de la session en cours (session unique), sinon les anciens champs
   * `device` puis `extraDevices`.
   */
  protected devicesOf(member: Member): BoundDevice[] {
    const legacy = [member.device, ...(member.extraDevices ?? [])].filter((device): device is BoundDevice => !!device);
    if (legacy.length || !member.session) return legacy;
    return [{ id: member.session.id, label: member.session.appareil, boundAt: member.session.ouverteLe }];
  }

  protected confirmReset(uid: string): void {
    this.confirmingResetUid.set(null);
    this.deviceReset.emit(uid);
  }

  protected roleLabel(role: CabinetRole): string {
    return this.roles.find(r => r.value === role)?.label ?? role;
  }

  protected submitInvite(): void {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }
    const { email, role } = this.inviteForm.getRawValue();
    this.invited.emit({ email: email.trim().toLowerCase(), role });
    this.inviteForm.reset({ email: '', role: 'courtier' });
  }
}
