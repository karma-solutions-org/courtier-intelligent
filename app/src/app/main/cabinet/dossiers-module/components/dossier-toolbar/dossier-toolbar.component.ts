import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { Dossier, Member, TERMINAL_DOSSIER_STATUSES } from '@shared';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';

/** Barre d'actions de l'en-tête d'un dossier : courtier en charge, historique, reprise, sans suite, corbeille. */
@Component({
  selector: 'app-dossier-toolbar',
  imports: [RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="assignee">
      <mat-label>{{ structure.assignedTo }}</mat-label>
      <mat-select [value]="dossier().assignedTo" (selectionChange)="assigned.emit($event.value)">
        @for (member of members(); track member.id) {
          <mat-option [value]="member.id">{{ member.displayName || member.email }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <span class="spacer"></span>

    <button mat-button type="button" [class.active]="historyOpen()" (click)="historyToggled.emit()">
      <mat-icon>history</mat-icon>{{ structure.tabs.history }}
    </button>

    @if (dossier().status === 'brouillon') {
      <a mat-stroked-button [routerLink]="[listUrl(), dossier().id, 'brouillon']">{{ structure.resume }}</a>
    }

    @if (canClose()) {
      <button mat-stroked-button type="button" [disabled]="closing()" (click)="closeRequested.emit()">
        <mat-icon>block</mat-icon>Classer sans suite
      </button>
    }

    @if (isAdmin() && !dossier().deletedAt) {
      @if (confirmingDelete()) {
        <span class="confirm" role="alert">
          Mettre ce dossier dans la corbeille ?
          <button mat-button type="button" (click)="deleteCancelled.emit()">Annuler</button>
          <button mat-flat-button class="danger" type="button" [disabled]="deleting()" (click)="deleteConfirmed.emit()">Supprimer</button>
        </span>
      } @else {
        <button mat-button type="button" class="danger-text" (click)="deleteAsked.emit()"><mat-icon>delete</mat-icon>Supprimer le dossier</button>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }

    .assignee {
      width: 240px;
      max-width: 100%;
    }

    .spacer {
      flex: 1;
    }

    .active {
      background: var(--ci-navy-50);
    }

    .danger-text {
      color: var(--ci-danger, #c62828);
    }

    .danger {
      background: var(--ci-danger, #c62828);
      color: #fff;
    }

    .confirm {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierToolbarComponent {
  readonly dossier = input.required<Dossier>();
  /** Courtiers actifs du cabinet, à qui le dossier peut être confié. */
  readonly members = input.required<Member[]>();
  /** Liste des dossiers : base du lien de reprise du brouillon. */
  readonly listUrl = input.required<string>();
  readonly isAdmin = input(false);
  readonly historyOpen = input(false);
  readonly closing = input(false);
  readonly deleting = input(false);
  readonly confirmingDelete = input(false);

  readonly assigned = output<string>();
  readonly historyToggled = output();
  readonly closeRequested = output();
  readonly deleteAsked = output();
  readonly deleteCancelled = output();
  readonly deleteConfirmed = output();

  protected readonly structure = DOSSIERS_STRUCTURE.detail;
  /** Un dossier se classe sans suite à toute étape, tant qu'il n'est pas clos ni dans la corbeille. */
  protected readonly canClose = computed(() => !TERMINAL_DOSSIER_STATUSES.includes(this.dossier().status) && !this.dossier().deletedAt);
}
