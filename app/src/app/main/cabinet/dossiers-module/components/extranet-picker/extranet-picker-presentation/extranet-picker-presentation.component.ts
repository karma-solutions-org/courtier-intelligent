import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Insurer } from '@shared';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';

/** Extranets proposés pour le dossier, à cocher : seules leurs questions seront posées. */
@Component({
  selector: 'app-extranet-picker',
  imports: [MatCheckboxModule],
  templateUrl: './extranet-picker-presentation.component.html',
  styleUrl: './extranet-picker-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtranetPickerPresentationComponent {
  readonly insurers = input.required<Insurer[]>();
  /** Identifiants des extranets cochés. */
  readonly checked = input.required<string[]>();
  readonly toggled = output<{ insurerId: string; checked: boolean }>();
  protected readonly structure = DOSSIERS_STRUCTURE.draft;
}
