import { Routes } from '@angular/router';

/** Routes racines : chaque zone (commons, cabinet, super-admin) sera chargée en lazy. */
export const ROUTES: Routes = [{ path: '**', redirectTo: '' }];
