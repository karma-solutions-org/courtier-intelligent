import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DOSSIERS_STRUCTURE } from '../dossiers.structure';

/** Les 5 étapes de « Nouveau dossier » : client → produit → documents → questionnaire → récapitulatif. */
@Component({
  selector: 'app-dossier-stepper-header',
  imports: [MatIconModule],
  templateUrl: './dossier-stepper-header.component.html',
  styleUrl: './dossier-stepper-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierStepperHeaderComponent {
  /** Étape courante, de 1 à 4. */
  readonly current = input.required<number>();
  protected readonly steps = DOSSIERS_STRUCTURE.stepper.steps;
}
