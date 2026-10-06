import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideInfrastructure } from './core/providers/provide-infrastructure';
import { ROUTES } from './core/routing/routes';

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(ROUTES, withComponentInputBinding()),
    provideInfrastructure(),
    { provide: LOCALE_ID, useValue: 'fr-FR' },
  ],
};
