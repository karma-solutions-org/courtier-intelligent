import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Écran bloquant pendant la lecture d'un document : une ligne de scan passe sur l'icône. */
@Component({
  selector: 'app-reading-overlay',
  imports: [MatIconModule],
  templateUrl: './reading-overlay-presentation.component.html',
  styleUrl: './reading-overlay-presentation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadingOverlayPresentationComponent {
  readonly message = input.required<string>();
}
