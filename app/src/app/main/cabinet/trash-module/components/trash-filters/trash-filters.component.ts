import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { TrashKind } from '../../services/trash.service';

/** Filtres de la corbeille : texte, type d'élément et période de suppression. */
@Component({
  selector: 'app-trash-filters',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  template: `
    <mat-form-field appearance="outline" class="search" subscriptSizing="dynamic">
      <mat-label>Rechercher</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input matInput type="search" [value]="query()" (input)="queryChange.emit($any($event.target).value)" (keydown.escape)="queryChange.emit('')" />
      <mat-hint>Nom du client ou référence du dossier</mat-hint>
    </mat-form-field>

    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>Afficher</mat-label>
      <mat-select [value]="kind()" (selectionChange)="kindChange.emit($event.value)">
        <mat-option value="all">Tout</mat-option>
        <mat-option value="assure">Clients</mat-option>
        <mat-option value="dossier">Dossiers</mat-option>
      </mat-select>
    </mat-form-field>

    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>Supprimé</mat-label>
      <mat-select [value]="period()" (selectionChange)="periodChange.emit($event.value)">
        <mat-option [value]="0">À tout moment</mat-option>
        <mat-option [value]="1">Aujourd'hui</mat-option>
        <mat-option [value]="7">Ces 7 derniers jours</mat-option>
        <mat-option [value]="30">Ces 30 derniers jours</mat-option>
      </mat-select>
    </mat-form-field>

    @if (hasFilters()) {
      <button mat-button type="button" class="clear" (click)="cleared.emit()"><mat-icon>filter_alt_off</mat-icon>Effacer les filtres</button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: flex-start;
    }

    mat-form-field {
      width: 200px;
    }

    .search {
      flex: 1 1 280px;
      width: auto;
      max-width: 420px;
    }

    .clear {
      margin-top: 8px;
    }

    @media (max-width: 600px) {
      mat-form-field,
      .search {
        flex: 1 1 100%;
        width: 100%;
        max-width: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashFiltersComponent {
  readonly query = input.required<string>();
  readonly kind = input.required<TrashKind | 'all'>();
  /** Période de suppression en jours (0 = toutes). */
  readonly period = input.required<number>();
  readonly hasFilters = input(false);

  readonly queryChange = output<string>();
  readonly kindChange = output<TrashKind | 'all'>();
  readonly periodChange = output<number>();
  readonly cleared = output();
}
