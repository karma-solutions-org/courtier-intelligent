import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideIsoDates } from './core/providers/iso-date-adapter';
import { provideInfrastructure } from './core/providers/provide-infrastructure';
import { ROUTES } from './core/routing/routes';

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      ROUTES,
      withComponentInputBinding(),
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
    provideInfrastructure(),
    { provide: LOCALE_ID, useValue: 'fr-FR' },
    // Dates affichées jj/mm/aaaa quelle que soit la langue du navigateur.
    provideIsoDates(),
    // La police chargée dans index.html est Material Symbols Outlined.
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
  ],
};
