import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Invitation, Member, MemberStatus, CabinetRole } from '@shared';
import { SETTINGS_STRUCTURE } from '../settings.structure';

@Component({
  selector: 'app-members-panel',
  imports: [DatePipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <section class="card">
      <h2>{{ structure.inviteTitle }}</h2>
      <p class="seats" [class.full]="isFull()">
        {{ structure.seats }} : <strong>{{ usedSeats() }} / {{ maxUtilisateurs() }}</strong>
      </p>
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
          <thead>
            <tr>
              <th>{{ structure.columns.member }}</th>
              <th>{{ structure.columns.role }}</th>
              <th>{{ structure.columns.status }}</th>
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
                <td>
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
      padding: 12px 8px;
      text-align: left;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    th {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mat-sys-on-surface-variant);
    }

    .sub {
      display: block;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .me {
      margin-left: 6px;
      color: var(--mat-sys-on-surface-variant);
    }

    .role-select {
      width: 160px;
    }

    .status {
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 500;
      color: #1e7d50;
      background: #e3f5ec;

      &.disabled {
        color: var(--mat-sys-on-surface-variant);
        background: var(--mat-sys-surface-container);
      }
    }

    .inactive td {
      opacity: 0.6;
    }

    .right {
      text-align: right;
    }

    h3 {
      margin: 24px 0 8px;
      font-size: 15px;
      font-weight: 600;
    }

    .seats {
      margin: -8px 0 12px;
      color: var(--mat-sys-on-surface-variant);

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
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
    }

    @media (max-width: 700px) {
      .invite {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MembersPanelComponent {
  readonly members = input<Member[]>([]);
  readonly invitations = input<Invitation[]>([]);
  /** Nombre d'utilisateurs autorisés par l'offre du cabinet (admin compris). */
  readonly maxUtilisateurs = input(3);
  readonly currentUid = input<string | null>(null);
  readonly isPending = input(false);
  readonly invited = output<{ email: string; role: CabinetRole }>();
  readonly roleChanged = output<{ uid: string; role: CabinetRole }>();
  readonly statusChanged = output<{ uid: string; status: MemberStatus }>();
  readonly invitationCancelled = output<string>();

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
