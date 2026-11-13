import { ChangeDetectionStrategy, Component, computed, contentChildren, input, output, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableCellContext, TableCellDirective } from '../directives/table-cell.directive';
import { TableColumn } from '../models/table-column.model';

/**
 * Tableau du design system : en-tête en petites capitales, lignes séparées, survol, défilement horizontal
 * sur petit écran. Purement présentationnel : il affiche `rows` et émet `rowClick`.
 *
 * Contenu d'une cellule : `row[column.key]` par défaut, ou un gabarit `appTableCell` de même clé.
 * Le contenu projeté (`<ng-content />`) s'affiche sous le tableau : pied, défilement infini…
 *
 * ```html
 * <app-table [columns]="columns" [rows]="assures()" [trackBy]="byId" (rowClick)="open($event)">
 *   <ng-template appTableCell="name" let-row>{{ row.lastName }}</ng-template>
 * </app-table>
 * ```
 */
@Component({
  selector: 'app-table',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './table-presentation.component.html',
  styleUrl: './table-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TablePresentationComponent<T = unknown> {
  readonly columns = input.required<readonly TableColumn[]>();
  readonly rows = input.required<readonly T[]>();
  /** Identité d'une ligne pour le suivi du rendu (`@for … track`). Par défaut, la ligne elle-même. */
  readonly trackBy = input<(row: T) => unknown>((row) => row);
  /** Chargement initial : le message `loadingMessage` remplace le tableau. */
  readonly loading = input(false);
  readonly loadingMessage = input('Chargement…');
  /** Message quand `rows` est vide (après chargement). */
  readonly emptyMessage = input('Aucun élément.');
  /** Lignes cliquables (curseur, focus clavier) : émettent `rowClick`. */
  readonly clickable = input(false);
  /** Lien ouvert au clic sur une ligne (commandes de `routerLink`) ; null : ligne sans lien. */
  readonly rowLink = input<((row: T) => readonly unknown[] | string | null) | null>(null);
  /** Classe CSS ajoutée à une ligne (ex. ligne en erreur) ; à styler par le parent avec `:host ::ng-deep tr.<classe>`. */
  readonly rowClass = input<((row: T) => string | null) | null>(null);

  readonly rowClick = output<T>();

  private readonly _cells = contentChildren(TableCellDirective);

  /** Gabarit de chaque colonne, s'il y en a un. */
  protected readonly templates = computed(() => {
    const byKey = new Map<string, TemplateRef<TableCellContext>>();
    for (const cell of this._cells()) byKey.set(cell.column(), cell.template);
    return byKey;
  });

  protected valueOf(row: T, key: string): unknown {
    const value = (row as Record<string, unknown> | null)?.[key];
    return value === null || value === undefined || value === '' ? '—' : value;
  }

  protected linkOf(row: T): readonly unknown[] | string | null {
    return this.rowLink()?.(row) ?? null;
  }

  protected classOf(row: T): string | null {
    return this.rowClass()?.(row) ?? null;
  }

  protected onRowClick(row: T): void {
    if (this.clickable()) this.rowClick.emit(row);
  }
}
