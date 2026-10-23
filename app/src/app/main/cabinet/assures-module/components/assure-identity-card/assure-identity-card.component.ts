import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Assure } from '@shared';
import { CabinetRouteContainerModel } from '../../../../../core/routing/cabinet-routes/cabinet-route-container.model';
import { initialsOf } from '../../util/assure-detail.utils';
import { displayName } from '../../util/assures.utils';
import { ASSURES_STRUCTURE } from '../assures.structure';

/** Carte d'identité de l'espace client : coordonnées et actions (nouveau dossier, modifier, supprimer). */
@Component({
  selector: 'app-assure-identity-card',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  // Même rôle que l'ancien <aside> : un repère pour les lecteurs d'écran.
  host: { role: 'complementary' },
  template: `
    <div class="avatar" aria-hidden="true">{{ initials() }}</div>
    <h1>{{ name() }}</h1>
    <p class="type">{{ typeLabels[assure().type] }}</p>

    <ul class="contact">
      @if (assure().siret) {
        <li><mat-icon aria-hidden="true">badge</mat-icon>{{ assure().siret }}</li>
      }
      @if (assure().email) {
        <li><mat-icon aria-hidden="true">mail</mat-icon>{{ assure().email }}</li>
      }
      @if (assure().phone) {
        <li><mat-icon aria-hidden="true">call</mat-icon>{{ assure().phone }}</li>
      }
      @if (assure().address?.city) {
        <li><mat-icon aria-hidden="true">place</mat-icon>{{ assure().address?.city }}</li>
      }
    </ul>

    <div class="actions">
      <a mat-flat-button [routerLink]="newDossierUrl" [queryParams]="{ assure: assure().id }">
        <mat-icon>create_new_folder</mat-icon>
        {{ structure.newDossier }}
      </a>
      <button mat-stroked-button type="button" (click)="editRequested.emit()" [disabled]="editing()">
        <mat-icon>edit</mat-icon>
        {{ structure.edit }}
      </button>
      @if (isAdmin()) {
        @if (confirmingDelete()) {
          <div class="confirm" role="alert">
            <p>{{ dossierCount() ? structure.deleteConfirmWithDossiers(dossierCount()) : structure.deleteConfirm }}</p>
            <div class="confirm-actions">
              <button mat-button type="button" (click)="deleteCancelled.emit()">{{ structure.deleteNo }}</button>
              <button mat-flat-button class="danger" type="button" [disabled]="isPending()" (click)="deleteConfirmed.emit()">
                {{ structure.deleteYes }}
              </button>
            </div>
          </div>
        } @else {
          <button mat-stroked-button class="danger-outline" type="button" (click)="deleteAsked.emit()">
            <mat-icon>delete</mat-icon>
            {{ structure.delete }}
          </button>
        }
      }
      @if (error() && !editing()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: 4px;
      padding: 20px 24px;
      border: 1px solid var(--ci-border);
      border-radius: 12px;
      background: var(--ci-surface);
      box-shadow: var(--ci-shadow-sm);
      text-align: center;
    }

    .avatar {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      margin-bottom: 8px;
      border: 1px solid var(--ci-border);
      border-radius: 50%;
      background: var(--ci-surface-2);
      font-size: 22px;
      font-weight: 600;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
    }

    .type {
      margin: 0;
      color: var(--ci-text-muted);
    }

    .contact {
      display: grid;
      gap: 10px;
      justify-self: stretch;
      margin: 16px 0 0;
      padding: 16px 0;
      border-top: 1px solid var(--ci-border);
      border-bottom: 1px solid var(--ci-border);
      list-style: none;
      text-align: left;

      &:empty {
        display: none;
      }

      li {
        display: flex;
        gap: 10px;
        align-items: center;
        overflow-wrap: anywhere;
      }

      mat-icon {
        flex: none;
        width: 18px;
        height: 18px;
        font-size: 18px;
        color: var(--ci-text-muted);
      }
    }

    .actions {
      display: grid;
      gap: 10px;
      justify-self: stretch;
      margin-top: 16px;

      > a,
      > button {
        width: 100%;
      }
    }

    .danger-outline {
      color: var(--ci-danger, #c62828);
    }

    .danger {
      background: var(--ci-danger, #c62828);
      color: #fff;
    }

    .confirm {
      padding: 12px;
      border: 1px solid var(--ci-danger, #c62828);
      border-radius: 8px;
      text-align: left;

      p {
        margin: 0 0 8px;
      }
    }

    .confirm-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .error {
      margin: 0;
      font-size: 13px;
      text-align: left;
      color: var(--ci-danger, #c62828);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssureIdentityCardComponent {
  readonly assure = input.required<Assure>();
  /** Nombre de dossiers du client : ils partent avec lui dans la corbeille. */
  readonly dossierCount = input(0);
  readonly isAdmin = input(false);
  readonly editing = input(false);
  readonly confirmingDelete = input(false);
  readonly isPending = input(false);
  readonly error = input<string | null>(null);

  readonly editRequested = output();
  readonly deleteAsked = output();
  readonly deleteCancelled = output();
  readonly deleteConfirmed = output();

  protected readonly structure = ASSURES_STRUCTURE.detail;
  protected readonly typeLabels = ASSURES_STRUCTURE.typeLabels;
  protected readonly newDossierUrl = CabinetRouteContainerModel.DOSSIER_NEW_ROUTE.url;
  protected readonly name = computed(() => displayName(this.assure()));
  protected readonly initials = computed(() => initialsOf(this.assure()));
}
