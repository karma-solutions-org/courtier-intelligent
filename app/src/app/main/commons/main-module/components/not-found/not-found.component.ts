import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { LogoPresentationComponent } from '../../../../../core/components/logo/logo-presentation/logo-presentation.component';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule, LogoPresentationComponent],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
