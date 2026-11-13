import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Page provisoire des sections du menu pas encore développées (titre fourni par la route). */
@Component({
  selector: 'app-under-construction',
  imports: [MatIconModule],
  templateUrl: './under-construction.component.html',
  styleUrl: './under-construction.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnderConstructionComponent {
  /** Lié à `data.pageTitle` de la route (withComponentInputBinding). */
  readonly pageTitle = input('');
}
