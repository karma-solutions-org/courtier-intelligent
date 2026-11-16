import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DOSSIERS_STRUCTURE } from '../../dossiers.structure';

/** Les 5 étapes de « Nouveau dossier » : client → produit → extranets → documents → questionnaire. */
@Component({
  selector: 'app-dossier-stepper-header',
  imports: [MatIconModule],
  templateUrl: './dossier-stepper-header-presentation.component.html',
  styleUrl: './dossier-stepper-header-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierStepperHeaderPresentationComponent {
  /** Étape courante, de 1 à 5. */
  readonly current = input.required<number>();
  protected readonly steps = DOSSIERS_STRUCTURE.stepper.steps;
}
