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
  template: `
    <section class="card">
      <h2>{{ structure.inviteTitle }}</h2>
      <p class="seats" [class.full]="isFull()">
        {{ structure.seats }} : <strong>{{ usedSeats() }} / {{ maxUtilisateurs() }}</strong>
        · {{ structure.resetsThisMonth }} :
        <strong [class.full]="resetsExhausted()">{{ deviceResetsUsed() }} / {{ deviceResetsQuota() }}</strong>
        @if (maxAppareilsParUtilisateur() > 1) {
          · {{ structure.devicesPerUser }} : <strong>{{ maxAppareilsParUtilisateur() }}</strong>
        }
      </p>
      @if (resetsExhausted()) {
        <p class="limit" role="status">{{ structure.resetsExhausted }}</p>
      }
      @if (isFull()) {
        <p class="limit" role="status">{{ structure.limitReached }}</p>
      }
      <form [formGroup]="inviteForm" (ngSubmit)="submitInvite()" novalidate class="invite">
        <mat-form-field appearance="outline" class="invite-email">
          <mat-label>{{ structure.email }}</mat-label>
          <input matInput type="email" formControlName="email" />
          @if (inviteForm.controls.email.hasError('email')) {
            <mat-error>{{ structure.emailInvalid }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ structure.role }}</mat-label>
          <mat-select formControlName="role">
            @for (role of roles; track role.value) {
              <mat-option [value]="role.value">{{ role.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button mat-flat-button type="submit" class="invite-button" [disabled]="isPending() || isFull()">
          {{ structure.invite }}
        </button>
      </form>
      <p class="hint">{{ structure.inviteHint }}</p>
    </section>

    <section class="card">
      <h2>{{ structure.listTitle }} ({{ members().length }})</h2>
      <div class="table-scroll">
        <table>
          <!-- Quatre colonnes de même largeur (espacement régulier), plus une colonne étroite pour l'action. -->
          <colgroup>
            <col class="col-main" />
            <col class="col-main" />
            <col class="col-main" />
            <col class="col-main" />
            <col class="col-action" />
          </colgroup>
          <thead>
            <tr>
              <th>{{ structure.columns.member }}</th>
              <th class="center">{{ structure.columns.role }}</th>
              <th>{{ structure.columns.device }}</th>
              <th class="center">{{ structure.columns.status }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (member of members(); track member.id) {
              @let isMe = member.id === currentUid();
              <tr [class.inactive]="member.status === 'disabled'">
                <td>
                  <strong>{{ member.displayName || member.email }}</strong>
                  @if (isMe) {
                    <span class="me">({{ structure.you }})</span>
                  }
                  <span class="sub">{{ member.email }}</span>
                </td>
                <td class="role-cell center" [attr.data-role]="member.role">
                  <mat-select
                    class="role-select"
                    [value]="member.role"
                    [disabled]="isMe || isPending()"
                    (selectionChange)="roleChanged.emit({ uid: member.id, role: $event.value })"
                    [attr.aria-label]="structure.role"
                  >
                    @for (role of roles; track role.value) {
                      <mat-option [value]="role.value">{{ role.label }}</mat-option>
                    }
                  </mat-select>
                </td>
                <td>
                  <div class="device">
                  @let devices = devicesOf(member);
                  @if (devices.length) {
                    @for (device of devices; track device.id) {
                      <div class="bound-device">
                        <strong>{{ device.label || structure.columns.device }}</strong>
                        @if (device.boundAt) {
                          <span class="sub">{{ structure.deviceSince }} {{ device.boundAt.toMillis() | date: 'd MMM y' }}</span>
                        }
                      </div>
                    }
                    @if (member.session?.lastSeen; as lastSeen) {
                      <span class="sub">{{ structure.lastSeen }} {{ lastSeen.toMillis() | date: 'd MMM HH:mm' }}</span>
                    }
                    @if (isMe) {
                      <span class="sub">{{ structure.resetSelfHint }}</span>
                    } @else if (confirmingResetUid() === member.id) {
                      <button mat-button [disabled]="isPending()" (click)="confirmReset(member.id)">{{ structure.confirmReset }}</button>
                      <button mat-button (click)="confirmingResetUid.set(null)">{{ structure.cancelReset }}</button>
                    } @else {
                      <button mat-button [disabled]="isPending() || resetsExhausted()" (click)="confirmingResetUid.set(member.id)">
                        {{ devices.length > 1 ? structure.resetDevices : structure.resetDevice }}
                      </button>
                    }
                  } @else {
                    <span class="sub">{{ structure.noDevice }}</span>
                  }
                  </div>
                </td>
                <td class="center">
                  <span class="status" [class.disabled]="member.status === 'disabled'">
                    {{ member.status === 'active' ? structure.active : structure.disabled }}
                  </span>
                </td>
                <td class="right">
                  @if (!isMe) {
                    @let next = member.status === 'active' ? 'disabled' : 'active';
                    <button mat-button [disabled]="isPending()" (click)="statusChanged.emit({ uid: member.id, status: next })">
                      {{ member.status === 'active' ? structure.disable : structure.enable }}
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (invitations().length) {
        <h3>{{ structure.pendingTitle }}</h3>
        <ul class="pending">
          @for (invitation of invitations(); track invitation.id) {
            <li>
              <div>
                <span>{{ invitation.email }}</span>
                <span class="sub">
                  {{ roleLabel(invitation.role) }} · {{ structure.expiresOn }}
                  {{ invitation.expiresAt.toMillis() | date: 'd MMMM' }}
                </span>
              </div>
              <button mat-button [disabled]="isPending()" (click)="invitationCancelled.emit(invitation.id)">
                {{ structure.cancelInvitation }}
              </button>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styleUrl: '../settings.scss',
  styles: `
    .invite {
      display: grid;
      grid-template-columns: 1fr 200px auto;
      gap: 12px;
      align-items: start;
    }

    .invite-button {
      height: 56px;
    }

    .table-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 14px 12px;
      text-align: left;
      vertical-align: middle;
      border-bottom: 1px solid var(--ci-border);
    }

    td:first-child {
      white-space: nowrap;
    }

    th {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ci-text-muted);
    }

    .sub {
      display: block;
      font-size: 13px;
      color: var(--ci-text-muted);
    }

    .bound-device + .bound-device {
      margin-top: 2px;
    }

    .me {
      margin-left: 6px;
      color: var(--ci-text-muted);
    }

    /* Rôle : pastille à largeur fixe, texte entier (« Administrateur ») à la taille du tableau. */
    .role-select {
      width: 172px;
      --mat-select-trigger-text-size: 13px;
      --mat-select-trigger-text-weight: 600;
    }

    .status {
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 500;
      color: var(--ci-success);
      background: var(--ci-success-soft);

      &.disabled {
        color: var(--ci-text-muted);
        background: var(--mat-sys-surface-container);
      }
    }

    .inactive td {
      opacity: 0.6;
    }

    .right {
      text-align: right;
    }

    th.center,
    td.center {
      text-align: center;
    }

    /* Colonnes égales : chaque contenu est centré dans sa colonne, l'écart entre les quatre est donc le même. */
    table {
      table-layout: fixed;
      min-width: 880px;
    }

    .col-main {
      width: calc((100% - 130px) / 4);
    }

    .col-action {
      width: 130px;
    }

    th:nth-child(-n + 4),
    td:nth-child(-n + 4) {
      text-align: center;
    }

    td:first-child {
      white-space: normal;
      overflow-wrap: anywhere;
    }

    td:nth-child(3) .device {
      justify-items: center;
      margin: 0 auto;
      text-align: center;
    }

    .role-cell .role-select {
      display: inline-block;
      text-align: left;
    }

    h3 {
      margin: 24px 0 8px;
      font-size: 15px;
      font-weight: 600;
    }

    .seats {
      margin: -8px 0 12px;
      color: var(--ci-text-muted);

      &.full strong {
        color: var(--mat-sys-error);
      }
    }

    .limit {
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: 8px;
      color: var(--mat-sys-on-tertiary-container);
      background: var(--mat-sys-tertiary-container);
    }

    .pending {
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--ci-border);
      }
    }

    @media (max-width: 700px) {
      .invite {
        grid-template-columns: 1fr;
      }
    }
  
    .role-cell {
      white-space: nowrap;
    }

    .role-cell .role-select {
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
      color: var(--ci-navy-800);
      background: var(--ci-navy-100);
      box-sizing: border-box;
    }

    .role-cell[data-role='admin'] .role-select {
      background: var(--st-tarification-bg);
    }

    .role-cell[data-role='courtier'] .role-select {
      background: var(--ci-accent-soft);
    }

    /* Appareil : la carte de l'appareil, puis la dernière activité et l'aide, empilées et alignées. */
    .device {
      display: grid;
      gap: 4px;
      justify-items: start;
      min-width: 240px;

      .sub {
        max-width: 420px;
        font-size: 12px;
        line-height: 1.4;
      }
    }

    .bound-device {
      display: inline-flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--ci-border);
      background: var(--ci-navy-50);

      strong {
        font-size: 13px;
      }

      .sub {
        font-size: 12px;
      }
    }

    th {
      color: var(--ci-navy-800);
      background: var(--ci-navy-50);
    }

    .status {
      color: var(--ci-success);
      background: var(--ci-success-soft);
    }

    .limit {
      border-left: 3px solid var(--ci-warning);
      color: var(--ci-warning);
      background: var(--ci-warning-soft);
    }

    .seats strong {
      color: var(--ci-navy-900);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MembersPanelComponent {
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

  /** Appareils liés d'un membre : le premier (`device`) puis les suivants (`extraDevices`). */
  protected devicesOf(member: Member): BoundDevice[] {
    return [member.device, ...(member.extraDevices ?? [])].filter((device): device is BoundDevice => !!device);
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
