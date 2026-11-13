import { Directive, inject, input, TemplateRef } from '@angular/core';

/** Contexte d'un gabarit de cellule : la ligne (`let-row`) et son index (`let-index="index"`). */
export interface TableCellContext<T = unknown> {
  $implicit: T;
  index: number;
}

/**
 * Gabarit d'une cellule de `app-table`, lié à une colonne par sa clé :
 *
 * ```html
 * <ng-template appTableCell="name" let-row>{{ row.lastName }}</ng-template>
 * ```
 */
@Directive({ selector: 'ng-template[appTableCell]' })
export class TableCellDirective {
  /** Clé de la colonne (`TableColumn.key`). */
  readonly column = input.required<string>({ alias: 'appTableCell' });
  readonly template = inject<TemplateRef<TableCellContext>>(TemplateRef);
}
