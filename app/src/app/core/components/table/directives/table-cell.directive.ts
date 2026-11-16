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

  /**
   * Type du contexte dans le gabarit : la ligne est typée `any` (le tableau est générique, ses lignes ne sont pas
   * connues de la directive) pour que `row.champ` soit accepté par la vérification stricte des gabarits.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static ngTemplateContextGuard(_directive: TableCellDirective, context: unknown): context is TableCellContext<any> {
    return true;
  }
}
